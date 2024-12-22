const jwt = require("jsonwebtoken");
require("dotenv").config();
const JWT_SECRET = `${process.env.JWT_SECRET}`;
const JWT_REFRESH_SECRET = `${process.env.JWT_REFRESH_SECRET}`;

const generateAccessToken = (user) => {
  return jwt.sign(user, JWT_SECRET, { expiresIn: "15m" });
};
const generateRefreshToken = (user) => {
  return jwt.sign(user, JWT_REFRESH_SECRET, { expiresIn: "7d" });
};
const authenticateToken = (req, res, next) => {
  const token = req.headers["authorization"]?.split(" ")[1];

  if (!token) {
    return res.status(401).json({ error: "Access token required" });
  }

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: "Invalid or expired token" });
    }
    req.user = user;
    next();
  });
};

module.exports = {
  generateAccessToken,
  generateRefreshToken,
  authenticateToken,
};
