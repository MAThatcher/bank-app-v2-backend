const express = require("express");
const router = express.Router();
const pool = require("../db");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
require("dotenv").config();
const { generateAccessToken, generateRefreshToken, authenticateToken } = require("../services/AuthService");

//delete user
router.delete("/:email", authenticateToken, async (req, res) => {
  const { email } = req.params;
  try {
    const token = req.headers["authorization"]?.split(" ")[1];
    if (!token) {
      return res.status(401).json({ error: "Access token required" });
    }
    let valid = false;
    jwt.verify(token, `${process.env.JWT_SECRET}`, (err, user) => {
      if (user.user.email === email) {
        valid = true;
      } else {
        return res.status(401).json({ error: "Unauthorized. Not your account." });
      }
      req.user = user;
    });
    if (valid) {
      await pool.query("BEGIN");
      await pool.query(
        "UPDATE users SET email = NULL,archived = true,archived_email = $1,super_user = false, password = 'DELETED', update_date = current_timestamp where email = $2;",
        [email, email]
      );
      await pool.query("COMMIT");
      res.json({ message: "User Deleted Successfully" });
    }
  } catch (err) {
    await pool.query("ROLLBACK");
    console.error(err.message);
    res.status(500).send("Server Error");
  }
});

//get user details
router.get("/:email", authenticateToken, async (req, res) => {
  const { email } = req.params;
  try {
    const result = await pool.query(
      "SELECT id,email,create_date,update_date,super_user FROM users WHERE email = $1;",
      [email]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err.message);
    res.status(500).send("Server Error");
  }
});

//login
router.post("/login", async (req, res) => {
  const { email, password } = req.body;
  try {
    const result = await pool.query(
      "SELECT id, email, password, super_user FROM users WHERE email = $1;",
      [email]
    );
    if (result.rows.length === 0) {
      return res.status(401).json({ error: "Email not found" });
    }

    const user = result.rows[0];
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ error: "Invalid password" });
    }

    const accessToken = generateAccessToken({ user });
    const refreshToken = generateRefreshToken({ user });
    res.json({ accessToken, refreshToken, message: "Login Successful" });
  } catch (err) {
    console.error(err.message);
    res.status(500).send("Server Error");
  }
});

//register new user
router.post("/register", async (req, res) => {
  const { email, password } = req.body;

  try {
    const userExists = await pool.query(
      "SELECT * FROM users WHERE email = $1;",
      [email]
    );
    if (userExists.rows.length > 0) {
      return res.status(400).json({ error: "Email is already registered" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    await pool.query("BEGIN");
    await pool.query("INSERT INTO users (email, password ) VALUES ($1, $2)", [ email, hashedPassword ]);
    await pool.query("COMMIT");
    res.json({ message: "User registered successfully" });
  } catch (err) {
    await pool.query("ROLLBACK");
    console.error(err.message);
    res.status(500).send("Server Error");
  }
});

module.exports = router;
