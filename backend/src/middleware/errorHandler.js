const { AppError } = require('../errors/AppError');
const logger = require('../utils/logger');

/**
 * Central error handler: the ONLY place that turns errors into HTTP responses.
 * Every error response has the same shape:
 *   { error: { code, message, details?, retryable }, requestId }
 * Unknown errors become a generic 500 so internals never leak to clients.
 */
// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  const appError = toAppError(err);

  const logMeta = {
    requestId: req.id,
    method: req.method,
    path: req.originalUrl,
    status: appError.statusCode,
    code: appError.code,
  };
  if (appError.statusCode >= 500) {
    logger.error(err.message, { ...logMeta, stack: err.stack, cause: err.cause?.message });
  } else {
    logger.warn(appError.message, logMeta);
  }

  if (res.headersSent) return;

  res.status(appError.statusCode).json({
    error: {
      code: appError.code,
      message: appError.message,
      ...(appError.details !== undefined && { details: appError.details }),
      retryable: appError.retryable,
    },
    requestId: req.id,
  });
}

/** Normalise errors thrown by Express' body parser and unknown errors into AppErrors. */
function toAppError(err) {
  if (err instanceof AppError) return err;

  if (err?.type === 'entity.too.large') {
    return new AppError('Request body is too large.', { statusCode: 413, code: 'PAYLOAD_TOO_LARGE' });
  }
  if (err?.type === 'entity.parse.failed') {
    return new AppError('Request body is not valid JSON.', { statusCode: 400, code: 'INVALID_JSON' });
  }

  return new AppError('Something went wrong on our side.', { statusCode: 500, code: 'INTERNAL_ERROR' });
}

module.exports = { errorHandler };
