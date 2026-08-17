const express = require("express");

const router = express.Router();

const create_new_channel = require("../controllers/channels.controller");

const auth = require("../middleware/auth")

router.post("/api/auth/channels",auth,create_new_channel)

module.exports = router