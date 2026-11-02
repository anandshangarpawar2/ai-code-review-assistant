/**
 * Minimal structured (JSON-line) logger. Swappable for pino/winston later
 * without touching callers, since everything goes through these four methods.
 */
function write(level, message, meta = {}) {
  if (process.env.NODE_ENV === 'test' && level !== 'error') return;
  const line = JSON.stringify({ time: new Date().toISOString(), level, message, ...meta });
  if (level === 'error' || level === 'warn') console.error(line);
  else console.log(line);
}

module.exports = {
  debug: (msg, meta) => write('debug', msg, meta),
  info: (msg, meta) => write('info', msg, meta),
  warn: (msg, meta) => write('warn', msg, meta),
  error: (msg, meta) => write('error', msg, meta),
};
