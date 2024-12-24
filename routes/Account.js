const express = require("express");
const router = express.Router();
const { authenticateToken } = require("../services/AuthService");
const pool = require("../db");
const jwt = require("jsonwebtoken");

router.get("/", authenticateToken, async (req, res) => {
  try {
    const token = req.headers["authorization"]?.split(" ")[1];

    if (!token) {
      return res.status(401).json({ error: "Access token required" });
    }
    jwt.verify(token, `${process.env.JWT_SECRET}`, (err, user) => {
      req.user = user;
    });
    const result = await pool.query(
      `select a.name,a.balance from users u join account_users au on au.account_id = u.id join accounts a on a.id = au.user_id where u.email = $1;`,
      [req.user.user.email]
    );
    console.log(result);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }
    res.json(result.rows);
  } catch (err) {
    console.error(err.message);
    res.status(500).send("Server Error");
  }
});

router.post("/", authenticateToken, async (req, res) => {
  const { accountName } = req.body;
  const client = await pool.connect();
  try {
    jwt.verify(req.headers["authorization"]?.split(" ")[1], `${process.env.JWT_SECRET}`, (err, user) => {
        req.user = user;
      });
    await client.query("BEGIN");
    console.log(req.user.user.email)
    let output = await pool.query("Select id from users where email = $1",[req.user.user.email]);
    let userId = output.rows[0].id;
    const result = await pool.query("insert into accounts (name,owner) values ($1,$2) returning id;",[accountName,userId]);
    const accountId = result.rows[0].id;
    await pool.query("INSERT INTO account_users (account_id, user_id) VALUES ($1, $2);",[accountId,userId]);
    await client.query("COMMIT");
    return res
      .status(201)
      .json({ message: "Account created successfully", accountId });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error(error);
    return res.status(500).json({ error: "Error creating account" });
  }
});

module.exports = router;
