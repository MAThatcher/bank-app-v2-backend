const { randomUUID } = require('crypto');

module.exports = (req, res, next) => {
  const hasRandomUUID = typeof randomUUID === 'function';
  const id = hasRandomUUID ? randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

  req.requestId = id;
  res.setHeader('X-Request-Id', id);
  next();
};
