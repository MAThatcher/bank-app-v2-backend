const express = require("express");
const router = express.Router();
const { authenticateToken } = require("../services/AuthService");
const pool = require("../db");
const jwt = require("jsonwebtoken");

router.get("/:accountId", authenticateToken, async (req, res) => {
    const { accountId } = req.params;
  try {
    const result = await pool.query(
      `select * from transactions where accountId = $1`,[accountId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: "No transactions accounts found" });
    }
    res.json(result.rows);
  } catch (err) {
    console.error(err.message);
    res.status(500).send("Server Error");
  }
});

router.post("/", authenticateToken, async (req, res) => {
  const { transactionAmount, accountId } = req.body;
  try {
    jwt.verify(
      req.headers["authorization"]?.split(" ")[1],
      `${process.env.JWT_SECRET}`,
      (err, user) => {
        req.user = user;
      }
    );
    let userId = req.user.user.id;

    await pool.query("BEGIN");
    await pool.query( "insert into transaction (amount,user_id,account_id) values ($1, $2, $3);", [transactionAmount, userId, accountId]);
    let newAmount = await pool.query("Select balance from accounts where id = $1",[accountId]);
    newAmount = newAmount.rows[0].balance + transactionAmount;
    console.log(newAmount);
    await pool.query( "update accounts set balance = $1 where id = $2;", [newAmount, accountId]);
    await pool.query("COMMIT");
    return res
      .status(201)
      .json({ message: "Transaction Logged successfully"});
  } catch (error) {
    await pool.query("ROLLBACK");
    console.error(error);
    return res.status(500).json({ error: "Error creating account" });
  }
});

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
    await pool.query("BEGIN");
    const result = await pool.query(
      `select a.id, a.name,a.balance from users u join account_users au on au.account_id = u.id join accounts a on a.id = au.user_id where u.email = $1 and a.id = $2;`,
      [req.user.user.email, accountId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Bank Account not found" });
    } else if (result.rows[0].balance != 0.0) {
      console.log(result.rows[0].balance);
      return res
        .status(401)
        .json({ error: "Bank Balance must be 0 to delete." });
    }

    await pool.query(
      `update account_users set archived = true,update_date = current_timestamp where account_id = $1`,
      [accountId]
    );
    await pool.query(
      `update accounts set archived = true,update_date = current_timestamp where id = $1`,
      [accountId]
    );
    await pool.query("COMMIT");
    res.json({ message: "Account Deleted Successfully" });
  } catch (err) {
    await pool.query("ROLLBACK");
    console.error(err.message);
    res.status(500).send("Server Error");
  }
});

module.exports = router;
