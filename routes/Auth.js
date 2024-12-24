const express = require("express");
const router = express.Router();
require("dotenv").config();
const jwt = require("jsonwebtoken");
const { generateAccessToken } = require("../services/AuthService");

router.post("/token", (req, res) => {
  const { refreshToken } = req.body;

  if (!refreshToken) {
    return res.status(401).json({ error: "Refresh token required" });
  }

  jwt.verify(refreshToken, JWT_REFRESH_SECRET, (err, user) => {
    if (err) {
      return res
        .status(403)
        .json({ error: "Invalid or expired refresh token" });
    }

    const newAccessToken = generateAccessToken({ user });
    res.json({ accessToken: newAccessToken });
  });
});

module.exports = router;