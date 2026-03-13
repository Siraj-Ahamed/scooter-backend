const { createLogger, format, transports } = require('winston');
const path = require('path');
const { combine, timestamp, printf, colorize, json, errors } = format;

const isDev = process.env.NODE_ENV !== 'production';

const devFormat = combine(
  colorize({ all: true }),
  timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  errors({ stack: true }),
  printf(({ level, message, timestamp, stack }) =>
    stack ? `[${timestamp}] ${level}: ${message}\n${stack}` : `[${timestamp}] ${level}: ${message}`
  )
);

const prodFormat = combine(timestamp(), errors({ stack: true }), json());

const logger = createLogger({
  level: isDev ? 'debug' : 'warn',
  format: isDev ? devFormat : prodFormat,
  transports: [
    new transports.Console(),
    ...(!isDev ? [
      new transports.File({ filename: path.join('logs', 'error.log'), level: 'error', maxsize: 10485760, maxFiles: 5 }),
      new transports.File({ filename: path.join('logs', 'combined.log'), maxsize: 10485760, maxFiles: 5 }),
    ] : []),
  ],
});

module.exports = logger;
