/**
 * logger.js — Winston structured logger
 *
 * WHY USE WINSTON INSTEAD OF console.log?
 * ----------------------------------------
 * - console.log has no log LEVELS. You can't filter "only show errors".
 * - In production, you want logs written to FILES so they survive server restarts.
 * - Winston adds timestamps, levels (info/warn/error), and JSON formatting.
 * - You can later plug in external log services (Datadog, Logtail, etc.) easily.
 *
 * LOG LEVELS (low number = more important):
 *   0: error   → Something broke, needs immediate attention
 *   1: warn    → Something unexpected but not fatal
 *   2: info    → Normal system events (server started, MQTT connected)
 *   3: debug   → Detailed dev info (only shown in development)
 */

const { createLogger, format, transports } = require("winston");

const { combine, timestamp, printf, colorize, errors } = format;

// ── Custom log format ─────────────────────────────────────────────────────────
// This defines HOW each log line looks when printed.
// Example output: [2026-03-01 10:30:00] INFO: MQTT broker connected
const logFormat = printf(({ level, message, timestamp, stack }) => {
  // If it's an error with a stack trace, include the stack
  return stack
    ? `[${timestamp}] ${level}: ${message}\n${stack}`
    : `[${timestamp}] ${level}: ${message}`;
});

// ── Create the logger ─────────────────────────────────────────────────────────
const logger = createLogger({
  // The minimum level to log. "info" means info, warn, and error all get logged.
  // In production, you might set this to "warn" to reduce noise.
  level: process.env.NODE_ENV === "production" ? "warn" : "info",

  format: combine(
    // Capture the stack trace on Error objects automatically
    errors({ stack: true }),
    // Add a timestamp to every log entry
    timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
    logFormat
  ),

  // TRANSPORTS = where logs go
  transports: [
    // 1. Console — colored output for your terminal
    new transports.Console({
      format: combine(colorize(), timestamp({ format: "HH:mm:ss" }), logFormat),
    }),

    // 2. File: logs/error.log — only errors, persisted to disk
    //    This file is what you'd check when something goes wrong in production.
    new transports.File({
      filename: "logs/error.log",
      level: "error",       // only errors go here
      maxsize: 5242880,     // 5 MB max per file
      maxFiles: 5,          // keep 5 rotated files
    }),

    // 3. File: logs/combined.log — everything (info + warn + error)
    new transports.File({
      filename: "logs/combined.log",
      maxsize: 5242880,
      maxFiles: 5,
    }),
  ],
});

module.exports = logger;
