const express = require("express");

const router = express.Router();

const create_videos = require("../controllers/create_videos.controller");

const auth = require("../middleware/auth")

router.post("/api/auth/create_videos",auth,create_videos)

module.exports = router