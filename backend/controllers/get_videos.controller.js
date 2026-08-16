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

            return { video, score };
        });

        scored_videos.sort((a, b) => b.score - a.score);

        const ranked_videos = scored_videos.map(item => item.video);


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
