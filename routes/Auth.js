const express = require("express");
const router = express.Router();
require("dotenv").config();
const jwt = require("jsonwebtoken");
const { generateAccessToken } = require("../services/AuthService");
const {sendResetEmail} = require ("../services/NodeMailer");
const pool = require("../db");
const bcrypt = require("bcrypt");


router.post("/token", (req, res) => {
  const { refreshToken } = req.body;

  if (!refreshToken) {
    return res.status(401).json({ error: "Refresh token required" });
  }

  jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET, (err, user) => {
    if (err) {
      return res
        .status(403)
        .json({ error: "Invalid or expired refresh token" });
    }

    const newAccessToken = generateAccessToken({ user });
    res.json({ accessToken: newAccessToken });
  });
});

router.post("/forgot-password", async (req, res) => {
  const { email } = req.body;
  const user = await pool.query(
    "Select * from users where email = $1 and archived = false and verified = true", [email] );
  if (user.rows.length === 0) {
    return res.status(400).json({ message: "User not found" });
  }

  const token = jwt.sign(user.rows[0], process.env.JWT_SECRET, {
    expiresIn: "15m",
  });
  try {
    sendResetEmail(token, email);
    res.status(200).json({ message: "Password reset email sent" });
  } catch (error) {
    res.status(500).json({ message: "Error sending email" });
  }
});

router.post("/reset-password", async (req, res) => {
  const { password, token } = req.body;

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await pool.query("select * from users where id = $1 and verified = true and archived = false;",[decoded.id]);
    if (!user) {
      return res.status(400).json({ message: "Invalid token" });
    }
    const hashedPassword = await bcrypt.hash(password, 10);
    console.log(hashedPassword);
    await pool.query("BEGIN");
    await pool.query("update users set password = $1 where id = $2",[hashedPassword,decoded.id]);
    await pool.query("COMMIT");
    return res.status(200).json({ message: "Password reset successfully" });
  } catch (err) {
    await pool.query("ROLLBACK");
    return res.status(500).json({ message: "Failed to reset password" });
  }
});
module.exports = router;