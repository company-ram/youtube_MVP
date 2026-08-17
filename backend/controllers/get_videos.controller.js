require("dotenv").config();

const users = require("../models/users");
const videos = require("../models/videos");

const jwt = require("jsonwebtoken");

// =========================================
// Tunable weights for the ranking algorithm
// =========================================
const WEIGHTS = {
    LIKED_CATEGORY: 5,      // user actively liked this category
    SEARCHED_CATEGORY: 2,   // user only searched this category before
    RECENCY_MAX: 5,         // max boost for a brand new video
    RECENCY_DECAY_DAYS: 30, // recency boost fades out over ~30 days
    EXPLORATION_MAX: 4,     // random noise so new/other categories can surface
    VIEWS_WEIGHT: 1,        // multiplier on log10(views)
    LIKES_WEIGHT: 2         // multiplier on log10(likes) - a like takes more
                             // effort than a passive view, so it counts more
};

// Fraction of the feed that must come from the user's preferred
// categories (liked/searched). The rest is filled with videos from
// OTHER categories so new/unseen categories keep surfacing.
const PREFERRED_FEED_RATIO = 0.5; // 50% preferred, 50% exploration

// Page size. Capping this makes the ratio's effect visible across
// each page instead of only the first few items before the (usually
// much smaller) preferred pool runs out.
const FEED_LIMIT = 40;

// How many candidate videos we pull before ranking. Split between a
// "recent" slice (so brand-new uploads are ALWAYS in the running,
// regardless of MongoDB's natural document order) and a random
// sample of the rest of the catalog (so older/less-viewed videos
// still get a fair shot at being discovered instead of the pool
// always being e.g. "whatever 500 docs come back first").
const RECENT_CANDIDATE_POOL = 300;
const RANDOM_CANDIDATE_POOL = 200;

// Normalizes a category string so "Sports", " sports ", "SPORTS"
// all match each other. Prevents silent mismatches between what's
// stored on the user (your_category/search_categories) and what's
// stored on the video (category).
const normalize_category = (cat) =>
    typeof cat === "string" ? cat.trim().toLowerCase() : cat;

// Distributes two already-sorted arrays into one list, keeping each
// array's internal order, while respecting an overall target ratio
// for how often items from `primary` should appear vs `secondary`.
// e.g. ratio 0.9 -> roughly 9 primary items for every 1 secondary item.
const interleave_by_ratio = (primary, secondary, ratio) => {
    const result = [];
    let i = 0;
    let j = 0;
    let primary_taken = 0;
    let secondary_taken = 0;

    while (i < primary.length || j < secondary.length) {
        const total_taken = primary_taken + secondary_taken;
        const target_primary = (total_taken + 1) * ratio;

        const should_take_primary =
            i < primary.length &&
            (j >= secondary.length || primary_taken < target_primary);

        if (should_take_primary) {
            result.push(primary[i]);
            i += 1;
            primary_taken += 1;
        } else {
            result.push(secondary[j]);
            j += 1;
            secondary_taken += 1;
        }
    }

    return result;
};

