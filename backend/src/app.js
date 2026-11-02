const express = require('express');
const cors = require('cors');

const { createLLMProvider } = require('./llm');
const { ReviewService } = require('./services/review.service');
const { createReviewController } = require('./controllers/review.controller');
const { createReviewRouter } = require('./routes/review.routes');
const { createHealthRouter } = require('./routes/health.routes');
const { createReviewRateLimiter } = require('./middleware/rateLimiter');
const { requestId } = require('./middleware/requestId');
const { notFound } = require('./middleware/notFound');
const { errorHandler } = require('./middleware/errorHandler');

/**
 * App factory / composition root. All dependencies are wired here, which keeps
 * every other module free of `new` calls on its collaborators and lets tests
 * pass in a fake LLM provider.
 *
 * @param {{ config: object, llmProvider?: import('./llm/LLMProvider').LLMProvider }} deps
 */
function createApp({ config, llmProvider = createLLMProvider(config.llm) }) {
  const reviewService = new ReviewService({ llmProvider });
  const reviewController = createReviewController({ reviewService, limits: config.limits });
  const reviewRateLimiter = createReviewRateLimiter(config.rateLimit);

  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);

  app.use(requestId);
  app.use(
    cors({
      origin: config.corsOrigins,
      methods: ['GET', 'POST'],
      exposedHeaders: ['X-Request-Id', 'RateLimit', 'RateLimit-Policy'],
    })
  );
  // Body limit leaves headroom over MAX_CODE_CHARS for JSON escaping; the exact
  // character limit is enforced by the validator with a clearer message.
  app.use(express.json({ limit: `${Math.ceil((config.limits.maxCodeChars * 6) / 1024) + 16}kb` }));

  app.use('/api/health', createHealthRouter({ llmProvider }));
  app.use('/api/v1', createReviewRouter({ reviewController, reviewRateLimiter }));

  app.use(notFound);
  app.use(errorHandler);

  return app;
}

module.exports = { createApp };
