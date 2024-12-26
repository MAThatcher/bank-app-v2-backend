const express = require("express");
const router = express.Router();
const { authenticateToken } = require("../services/AuthService");
const pool = require("../db");

//get transactions for an account
router.get("/:accountId", authenticateToken, async (req, res) => {
  const { accountId } = req.params;
  try {
    let userId = req.user.user.id;
    let validUser = await pool.query( "select id from account_users where user_id = $1 and account_id = $2 and archived = false", [userId, accountId] );
    if (validUser.rows.length === 0) { 
        return res .status(404) .json({ error: "No Authorized Accounts for this User" });
    }
    const result = await pool.query( `select * from transactions where account_id = $1 and archived = false`, [accountId] );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: "No transactions or accounts found" });
    }
    res.json(result.rows);
  } catch (err) {
    console.error(err.message);
    res.status(500).send("Server Error");
  }
});

//create transaction
router.post("/", authenticateToken, async (req, res) => {
  const { transactionAmount, accountId } = req.body;
  try {
    let userId = req.user.user.id;

    //verify that this user has authority to make this depost
    let validUser = await pool.query( "select * from account_users where user_id = $1 and account_id = $2", [userId, accountId] );
    if (validUser.rows.length === 0) {
      return res.status(404).json({ error: "No Authorized Accounts for this User" });
    }

    //verify that this transaction does not conflict with overdraft protection
    let check = await pool.query( "select overdraft, balance from accounts where id = $1", [accountId] );
    let overdraft = check.rows[0].overdraft;
    let balance = parseInt(check.rows[0].balance);
    if (!overdraft && balance + transactionAmount < 0) {
      return res.status(401).json({ error: "Overdraft not allowed on this account. Balance cannot be less than 0" });
    }

    //insert transaction into db and update bank balance
    await pool.query("BEGIN");
    await pool.query( "insert into transactions (amount,user_id,account_id) values ($1, $2, $3);", [transactionAmount, userId, accountId] );
    let newAmount = await pool.query( "Select balance from accounts where id = $1", [accountId] );
    newAmount = parseInt(newAmount.rows[0].balance) + transactionAmount;
    await pool.query("update accounts set balance = $1 where id = $2;", [ newAmount, accountId, ]);
    await pool.query("COMMIT");
    return res.status(201).json({ message: "Transaction Logged successfully" });
  } catch (error) {
    await pool.query("ROLLBACK");
    console.error(error);
    return res.status(500).json({ error: "Error creating transaction" });
  }
});

module.exports = router;
