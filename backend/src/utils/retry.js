const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Run `fn`, retrying with exponential backoff + jitter while `shouldRetry(err)` is true.
 * Attempt 1 is the original call; `retries` is how many extra attempts are allowed.
 */
async function withRetry(fn, { retries = 2, baseDelayMs = 500, maxDelayMs = 4000, shouldRetry = () => true, onRetry } = {}) {
  let attempt = 0;
  for (;;) {
    try {
      return await fn();
    } catch (err) {
      attempt += 1;
      if (attempt > retries || !shouldRetry(err)) throw err;
      const backoff = Math.min(maxDelayMs, baseDelayMs * 2 ** (attempt - 1));
      const delayMs = Math.round(backoff / 2 + Math.random() * (backoff / 2));
      onRetry?.(err, attempt, delayMs);
      await sleep(delayMs);
    }
  }
}

module.exports = { withRetry };
