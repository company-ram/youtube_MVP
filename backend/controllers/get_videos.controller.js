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
    EXPLORATION_MAX: 4,     // random noise so ordering isn't pure popularity
    VIEWS_WEIGHT: 1,        // multiplier on log10(views)
    LIKES_WEIGHT: 2         // multiplier on log10(likes) - a like takes more
                             // effort than a passive view, so it counts more
};

// Fixed number of "other category" videos to append AFTER all of the
// user's preferred-category videos. Per product request: show the user
// EVERYTHING from categories they like/search, plus a small fixed slice
// of unrelated stuff so other categories still get discovered.
const OTHER_CATEGORY_COUNT = 20;

// Only used for the NO-PREFERENCES fallback (brand new user with no
// liked/searched categories yet) — a broad discovery pool, same idea
// as before: recent uploads guaranteed a shot + a sample of the rest
// of the catalog.
const RECENT_CANDIDATE_POOL = 600;
const RANDOM_CANDIDATE_POOL = 700;

// =========================================
// Candidate pools for the two spots that used to rely on MongoDB's
// $sample (true random, re-rolled on EVERY single request).
//
// That was fine back when the whole feed went out in one response,
// but now that the feed is paginated (see below), $sample becomes a
// bug: asking for page 2 would hand back a totally different random
// slice than page 1 saw, silently duplicating some videos the user
// already scrolled past and skipping others entirely.
//
// Fix: pull a bounded, DETERMINISTIC candidate pool straight from the
// DB (same query -> same docs, every time), then reorder it with the
// same seeded per-user-per-day RNG used for the exploration score
// below (see seeded_shuffle). That keeps these two "random" buckets
// IDENTICAL across every page request for the rest of today, while
// still reshuffling day to day. Each pool is sized larger than what's
// actually used so there's still real variety to shuffle through.
// =========================================
const OTHER_CATEGORY_CANDIDATE_POOL = 500;   // pool OTHER_CATEGORY_COUNT is picked from
const DISCOVERY_CANDIDATE_POOL = 3000;       // pool RANDOM_CANDIDATE_POOL is picked from

// =========================================
// Pagination
// =========================================
// The feed still has to be scored/ranked entirely in memory (the
// ranking mixes DB fields with a per-user seeded RNG, which Mongo
// can't sort by on its own) but the RESPONSE is now sliced into
// pages, so the client never has to download the whole ranked list
// in one shot — it only asks for more once the user actually scrolls
// far enough to need it.
const DEFAULT_PAGE_SIZE = 24;
const MAX_PAGE_SIZE = 50;

const parse_pagination = (req) => {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const requested_limit = parseInt(req.query.limit, 10) || DEFAULT_PAGE_SIZE;
    const limit = Math.min(MAX_PAGE_SIZE, Math.max(1, requested_limit));
    return { page, limit };
};

// Slices a fully-ranked list into the requested page. hasMore tells
// the frontend whether it's worth asking for page + 1 later.
const paginate = (ranked_list, page, limit) => {
    const total = ranked_list.length;
    const start = (page - 1) * limit;
    const items = ranked_list.slice(start, start + limit);
    const hasMore = start + items.length < total;
    return { items, hasMore, total };
};

// Normalizes a category string so "Sports", " sports ", "SPORTS"
// all match each other. Prevents silent mismatches between what's
// stored on the user (your_category/search_categories) and what's
// stored on the video (category).
const normalize_category = (cat) =>
    typeof cat === "string" ? cat.trim().toLowerCase() : cat;

// Deterministic pseudo-random generator (mulberry32). Same seed always
// produces the same sequence. We use this INSTEAD OF Math.random() (and
// instead of $sample - see the candidate pool comment above) so a given
// user's feed order AND content is STABLE across requests on the same
// day (no videos silently jumping around or duplicating between page
// loads, which would break pagination), but the order still reshuffles
// day to day so exploration stays fresh.
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

