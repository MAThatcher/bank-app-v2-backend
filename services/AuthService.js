const jwt = require("jsonwebtoken");
require("dotenv").config();
const pool = require("../db");

const generateAccessToken =  (user) => {
  try {
    let token = jwt.sign(user, process.env.JWT_SECRET, { expiresIn: "15m" });
    pool.query("BEGIN");
    pool.query("update tokens set valid = false where user_id = $1 and type = 'AccessToken' and valid = true",[user.user.user.id]);
    pool.query("insert into tokens (value,user_id,type,expire_date) values ($1,$2,'AccessToken',current_timestamp + (15 ||' minutes')::interval);",[token,user.user.user.id]);
    pool.query("COMMIT");
    return token;
  }
  catch (err){
    pool.query("ROLLBACK");
    return null;
  }
};
const generateRefreshToken =  (user) => {
  try {
    let token = jwt.sign(user, process.env.JWT_REFRESH_SECRET, { expiresIn: "7d" });
    pool.query("BEGIN");
    pool.query("update tokens set valid = false where user_id = $1 and type = 'RefreshToken' and valid = true",[user.user.user.id]);
    pool.query("insert into tokens (value,user_id,type,expire_date) values ($1,$2,'RefreshToken',current_timestamp + (7 ||' day')::interval);",[token,user.user.user.id]);
    pool.query("COMMIT");
    return token;
  }
  catch (err){
    pool.query("ROLLBACK");
    return null;
  }
};
const authenticateToken = (req, res, next) => {
  const token = req.headers["authorization"]?.split(" ")[1];

  if (!token) {
    return res.status(401).json({ error: "Access token required" });
  }

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) {
      console.log(err);
      return res.status(403).json({ error: "Invalid or expired token" });
    }
    req.user = user;
    next();
  });
};

module.exports = {
  generateAccessToken,
  generateRefreshToken,
  authenticateToken
};
