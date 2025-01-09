const express = require("express");
const router = express.Router();
const { authenticateToken } = require("../services/AuthService");
const pool = require("../db");

//get notifications
router.get("/", authenticateToken, async (req, res) => {
  try {
    let userId = req.user.user.id;
    console.log(email);
    const result = await pool.query(
      `select * from notifications where user_id = $1 order by create_date`,
      [userId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: "No notifications found" });
    }
    res.json.status(200)(result.rows);
  } catch (err) {
    console.error(err.message);
    res.status(500).send("Server Error");
  }
});
//get single notification
router.get("/:notificationId", authenticateToken, async (req, res) => {
  const { notificationId } = req.params;
  try {
    let userId = req.user.user.id;

    const result = await pool.query(
      `select * from notifications where user_id = $1 and id = $2`,
      [userId, notificationId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: "No notification found" });
    }
    return res.json(result.rows);
  } catch (err) {
    console.error(err.message);
    res.status(500).send("Server Error");
  }
});

//mark notifications as read
router.patch("/:notificationId", authenticateToken, async (req, res) => {
  const { notificationId } = req.params;
  try {
    let userId = req.user.user.id;

    const result = await pool.query(
      `update notifications set dismissed = true, update_date = current_timestamp where user_id = $1 and id = $2`,
      [userId, notificationId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: "No notification found" });
    }
    return res.json(result.rows);
  } catch (err) {
    console.error(err.message);
    res.status(500).send("Server Error");
  }
});

//create Notification
router.post("/", authenticateToken, async (req, res) => {
  try {
    const { message } = req.params;
    let userId = req.user.user.id;

    const result = await pool.query(
      `insert into notifications (message,user_id) values ($1,$2)`,
      [message, userId]
    );
    return res.json(result.rows);
  } catch (err) {
    console.error(err.message);
    res.status(500).send("Server Error");
  }
});

module.exports = router;
