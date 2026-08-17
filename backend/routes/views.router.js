const express = require("express");

const router = express.Router();

const views = require("../controllers/views.controller");

const auth = require("../middleware/auth")

router.post("/api/auth/views",auth,views)

module.exports = router