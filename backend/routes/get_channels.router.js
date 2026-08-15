const express = require("express");

const router = express.Router();

const get_channels = require("../controllers/get_channels.controller");

const auth = require("../middleware/auth")

router.get("/api/auth/get_channels",auth,get_channels)

module.exports = router