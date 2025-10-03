const jwt = require('jsonwebtoken');
require('dotenv').config();
const prisma = require('../prisma/client');

const generateAccessToken = (user) => {
  try {
    const token = jwt.sign(user, process.env.JWT_SECRET, { expiresIn: '15m' });
    // Use a Prisma transaction to invalidate previous tokens and insert the new one
    prisma.runTransaction(async (tx) => {
      await tx.tokens.updateMany({ where: { user_id: Number(user.user.id), type: 'AccessToken', valid: true }, data: { valid: false } });
      await tx.tokens.create({ data: { value: token, user_id: Number(user.user.id), type: 'AccessToken', expire_date: new Date(Date.now() + 15 * 60 * 1000) } });
    });
    return token;
  } catch (err) {
    console.log(err);
    return null;
  }
};

const generateRefreshToken = (user) => {
  try {
    const token = jwt.sign(user, process.env.JWT_REFRESH_SECRET, { expiresIn: '7d' });
    prisma.runTransaction(async (tx) => {
      await tx.tokens.updateMany({ where: { user_id: Number(user.user.id), type: 'RefreshToken', valid: true }, data: { valid: false } });
      await tx.tokens.create({ data: { value: token, user_id: Number(user.user.id), type: 'RefreshToken', expire_date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) } });
    });
    return token;
  } catch (err) {
    console.log(err);
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
