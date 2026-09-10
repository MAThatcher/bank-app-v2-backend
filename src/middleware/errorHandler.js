const logger = require('../Utilities/logger');

module.exports = (err, req, res, next) => {
  const reqContext = {
    id: req.requestId,
    method: req.method,
    url: req.originalUrl ?? req.url,
    body: req.body,
    user: req.user?.user ? { id: req.user.user.id, email: req.user.user.email } : undefined,
  };

  logger.error('Unhandled error: %o', { message: err?.message, stack: err?.stack, context: reqContext });

  const response = { error: 'Internal Server Error', requestId: req.requestId };
  if (process.env.NODE_ENV !== 'production') {
    response.details = err?.message;
  }

  res.status(err?.status ?? 500).json(response);
};
