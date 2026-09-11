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
const authenticateToken = async (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Access token required', code: 'SESSION_INVALID' });
  try {
    const identity = await require('./SessionService').authorize(token);
    const contextId = req.headers['x-impersonation-id'];
    if (contextId) {
      const { user, context } = await require('./ImpersonationService').resolve(identity, contextId);
      const path = (req.originalUrl || '').split('?')[0].toLowerCase();
      const read = ['GET', 'HEAD'].includes(req.method);
      if (!read || path.startsWith('/api/admin') || path.includes('/sessions') || path.startsWith('/api/auth')) {
        return res.status(403).json({ error: 'This action is unavailable during read-only impersonation. Return to your admin account to continue.', code: 'IMPERSONATION_RESTRICTED' });
      }
      req.impersonation = { id: context.id, adminId: identity.user.id, readOnly: context.read_only, expiresAt: context.expires_at };
      req.user = { user };
      req.sessionId = identity.sid;
      return next();
    }
    req.user = { user: identity.user };
    req.sessionId = identity.sid;
    return next();
  } catch (error) {
    if (error.code === 'IMPERSONATION_INVALID') return res.status(error.status || 403).json({ error: error.message, code: error.code });
    if (error.status === 401) return res.status(401).json({ error: error.message, code: 'SESSION_INVALID' });
    logger.error('Session authorization unavailable', { code: error.code || 'SESSION_DB_ERROR' });
    return res.status(503).json({ error: 'Session verification is temporarily unavailable. Please retry.' });
  }
};
module.exports = {
  generateAccessToken,
  generateRefreshToken,
  authenticateToken
};
