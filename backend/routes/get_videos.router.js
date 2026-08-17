const express = require("express");

const router = express.Router();

const { get_all_videos, get_video_by_id } = require("../controllers/get_videos.controller");

const auth = require("../middleware/auth")

router.get("/api/auth/get_videos",auth,get_all_videos)
router.get("/api/auth/get_video/:id",auth,get_video_by_id)

module.exports = router
