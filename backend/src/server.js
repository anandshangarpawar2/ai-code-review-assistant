const { loadConfig } = require('./config');
const { createApp } = require('./app');
const logger = require('./utils/logger');

let config;
try {
  config = loadConfig();
} catch (err) {
  logger.error(err.message);
  process.exit(1);
}

const app = createApp({ config });

const server = app.listen(config.port, () => {
  logger.info('API listening', {
    url: `http://localhost:${config.port}`,
    provider: config.llm.provider,
    corsOrigins: config.corsOrigins,
  });
});

// Graceful shutdown: stop accepting connections, let in-flight reviews finish.
function shutdown(signal) {
  logger.info('Shutting down', { signal });
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 10_000).unref();
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled promise rejection', { reason: String(reason) });
});