// Fisher-Yates shuffle driven by the seeded RNG above, instead of
// Math.random()/$sample. Used anywhere a "random" subset needs to
// stay identical across paginated requests within the same day.
const seeded_shuffle = (array, rng) => {
    const shuffled = array.slice();
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
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
        // 4. Scoring helper — same 3 signals as
        //    before (popularity, recency, exploration)
        //    plus the category-match weight when it
        //    applies. Used to ORDER each pool, not to
        //    decide which pool a video belongs to.
        // =========================================

        const now = Date.now();
        const today_str = new Date(now).toISOString().slice(0, 10); // YYYY-MM-DD
        const rng = mulberry32(hash_to_seed(`${decoded.id}-${today_str}`));

        const score_video = (video) => {
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

            return score;
        };

        const rank_by_score = (video_list) =>
            video_list
                .map(video => ({ video, score: score_video(video) }))
                .sort((a, b) => b.score - a.score)
                .map(item => item.video);


        // =========================================
        // 4.5 Read pagination params once, shared by
        //     every branch below (category browse,
        //     personalized feed, discovery feed).
        // =========================================

        const { page, limit } = parse_pagination(req);


        // =========================================
        // 4.6 Explicit category browse mode.
        //
        //     When the caller passes ?category=X (the user clicked a
        //     specific category chip on the frontend), that request is
        //     no longer about personalization — it's "show me
        //     everything in this category". Return EVERY video in that
        //     category, ranked by the same score, regardless of the
        //     user's liked/searched interests — but still paginated,
        //     same as every other branch below.
        //
        //     Without this, the frontend can only filter over whatever
        //     small slice of "other" videos happened to already be in
        //     the personalized feed (see OTHER_CATEGORY_COUNT above),
        //     which silently hides most of the catalog for any
        //     non-preferred category. This bypasses that limit
        //     entirely for an explicit category request.
        // =========================================

        const requested_category = typeof req.query.category === "string"
            ? req.query.category.trim()
            : "";

        if (requested_category && requested_category.toLowerCase() !== "all") {
            const normalized_requested = normalize_category(requested_category);

            const category_videos = await videos.aggregate([
                {
                    $addFields: {
                        __normalized_category: {
                            $toLower: { $trim: { input: { $ifNull: ["$category", ""] } } }
                        }
                    }
                },
                { $match: { __normalized_category: normalized_requested } },
                { $project: { __normalized_category: 0 } }
            ]);

            const ranked_category_videos = rank_by_score(category_videos);
            const { items, hasMore, total } = paginate(ranked_category_videos, page, limit);

            return res.status(200).json({
                success: true,
                message: `Category feed: ${requested_category}`,
                videos: items,
                page,
                hasMore,
                totalVideos: total,
                preferredCategories: Object.keys(category_weights)
            });
        }


        // =========================================
        // 5. Build the personalized/discovery feed
        //    (only reached when no ?category= was
        //    requested above).
        //
        //    WITH interests: pull EVERY video whose
        //    category matches something the user
        //    likes/searched (no sampling — this is
        //    the full set), rank it, then append a
        //    FIXED, small deterministic-per-day slice
        //    of videos from OTHER categories so
        //    new/unseen categories still get discovered.
        //
        //    WITHOUT interests: fall back to the old
        //    broad discovery pool (recent uploads +
        //    a deterministic-per-day sample of the
        //    catalog), since there's no preference to
        //    match against.
        // =========================================

        let ranked_videos;

        if (has_interests) {
            const preferred_keys = Object.keys(normalized_weight_lookup);

            // Normalize the category on each video INSIDE the pipeline
            // (trim + lowercase) so this matches normalize_category()
            // above exactly — "Sports" / " sports " / "SPORTS" all count.
            const preferred_videos = await videos.aggregate([
                {
                    $addFields: {
                        __normalized_category: {
                            $toLower: { $trim: { input: { $ifNull: ["$category", ""] } } }
                        }
                    }
                },
                { $match: { __normalized_category: { $in: preferred_keys } } },
                { $project: { __normalized_category: 0 } }
            ]);

            const preferred_ids = preferred_videos.map(v => v._id);

            // Bounded, deterministic pool of everything OUTSIDE the
            // preferred categories, then a seeded shuffle picks the
            // fixed OTHER_CATEGORY_COUNT slice out of it. Same slice
            // every time today, on every page - see the pool comment
            // near the top of the file for why this replaced $sample.
            const other_candidates = await videos
                .find({ _id: { $nin: preferred_ids } })
                .limit(OTHER_CATEGORY_CANDIDATE_POOL)
                .lean();

            const other_videos = seeded_shuffle(other_candidates, rng)
                .slice(0, OTHER_CATEGORY_COUNT);

            // All liked/searched-category videos first (best-scored
            // first), then the small slice of other-category videos
            // appended at the end.
            ranked_videos = [
                ...rank_by_score(preferred_videos),
                ...rank_by_score(other_videos)
            ];
        } else {
            // No preferences yet -> plain discovery feed.
            const recent_videos = await videos
                .find({})
                .sort({ createdAt: -1 })
                .limit(RECENT_CANDIDATE_POOL)
                .lean();

            const recent_ids = recent_videos.map(v => v._id);

            // Same idea as other_videos above: a bounded, deterministic
            // candidate pool, seeded-shuffled, then trimmed down to
            // RANDOM_CANDIDATE_POOL - identical selection across every
            // page request for the rest of today.
            const discovery_candidates = await videos
                .find({ _id: { $nin: recent_ids } })
                .limit(DISCOVERY_CANDIDATE_POOL)
                .lean();

            const sampled_videos = seeded_shuffle(discovery_candidates, rng)
                .slice(0, RANDOM_CANDIDATE_POOL);

            const all_videos = [...recent_videos, ...sampled_videos];
            ranked_videos = rank_by_score(all_videos);
        }


        // =========================================
        // 6. Paginated response. Only this page's
        //    slice of the ranked list goes back to
        //    the client - hasMore tells the frontend
        //    whether there's a page + 1 worth asking
        //    for later (see infinite scroll on the
        //    home page). The seeded RNG above keeps
        //    the full ranking (and therefore every
        //    page's contents) stable for the rest of
        //    today, so scrolling further never repeats
        //    or skips a video.
        // =========================================

        const { items, hasMore, total } = paginate(ranked_videos, page, limit);

        return res.status(200).json({
            success: true,
            message: has_interests ? "Personalized feed" : "Discovery feed for new user",
            videos: items,
            page,
            hasMore,
            totalVideos: total,
            // Categories the user actually likes/searched before. Use this
            // to highlight/pin those categories in the UI - but don't use
            // it to strip out videos NOT in this list from the default
            // feed. This ranking algorithm already deliberately mixes in
            // "other" categories (see OTHER_CATEGORY_COUNT above); filtering
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

// =========================================
// GET a single video by its id.
//
// Used by the watch page to load the EXACT video it needs directly,
// instead of hoping that video happens to be inside whatever slice
// the personalized/category feed above returned. Any video that
// exists can be opened directly this way, regardless of whether it
// would rank into the current user's feed.
// =========================================

const get_video_by_id = async (req, res) => {
    try {

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

        const { id } = req.params;

        if (!id) {
            return res.status(400).json({
                success: false,
                message: "Video id is required"
            });
        }

        let video;

        try {
            video = await videos.findById(id).lean();
        } catch (error) {
            // Malformed id (not a valid ObjectId, etc.) - treat as
            // "not found" rather than a 500, same as a missing doc.
            return res.status(404).json({
                success: false,
                message: "Video not found"
            });
        }

        if (!video) {
            return res.status(404).json({
                success: false,
                message: "Video not found"
            });
        }

        return res.status(200).json({
            success: true,
            video
        });

    } catch (e) {

        console.error("Get video by id error:", e);

        return res.status(500).json({
            success: false,
            message: "Internal server error"
        });
    }
};

module.exports = {
    get_all_videos,
    get_video_by_id
};
