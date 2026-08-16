require("dotenv").config();

const users = require("../models/users");
const videos = require("../models/videos");

const jwt = require("jsonwebtoken");

const search_videos = async (req, res) => {
    try {

        // ==============================
        // 1. Verify token
        // ==============================

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


        // ==============================
        // 2. Get search query
        // ==============================

        const search = req.query.q?.trim();

        if (!search) {
            return res.status(400).json({
                success: false,
                message: "Search query is required"
            });
        }


        // ==============================
        // 3. Find user
        // ==============================

        const find_user = await users.findById(decoded.id);

        if (!find_user) {
            return res.status(404).json({
                success: false,
                message: "User not found"
            });
        }


        // ==============================
        // 4. Search ALL videos
        // ==============================

        const found_videos = await videos.find({
            $or: [
                {
                    title: {
                        $regex: search,
                        $options: "i"
                    }
                },
                {
                    description: {
                        $regex: search,
                        $options: "i"
                    }
                },
                {
                    category: {
                        $regex: search,
                        $options: "i"
                    }
                }
            ]
        }).limit(100);


        // ==============================
        // 5. Get categories
        // ==============================

        const found_categories = [
            ...new Set(
                found_videos
                    .map(video => video.category)
                    .filter(Boolean)
            )
        ];


        // ==============================
        // 6. Save searched categories
        // ==============================

        if (!Array.isArray(find_user.search_categories)) {
            find_user.search_categories = [];
        }

        for (const category of found_categories) {

            if (!find_user.search_categories.includes(category)) {
                find_user.search_categories.push(category);
            }
        }

        await find_user.save();


        // ==============================
        // 7. Response
        // ==============================

        return res.status(200).json({
            success: true,
            message: "Search results",
            videos: found_videos
        });

    } catch (error) {

        console.error("Search videos error:", error);

        return res.status(500).json({
            success: false,
            message: "Internal server error"
        });
    }
};

module.exports = search_videos;