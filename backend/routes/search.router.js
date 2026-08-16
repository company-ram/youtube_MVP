const express = require("express");

const router = express.Router();

const search_videos = require("../controllers/search_videos.controller");

const auth = require("../middleware/auth")

router.get("/api/auth/search_videos",auth,search_videos)

module.exports = router