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
    EXPLORATION_MAX: 4      // random noise so new/other categories can surface
};

// Fraction of the feed that must come from the user's preferred
// categories (liked/searched). The rest is filled with videos from
// OTHER categories so new/unseen categories keep surfacing.
const PREFERRED_FEED_RATIO = 0.5; // 50% preferred, 50% exploration

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

        const has_interests = Object.keys(category_weights).length > 0;


        // =========================================
        // 4. Always pull from the FULL catalog, never
        //    just the user's favorite categories, so
        //    every category stays reachable and the
        //    feed never turns into a filter bubble.
        // =========================================

        const all_videos = await videos
            .find({})
            .limit(500)
            .lean();


        // =========================================
        // 5. Score every video on 4 independent
        //    signals, then rank by total score:
        //      - personalization (category match)
        //      - popularity (views, log-scaled so a
        //        single viral video can't dominate)
        //      - recency (fresh uploads get a fading
        //        boost)
        //      - exploration (small random noise so
        //        the order isn't 100% deterministic
        //        and other categories still get a
        //        chance to surface)
        // =========================================

        const now = Date.now();

        const scored_videos = all_videos.map(video => {
            let score = 0;

            if (video.category && category_weights[video.category]) {
                score += category_weights[video.category];
            }

            const views = Number(video.views) || 0;
            score += Math.log10(views + 1);

            const createdAt = video.createdAt ? new Date(video.createdAt).getTime() : now;
            const ageInDays = Math.max(0, (now - createdAt) / (1000 * 60 * 60 * 24));
            const recencyBoost = WEIGHTS.RECENCY_MAX * Math.max(0, 1 - ageInDays / WEIGHTS.RECENCY_DECAY_DAYS);
            score += recencyBoost;

            score += Math.random() * WEIGHTS.EXPLORATION_MAX;

            const is_preferred = Boolean(video.category && category_weights[video.category]);

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

            // TEMP DEBUG — احذف السطر ده بعد ما تتأكد من السبب
            console.log(`[feed debug] total=${all_videos.length} preferred=${preferred_pool.length} other=${other_pool.length} ratio=${PREFERRED_FEED_RATIO}`);

            ranked_videos = interleave_by_ratio(preferred_pool, other_pool, PREFERRED_FEED_RATIO);
        } else {
            // No preferences yet -> plain discovery feed, no ratio to enforce.
            scored_videos.sort((a, b) => b.score - a.score);
            ranked_videos = scored_videos.map(item => item.video);
        }


        // =========================================
        // 6. Response
        // =========================================

        return res.status(200).json({
            success: true,
            message: has_interests ? "Personalized feed" : "Discovery feed for new user",
            videos: ranked_videos,
            // Categories the user actually likes/searched before. The
            // frontend uses this to show ONLY these categories on the
            // default "All" view (no category picked, no search typed),
            // while still allowing the user to browse every other
            // category/search freely when they explicitly ask for it.
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
