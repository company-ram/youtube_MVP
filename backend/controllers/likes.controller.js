require("dotenv").config();

const users = require("../models/users");
const videos = require("../models/videos");

const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");

const add_like = async (req, res) => {
    try {
        // =========================
        // 1. Verify user token
        // =========================

        const token = req.cookies?.token;

        if (!token) {
            return res.status(401).json({
                success: false,
                message: "Authentication required"
            });
        }

        let decoded;

        try {
            decoded = jwt.verify(
                token,
                process.env.JWT_PASSWORD
            );
        } catch (error) {
            return res.status(401).json({
                success: false,
                message: "Invalid or expired token"
            });
        }

        // =========================
        // 2. Validate user ID
        // =========================

        if (!decoded?.id || !mongoose.Types.ObjectId.isValid(decoded.id)) {
            return res.status(401).json({
                success: false,
                message: "Invalid user identity"
            });
        }

        // =========================
        // 3. Get request data
        // =========================

        const category = req.body.category?.trim();
        const video_id = req.body.video_id?.trim();

        if (!category || !video_id) {
            return res.status(400).json({
                success: false,
                message: "Category and video_id are required"
            });
        }

        // =========================
        // 4. Validate video ID
        // =========================

        if (!mongoose.Types.ObjectId.isValid(video_id)) {
            return res.status(400).json({
                success: false,
                message: "Invalid video_id"
            });
        }

        // =========================
        // 5. Find user
        // =========================

        const find_user = await users.findById(decoded.id);

        if (!find_user) {
            return res.status(404).json({
                success: false,
                message: "User not found"
            });
        }

        // =========================
        // 6. Find video
        // =========================

        const find_video = await videos.findById(video_id);

        if (!find_video) {
            return res.status(404).json({
                success: false,
                message: "Video not found"
            });
        }

        // =========================
        // 7. Make sure likes is a number
        // =========================

        const current_likes = Number(find_video.likes);

        if (!Number.isFinite(current_likes)) {
            return res.status(500).json({
                success: false,
                message: "Video likes value is invalid"
            });
        }

        // =========================
        // 8. Add category only once
        // =========================

        if (!find_user.your_category.includes(category)) {
            find_user.your_category.push(category);

            await find_user.save();
        }

        // =========================
        // 9. Increase likes
        // =========================

        const updated_video = await videos.findByIdAndUpdate(
            video_id,
            {
                $inc: {
                    likes: 1
                }
            },
            {
                returnDocument: "after",
                runValidators: true
            }
        );

        if (!updated_video) {
            return res.status(404).json({
                success: false,
                message: "Video not found"
            });
        }

        // =========================
        // 10. Success response
        // =========================

        return res.status(200).json({
            success: true,
            message: "Added like successfully",
            likes: updated_video.likes
        });
    }

    catch (error) {
        console.error("Add like error:", error);

        return res.status(500).json({
            success: false,
            message: "Internal server error"
        });
    }
};

module.exports = add_like;