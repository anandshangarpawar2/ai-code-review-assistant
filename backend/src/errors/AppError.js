/**
 * Base class for every error the API knows how to report.
 * `statusCode` is the HTTP status, `code` is a stable machine-readable
 * identifier the frontend can switch on, `details` is optional extra context.
 * Anything that is NOT an AppError is treated as an unexpected 500.
 */
class AppError extends Error {
  constructor(message, { statusCode = 500, code = 'INTERNAL_ERROR', details, cause, retryable = false } = {}) {
    super(message, { cause });
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    // true when retrying the same request later could succeed (rate limit, timeout, outage)
    this.retryable = retryable;
  }
}

class ValidationError extends AppError {
  constructor(message, details) {
    super(message, { statusCode: 400, code: 'VALIDATION_ERROR', details });
  }
}

class NotFoundError extends AppError {
  constructor(message = 'Resource not found') {
    super(message, { statusCode: 404, code: 'NOT_FOUND' });
  }
}

/** The LLM provider rejected us for quota / rate reasons. */
class LLMRateLimitError extends AppError {
  constructor(message = 'The AI service is busy. Please try again in a moment.', opts = {}) {
    super(message, { statusCode: 429, code: 'LLM_RATE_LIMITED', ...opts });
  }
}

/** The LLM call took longer than the configured timeout. */
class LLMTimeoutError extends AppError {
  constructor(message = 'The AI service took too long to respond.', opts = {}) {
    super(message, { statusCode: 504, code: 'LLM_TIMEOUT', ...opts });
  }
}

/** The LLM provider is down, unreachable, or misconfigured on our side. */
class LLMUnavailableError extends AppError {
  constructor(message = 'The AI service is currently unavailable.', opts = {}) {
    super(message, { statusCode: 503, code: 'LLM_UNAVAILABLE', ...opts });
  }
}

/** The LLM answered, but the answer was unusable (blocked, empty, malformed JSON). */
class LLMResponseError extends AppError {
  constructor(message = 'The AI service returned an invalid response.', opts = {}) {
    super(message, { statusCode: 502, code: 'LLM_BAD_RESPONSE', ...opts });
  }
}

module.exports = {
  AppError,
  ValidationError,
  NotFoundError,
  LLMRateLimitError,
  LLMTimeoutError,
  LLMUnavailableError,
  LLMResponseError,
};
