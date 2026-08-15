const express = require("express");

const router = express.Router();

const likes = require("../controllers/likes.controller");

const auth = require("../middleware/auth")

router.post("/api/auth/likes",auth,likes)

module.exports = router