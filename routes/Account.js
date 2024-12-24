const express = require("express");
const router = express.Router();
const { authenticateToken } = require("../services/AuthService");
const pool = require("../db");
const jwt = require("jsonwebtoken");

//get all bank accounts for a user
router.get("/", authenticateToken, async (req, res) => {
  try {
    const token = req.headers["authorization"]?.split(" ")[1];

    if (!token) {
      return res.status(401).json({ error: "Access token required" });
    }
    jwt.verify(token, `${process.env.JWT_SECRET}`, (err, user) => {
      req.user = user;
    });
    let email = req.user.user.email;
    console.log(email);
    const result = await pool.query(
      `select a.id, a.name,a.balance from users u join account_users au on au.user_id = u.id join accounts a on a.id = au.account_id where u.email = $1 and a.archived = false;`,
      [email]
    );
    console.log(result);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: "No bank accounts found" });
    }
    res.json(result.rows);
  } catch (err) {
    console.error(err.message);
    res.status(500).send("Server Error");
  }
});

//create bank account
router.post("/", authenticateToken, async (req, res) => {
  const { accountName } = req.body;
  try {
    jwt.verify(
      req.headers["authorization"]?.split(" ")[1],
      `${process.env.JWT_SECRET}`,
      (err, user) => {
        req.user = user;
      }
    );
    await pool.query("BEGIN");
    let userId = req.user.user.id;
    const result = await pool.query(
      "insert into accounts (name,owner) values ($1,$2) returning id;",
      [accountName, userId]
    );
    const accountId = result.rows[0].id;
    await pool.query(
      "INSERT INTO account_users (account_id, user_id) VALUES ($1, $2);",
      [accountId, userId]
    );
    await pool.query("COMMIT");
    return res
      .status(201)
      .json({ message: "Account created successfully", accountId });
  } catch (error) {
    await pool.query("ROLLBACK");
    console.error(error);
    return res.status(500).json({ error: "Error creating account" });
  }
});

//delete bank account
router.delete("/", authenticateToken, async (req, res) => {
  const { accountId } = req.body;
  try {
    const token = req.headers["authorization"]?.split(" ")[1];

    if (!token) {
      return res.status(401).json({ error: "Access token required" });
    }
    jwt.verify(token, `${process.env.JWT_SECRET}`, (err, user) => {
      req.user = user;
    });
    let email = req.user.user.email;
    await pool.query("BEGIN");
    const result = await pool.query(
      `select a.id, a.name,a.balance from users u join account_users au on au.account_id = u.id join accounts a on a.id = au.user_id where u.email = $1 and a.id = $2;`,
      [email, accountId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Bank Account not found" });
    } else if (result.rows[0].balance != 0.0) {
      console.log(result.rows[0].balance);
      return res
        .status(401)
        .json({ error: "Bank Balance must be 0 to delete." });
    }

    await pool.query( `update account_users set archived = true, update_date = current_timestamp where account_id = $1`, [accountId] );
    await pool.query( `update accounts set archived = true, update_date = current_timestamp where id = $1`, [accountId] );
    await pool.query( `update transactions set archived = true, update_date = current_timestamp where account_id = $1`, [accountId] );
    await pool.query("COMMIT");
    res.json({ message: "Account Deleted Successfully" });
  } catch (err) {
    await pool.query("ROLLBACK");
    console.error(err.message);
    res.status(500).send("Server Error");
  }
});

module.exports = router;
