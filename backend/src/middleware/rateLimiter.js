const { rateLimit } = require('express-rate-limit');

/**
 * Per-IP limiter for the expensive LLM endpoint. In-memory store is fine for a
 * single instance; with several instances it would move to a shared store (Redis).
 */
function createReviewRateLimiter({ windowMs, max }) {
  return rateLimit({
    windowMs,
    limit: max,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    handler: (req, res) => {
      res.status(429).json({
        error: {
          code: 'RATE_LIMITED',
          message: 'Too many review requests. Please wait a minute and try again.',
          retryable: true,
        },
        requestId: req.id,
      });
    },
  });
}

module.exports = { createReviewRateLimiter };
