const { createLogger, format, transports } = require('winston');
const path = require('path');

const envLevel = process.env.LOG_LEVEL || 'info';

const fileFormat = format.combine(
  format.timestamp(),
  format.errors({ stack: true }),
  format.splat(),
  format.json(),
  format.prettyPrint()
);

const consoleFormat = format.combine(
  format.colorize(),
  format.timestamp(),
  format.printf(({ timestamp, level, message, ...meta }) => {
    const metaObj = meta?.[Symbol.for('splat')] ? meta[Symbol.for('splat')][0] : meta;
    const reqId = metaObj?.requestId || metaObj?.request_id ? ` req=${metaObj.requestId || metaObj.request_id}` : '';
    const metaStr = metaObj ? ` ${JSON.stringify(metaObj)}` : '';
    const ts = typeof timestamp === 'string' ? timestamp : new Date(timestamp).toISOString();
    const msg = typeof message === 'string' ? message : JSON.stringify(message);
    return `${ts} [${level}]:${reqId} ${msg}${metaStr}`;
  })
);

const logger = createLogger({
  level: envLevel,
  defaultMeta: { service: 'bank-app-v2-backend' },
  transports: [
    new transports.File({ filename: path.resolve(__dirname, '..', 'logs', 'error.log'), level: 'error', format: fileFormat }),
    new transports.File({ filename: path.resolve(__dirname, '..', 'logs', 'combined.log'), format: fileFormat }),
  ],
});

if (process.env.NODE_ENV !== 'production') {
  logger.add(new transports.Console({ format: consoleFormat }));
}

logger.withRequestId = (req) => {
  const rid = req?.requestId;
  const wrap = (level) => (message, meta = {}) => {
    const metaWithId = rid ? { ...meta, requestId: rid } : { ...meta };
    logger[level](message, metaWithId);
  };

  return {
    info: wrap('info'),
    warn: wrap('warn'),
    error: wrap('error'),
    debug: wrap('debug'),
  };
};

module.exports = logger;
