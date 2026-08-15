const express = require("express");

const router = express.Router();

const register_controller = require("../controllers/register.contoller");

router.post("/api/auth/register",register_controller)

module.exports = router