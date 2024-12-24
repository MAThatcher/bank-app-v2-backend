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

//get single bank account
router.get("/:accountId", authenticateToken, async (req, res) => {
  const { accountId } = req.params;
  try {
    const token = req.headers["authorization"]?.split(" ")[1];
    if (!token) {
      return res.status(401).json({ error: "Access token required" });
    }
    jwt.verify(token, `${process.env.JWT_SECRET}`, (err, user) => {
      req.user = user;
    });
    let userId = req.user.user.id;
    //verify account exists
    //verify user has access to the account
    let validUser = await pool.query("select * from account_users where account_id = $1",[userId]);
    if (validUser.rows.length === 0 ){
        return res.status(404).json({ error: "Account does not exist or user is not authorized"});
    }

    //return the desired account
    return res.json(await pool.query("select * from accounts where account_id = $1",[accountId]));
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
    let userId = req.user.user.id;
    await pool.query("BEGIN");
    const result = await pool.query("insert into accounts (name,owner) values ($1,$2) returning id;",[accountName, userId]);
    const accountId = result.rows[0].id;
    await pool.query("INSERT INTO account_users (account_id, user_id) VALUES ($1, $2);",[accountId, userId]);
    await pool.query("COMMIT");
    return res.status(201).json({ message: "Account created successfully", accountId });
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
    let userId = req.user.user.id;

    //does the bank account thats being deleted exist? Is the user the owner of the account? Is the balance on the acccount zero?
    const result = await pool.query(
      `select a.balance,a.owner from accounts a u.owner = $1 and a.id = $2;`,
      [userId, accountId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Bank Account not found or is not the owner of this account" });
    } else if (result.rows[0].balance != 0.0) {
      return res.status(401).json({ error: "Bank Balance must be 0 to delete." });
    }

    //Delete the Account
    await pool.query("BEGIN");
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

//add user to bank account
router.post("/addUser", authenticateToken, async (req, res) => {
    const { accountId, email } = req.body;
    try {
      jwt.verify(
        req.headers["authorization"]?.split(" ")[1],
        `${process.env.JWT_SECRET}`,
        (err, user) => {
          req.user = user;
        }
      );
      let userId = req.user.user.id;

      //Can this user add to this account? Only owners can add to an account
      const result = await pool.query("select * from accounts where owner = $1 and archived = false and id = $2",[userId,accountId]);
      if (result.rows.length === 0 ){
        return res.status(401).json({message:"Unauthorized: Must be accounts owner to add users"});
      }

      //Does the user they want to add exist?
      let newUser = await pool.query("Select * from users where email = $1 and archived = false",[email]);
      if (newUser.rows.length === 0 ){
        return res.status(404).json({message: "User Not found"});
      }
      
      //Does this user all ready have access?
      let hasAccess = await pool.query("Select * from account_users where account_id = $1 and user_id = $2 and archived = false",[accountId,newUser.rows[0].id]);
      if (!hasAccess.rows.length === 0 ){
        return res.status(404).json({message: "User has access all ready"});
      }

      //Give the user access
      await pool.query("BEGIN");
      await pool.query( "INSERT INTO account_users (account_id, user_id) VALUES ($1, $2);", [accountId, newUser.rows[0].id] );
      await pool.query("COMMIT");
      return res.status(201).json({ message: "User Added successfully", accountId });
    } catch (error) {
      await pool.query("ROLLBACK");
      console.error(error);
      return res.status(500).json({ error: "Error adding user" });
    }
  });
module.exports = router;
