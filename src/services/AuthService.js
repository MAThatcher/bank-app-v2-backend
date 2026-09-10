const jwt = require('jsonwebtoken');
require('dotenv').config();
const prisma = require('../prisma/client');
const logger = require('../Utilities/logger');

const generateToken = async (user, type, secret, expiresIn) => {
  try {
    const token = jwt.sign(user, secret, { expiresIn });
    const { exp } = jwt.decode(token);
    await prisma.runTransaction(async (tx) => {
      await tx.tokens.updateMany({ where: { user_id: Number(user.user.id), type, valid: true }, data: { valid: false } });
      await tx.tokens.create({
        data: {
          value: token,
          user_id: Number(user.user.id),
          type,
          valid: true,
          expire_date: new Date(exp * 1000),
        },
      });
    });
    return token;
  } catch (err) {
    logger.error('generateToken error: %o', { type, error: err });
    throw err;
  }
};

const generateAccessToken = (user) => generateToken(
  user, 'AccessToken', process.env.JWT_SECRET, process.env.ACCESS_TOKEN_EXPIRES_IN || '15m'
);

const generateRefreshToken = (user) => generateToken(
  user, 'RefreshToken', process.env.JWT_REFRESH_SECRET, process.env.REFRESH_TOKEN_EXPIRES_IN || '24h'
);
const authenticateToken = (req, res, next) => {
  const token = req.headers["authorization"]?.split(" ")[1];

  if (!token) {
    return res.status(401).json({ error: "Access token required" });
  }

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) {
      logger.error('authenticateToken verify error: %o', err);
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
