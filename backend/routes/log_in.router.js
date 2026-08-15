const express = require("express");

const router = express.Router();

const log_in_controller = require("../controllers/log_in.controller");

router.post("/api/auth/log_in",log_in_controller)

module.exports = router