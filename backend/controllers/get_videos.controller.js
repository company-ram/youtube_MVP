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
// as before: recent uploads guaranteed a shot + a random sample of the
// rest of the catalog.
const RECENT_CANDIDATE_POOL = 600;
const RANDOM_CANDIDATE_POOL = 700;

// Normalizes a category string so "Sports", " sports ", "SPORTS"
// all match each other. Prevents silent mismatches between what's
// stored on the user (your_category/search_categories) and what's
// stored on the video (category).
const normalize_category = (cat) =>
    typeof cat === "string" ? cat.trim().toLowerCase() : cat;

// Deterministic pseudo-random generator (mulberry32). Same seed always
// produces the same sequence. We use this INSTEAD OF Math.random() for
// the exploration signal so a given user's feed order is STABLE across
// requests on the same day (no videos silently jumping around on every
// refresh or page load — which would also break pagination, since a
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
        // 4.5 Explicit category browse mode.
        //
        //     When the caller passes ?category=X (the user clicked a
        //     specific category chip on the frontend), that request is
        //     no longer about personalization — it's "show me
        //     everything in this category". Return EVERY video in that
        //     category, ranked by the same score, regardless of the
        //     user's liked/searched interests.
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

            return res.status(200).json({
                success: true,
                message: `Category feed: ${requested_category}`,
                videos: ranked_category_videos,
                page: 1,
                hasMore: false,
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
        //    FIXED, small random slice of videos from
        //    OTHER categories so new/unseen categories
        //    still get discovered.
        //
        //    WITHOUT interests: fall back to the old
        //    broad discovery pool (recent uploads +
        //    random sample of the catalog), since
        //    there's no preference to match against.
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

            // Fixed-size random sample from EVERYTHING outside the
            // preferred categories. Excluding preferred_ids means this
            // never duplicates a video that's already in the list above.
            const other_videos = await videos.aggregate([
                { $match: { _id: { $nin: preferred_ids } } },
                { $sample: { size: OTHER_CATEGORY_COUNT } }
            ]);

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

            const sampled_videos = await videos.aggregate([
                { $match: { _id: { $nin: recent_ids } } },
                { $sample: { size: RANDOM_CANDIDATE_POOL } }
            ]);

            const all_videos = [...recent_videos, ...sampled_videos];
            ranked_videos = rank_by_score(all_videos);
        }


        // =========================================
        // 6. Response. No pagination - every matching
        //    video for this user (preferred categories
        //    + the fixed OTHER_CATEGORY_COUNT slice, or
        //    the full discovery pool) goes back in one
        //    response. The seeded RNG above still keeps
        //    this ranking stable for the rest of today.
        // =========================================

        return res.status(200).json({
            success: true,
            message: has_interests ? "Personalized feed" : "Discovery feed for new user",
            videos: ranked_videos,
            page: 1,
            hasMore: false,
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
