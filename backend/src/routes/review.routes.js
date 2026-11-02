const { Router } = require('express');

/** Express 5 forwards rejected promises from async handlers to the error middleware. */
function createReviewRouter({ reviewController, reviewRateLimiter }) {
  const router = Router();
  router.get('/languages', reviewController.listLanguages);
  router.post('/reviews', reviewRateLimiter, reviewController.create);
  return router;
}

module.exports = { createReviewRouter };
