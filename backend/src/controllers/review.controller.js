const { validateReviewRequest } = require('../validators/review.validator');
const { LANGUAGES } = require('../prompts/review.prompt');

/**
 * HTTP adapter: translates req/res into service calls and back.
 * No business logic here; errors are passed to the central error handler.
 */
function createReviewController({ reviewService, limits }) {
  return {
    async create(req, res) {
      const request = validateReviewRequest(req.body, limits);
      const result = await reviewService.review(request);
      res.status(200).json({ data: result, requestId: req.id });
    },

    listLanguages(req, res) {
      res.json({ data: LANGUAGES });
    },
  };
}

module.exports = { createReviewController };