// Deterministic pseudo-random generator (mulberry32). Same seed always
// produces the same sequence. We use this INSTEAD OF Math.random() for
// the exploration signal so a given user's feed order is STABLE across
// requests on the same day (no videos silently jumping around on every
// refresh or page load - which would also break pagination, since a
// video could appear on page 1 AND page 2 depending on when you asked),
// but the order still reshuffles day to day so exploration stays fresh.
const mulberry32 = (seed) => {
    let a = seed;
    return () => {
        a |= 0;
        a = (a + 0x6D2B79F5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
};

const hash_to_seed = (str) => {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = (Math.imul(31, hash) + str.charCodeAt(i)) | 0;
    }
    return hash;
};

const get_all_videos = async (req, res) => {
    try {

        // =========================================
        // 1. Verify user token
        // =========================================

        let decoded;

        try {
            decoded = jwt.verify(
                req.cookies.token,
                process.env.JWT_PASSWORD
            );
        } catch (error) {
            return res.status(401).json({
                success: false,
                message: "Invalid or expired token"
            });
        }

        if (!decoded?.id) {
            return res.status(401).json({
                success: false,
                message: "Invalid token"
            });
        }


        // =========================================
        // 2. Find user
        // =========================================

        const find_user = await users.findById(decoded.id);

        if (!find_user) {
            return res.status(404).json({
                success: false,
                message: "User not found"
            });
        }


        // =========================================
        // 3. Build a weighted interest map.
        //    A "like" is a stronger signal than a
        //    "search", so it gets a bigger weight.
        //    A category the user both liked AND
        //    searched stacks both weights.
        // =========================================

        const liked_categories = Array.isArray(find_user.your_category)
            ? find_user.your_category
            : [];

        const searched_categories = Array.isArray(find_user.search_categories)
            ? find_user.search_categories
            : [];

        const category_weights = {};

        for (const cat of liked_categories) {
            category_weights[cat] = (category_weights[cat] || 0) + WEIGHTS.LIKED_CATEGORY;
        }

        for (const cat of searched_categories) {
            category_weights[cat] = (category_weights[cat] || 0) + WEIGHTS.SEARCHED_CATEGORY;
        }

        // Same weights, but keyed by normalized category name so a video
        // with category "Sports" still matches a user preference stored
        // as " sports" or "SPORTS". This is what scoring/matching uses;
        // `category_weights` above stays as-is for the preferredCategories
        // response field (original casing the frontend already expects).
        const normalized_weight_lookup = {};

        for (const [cat, weight] of Object.entries(category_weights)) {
            const key = normalize_category(cat);
            normalized_weight_lookup[key] = (normalized_weight_lookup[key] || 0) + weight;
        }

        const has_interests = Object.keys(category_weights).length > 0;


        // =========================================
        // 4. Always pull from a broad slice of the
        //    FULL catalog, never just the user's
        //    favorite categories, so every category
        //    stays reachable and the feed never turns
        //    into a filter bubble.
        //
        //    We combine:
        //      - the most recent N uploads (explicitly
        //        sorted, so brand-new videos are never
        //        at the mercy of Mongo's natural order)
        //      - a truly random sample of the rest of
        //        the catalog (so older/rarely-surfaced
        //        videos still get a shot at being seen)
        // =========================================

        const recent_videos = await videos
            .find({})
            .sort({ createdAt: -1 })
            .limit(RECENT_CANDIDATE_POOL)
            .lean();

        const recent_ids = recent_videos.map(v => v._id);

        const sampled_videos = await videos.aggregate([
            { $match: { _id: { $nin: recent_ids } } },
            { $sample: { size: RANDOM_CANDIDATE_POOL } }
        ]);

        const all_videos = [...recent_videos, ...sampled_videos];


        // =========================================
        // 5. Score every video on 4 independent
        //    signals, then rank by total score:
        //      - personalization (category match)
        //      - popularity (views + likes, log-scaled
        //        so a single viral video can't dominate;
        //        likes weighted higher since liking takes
        //        more effort than a passive view)
        //      - recency (fresh uploads get a fading
        //        boost)
        //      - exploration (small, per-user/per-day
        //        deterministic noise so the order isn't
        //        pure popularity and other categories
        //        still get a chance to surface - without
        //        reshuffling on every single refresh)
        // =========================================

        const now = Date.now();
        const today_str = new Date(now).toISOString().slice(0, 10); // YYYY-MM-DD
        const rng = mulberry32(hash_to_seed(`${decoded.id}-${today_str}`));

        const scored_videos = all_videos.map(video => {
            let score = 0;

            const video_category_key = normalize_category(video.category);
            const matched_weight = video_category_key
                ? (normalized_weight_lookup[video_category_key] || 0)
                : 0;

            if (matched_weight > 0) {
                score += matched_weight;
            }

            const views = Number(video.views) || 0;
            const likes = Number(video.likes) || 0;
            score += WEIGHTS.VIEWS_WEIGHT * Math.log10(views + 1);
            score += WEIGHTS.LIKES_WEIGHT * Math.log10(likes + 1);

            const createdAt = video.createdAt ? new Date(video.createdAt).getTime() : now;
            const ageInDays = Math.max(0, (now - createdAt) / (1000 * 60 * 60 * 24));
            const recencyBoost = WEIGHTS.RECENCY_MAX * Math.max(0, 1 - ageInDays / WEIGHTS.RECENCY_DECAY_DAYS);
            score += recencyBoost;

            score += rng() * WEIGHTS.EXPLORATION_MAX;

            const is_preferred = matched_weight > 0;

            return { video, score, is_preferred };
        });

        let ranked_videos;

        if (has_interests) {
            // Split into two pools so we can control the mix explicitly,
            // instead of letting a single blended score decide it.
            const preferred_pool = scored_videos
                .filter(item => item.is_preferred)
                .sort((a, b) => b.score - a.score)
                .map(item => item.video);

            const other_pool = scored_videos
                .filter(item => !item.is_preferred)
                .sort((a, b) => b.score - a.score)
                .map(item => item.video);

            ranked_videos = interleave_by_ratio(preferred_pool, other_pool, PREFERRED_FEED_RATIO);
        } else {
            // No preferences yet -> plain discovery feed, no ratio to enforce.
            scored_videos.sort((a, b) => b.score - a.score);
            ranked_videos = scored_videos.map(item => item.video);
        }

        // =========================================
        // 6. Paginate. The seeded RNG above keeps
        //    this ranking stable for the rest of
        //    today, so slicing by page never skips
        //    or repeats items the way it would with
        //    a plain Math.random() re-rolled per call.
        // =========================================

        const requested_page = parseInt(req.query.page, 10);
        const page = Number.isInteger(requested_page) && requested_page > 0 ? requested_page : 1;
        const offset = (page - 1) * FEED_LIMIT;

        const paged_videos = ranked_videos.slice(offset, offset + FEED_LIMIT);
        const has_more = offset + FEED_LIMIT < ranked_videos.length;


        // =========================================
        // 7. Response
        // =========================================

        return res.status(200).json({
            success: true,
            message: has_interests ? "Personalized feed" : "Discovery feed for new user",
            videos: paged_videos,
            page,
            hasMore: has_more,
            // Categories the user actually likes/searched before. Use this
            // to highlight/pin those categories in the UI - but don't use
            // it to strip out videos NOT in this list from the default
            // feed. This ranking algorithm already deliberately mixes in
            // "other" categories (see PREFERRED_FEED_RATIO above); filtering
            // them back out client-side would silently cancel that logic.
            preferredCategories: Object.keys(category_weights)
        });

    } catch (e) {

        console.error("Get videos error:", e);

        return res.status(500).json({
            success: false,
            message: "Internal server error"
        });
    }
};

module.exports = get_all_videos;