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

// =========================================
// Pagination / candidate-pool tuning
// =========================================
const DEFAULT_PAGE_SIZE = 20;   // videos returned per request when the
                                 // client doesn't specify a limit
const MAX_PAGE_SIZE = 50;       // hard cap so a client can't ask for
                                 // the whole catalog in one request

// The ranking is done in two stages, the same way real recommender
// systems do it ("candidate generation" then "ranking"):
//
//   Stage A (cheap, indexed):  pull a bounded pool of the most
//   recent videos straight from MongoDB using an indexed sort.
//   This never scans the full collection.
//
//   Stage B (cheap, small N):  score + re-rank ONLY that pool
//   inside MongoDB's aggregation engine (native C++, not JS),
//   then skip/limit to the requested page. Only `limit` documents
//   are ever serialized and sent back to Node.
//
// This keeps the amount of work — and the amount of data pulled
// off disk and sent over the wire — proportional to the page size,
// not to the size of the whole video catalog.
const CANDIDATE_POOL_SIZE = 300;

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
        // 2. Parse pagination params
        // =========================================

        const page = Math.max(
            1,
            parseInt(req.query.page, 10) || 1
        );

        const limit = Math.min(
            MAX_PAGE_SIZE,
            Math.max(1, parseInt(req.query.limit, 10) || DEFAULT_PAGE_SIZE)
        );

        const skip = (page - 1) * limit;


        // =========================================
        // 3. Find user + get a total count in parallel.
        //    Neither one depends on the other, so there's
        //    no reason to wait for them sequentially.
        //    .lean() skips Mongoose document hydration,
        //    which is pure overhead here since we only
        //    read a couple of fields off the user.
        // =========================================

        const [find_user, total_videos] = await Promise.all([
            users.findById(decoded.id).lean(),
            videos.estimatedDocumentCount()
        ]);

        if (!find_user) {
            return res.status(404).json({
                success: false,
                message: "User not found"
            });
        }


        // =========================================
        // 4. Build a weighted interest map.
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

        // Turn { category: weight } into a Mongo $switch expression,
        // e.g. { $switch: { branches: [ { case: {$eq:["$category","Gaming"]}, then: 5 }, ... ], default: 0 } }
        // This lets MongoDB itself compute the personalization score
        // per document instead of shipping every document to Node first.
        const category_score_expr = Object.keys(category_weights).length
            ? {
                $switch: {
                    branches: Object.entries(category_weights).map(
                        ([cat, weight]) => ({
                            case: { $eq: ["$category", cat] },
                            then: weight
                        })
                    ),
                    default: 0
                }
            }
            : 0;


        // =========================================
        // 5. Rank videos entirely inside MongoDB.
        //
        //    Stage A: grab a bounded candidate pool via an
        //    INDEXED sort on createdAt (fast, no full scan).
        //    -> requires an index: videos.createIndex({ createdAt: -1 })
        //
        //    Stage B: score that small pool on 4 signals and
        //    re-sort, all natively inside the aggregation engine:
        //      - personalization (category match)
        //      - popularity (views, log-scaled so a single viral
        //        video can't dominate)
        //      - recency (fresh uploads get a fading boost)
        //      - exploration (small random noise so the order isn't
        //        100% deterministic and other categories still get
        //        a chance to surface)
        //
        //    Finally, skip/limit for the requested page. Only
        //    `limit` full documents ever leave the database.
        // =========================================

        const pipeline = [
            // Stage A: bounded, indexed candidate pool.
            { $sort: { createdAt: -1 } },
            { $limit: CANDIDATE_POOL_SIZE },

            // Stage B: score the (small) candidate pool.
            {
                $addFields: {
                    _views: { $ifNull: ["$views", 0] },
                    _createdAt: { $ifNull: ["$createdAt", "$$NOW"] }
                }
            },
            {
                $addFields: {
                    _categoryScore: category_score_expr,
                    _popularityScore: {
                        $log10: [{ $add: ["$_views", 1] }]
                    },
                    _ageInDays: {
                        $max: [
                            0,
                            {
                                $divide: [
                                    { $subtract: ["$$NOW", "$_createdAt"] },
                                    1000 * 60 * 60 * 24
                                ]
                            }
                        ]
                    }
                }
            },
            {
                $addFields: {
                    _recencyBoost: {
                        $multiply: [
                            WEIGHTS.RECENCY_MAX,
                            {
                                $max: [
                                    0,
                                    {
                                        $subtract: [
                                            1,
                                            { $divide: ["$_ageInDays", WEIGHTS.RECENCY_DECAY_DAYS] }
                                        ]
                                    }
                                ]
                            }
                        ]
                    },
                    _explorationScore: {
                        $multiply: [{ $rand: {} }, WEIGHTS.EXPLORATION_MAX]
                    }
                }
            },
            {
                $addFields: {
                    _score: {
                        $add: [
                            "$_categoryScore",
                            "$_popularityScore",
                            "$_recencyBoost",
                            "$_explorationScore"
                        ]
                    }
                }
            },
            { $sort: { _score: -1 } },
            { $skip: skip },
            { $limit: limit },

            // Strip internal scoring fields before sending the
            // response — the client never needs to see these.
            {
                $project: {
                    _views: 0,
                    _createdAt: 0,
                    _categoryScore: 0,
                    _popularityScore: 0,
                    _ageInDays: 0,
                    _recencyBoost: 0,
                    _explorationScore: 0,
                    _score: 0
                }
            }
        ];

        const ranked_videos = await videos.aggregate(pipeline);


        // =========================================
        // 6. Response
        // =========================================

        return res.status(200).json({
            success: true,
            message: has_interests ? "Personalized feed" : "Discovery feed for new user",
            videos: ranked_videos,
            pagination: {
                page,
                limit,
                total: total_videos,
                hasMore: skip + ranked_videos.length < total_videos
            },
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
