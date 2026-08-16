const express = require("express");

const router = express.Router();

const get_videos = require("../controllers/get_videos.controller");

const auth = require("../middleware/auth")

router.get("/api/auth/get_videos",auth,get_videos)

module.exports = router