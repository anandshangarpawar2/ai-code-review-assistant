const { GoogleGenAI, ApiError } = require('@google/genai');
const { LLMProvider } = require('./LLMProvider');
const {
  AppError,
  LLMRateLimitError,
  LLMTimeoutError,
  LLMUnavailableError,
  LLMResponseError,
} = require('../errors/AppError');
const { withRetry } = require('../utils/retry');
const logger = require('../utils/logger');

/**
 * LLMProvider implementation backed by Google Gemini (@google/genai SDK).
 *
 * Responsibilities kept here and nowhere else:
 *  - talking to the Gemini SDK
 *  - per-attempt timeout (AbortController)
 *  - retrying transient failures
 *  - mapping Gemini errors / finish reasons onto our own error classes
 */
class GeminiProvider extends LLMProvider {
  /**
   * @param {object} opts
   * @param {string} opts.apiKey
   * @param {string} opts.model
   * @param {number} opts.timeoutMs
   * @param {number} opts.maxRetries
   * @param {object} [opts.client] injected SDK client (used by tests)
   */
  constructor({ apiKey, model, timeoutMs, maxRetries, client }) {
    super();
    this.model = model;
    this.timeoutMs = timeoutMs;
    this.maxRetries = maxRetries;
    this.client = client || new GoogleGenAI({ apiKey });
  }

  get name() {
    return `gemini:${this.model}`;
  }

  async generateJson({ systemPrompt, userPrompt, schema }) {
    return withRetry(() => this.#callOnce({ systemPrompt, userPrompt, schema }), {
      retries: this.maxRetries,
      shouldRetry: (err) => err instanceof AppError && err.retryable,
      onRetry: (err, attempt, delayMs) =>
        logger.warn('LLM call failed, retrying', { provider: this.name, attempt, delayMs, code: err.code }),
    });
  }

  async #callOnce({ systemPrompt, userPrompt, schema }) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    const startedAt = Date.now();

    let response;
    try {
      response = await this.client.models.generateContent({
        model: this.model,
        contents: userPrompt,
        config: {
          systemInstruction: systemPrompt,
          responseMimeType: 'application/json',
          responseJsonSchema: schema,
          temperature: 0.2,
          abortSignal: controller.signal,
        },
      });
    } catch (err) {
      throw this.#mapError(err, controller.signal.aborted);
    } finally {
      clearTimeout(timer);
    }

    logger.info('LLM call succeeded', {
      provider: this.name,
      latencyMs: Date.now() - startedAt,
      usage: response.usageMetadata,
    });

    return this.#parse(response);
  }

  /** Turn the SDK response into a JS object, or explain why we can't. */
  #parse(response) {
    if (response.promptFeedback?.blockReason) {
      throw new LLMResponseError('The request was blocked by the AI safety filters.', {
        details: { blockReason: response.promptFeedback.blockReason },
      });
    }

    const finishReason = response.candidates?.[0]?.finishReason;
    if (finishReason === 'MAX_TOKENS') {
      throw new LLMResponseError('The AI response was cut off. Try submitting less code.', {
        details: { finishReason },
      });
    }
    if (finishReason && finishReason !== 'STOP') {
      throw new LLMResponseError('The AI did not complete the review.', { details: { finishReason } });
    }

    const text = response.text;
    if (!text) {
      throw new LLMResponseError('The AI service returned an empty response.', { retryable: true });
    }

    try {
      return JSON.parse(text);
    } catch (err) {
      throw new LLMResponseError('The AI service returned malformed JSON.', { cause: err, retryable: true });
    }
  }

  /** Map any SDK / network error onto one of our LLM*Error classes. */
  #mapError(err, timedOut) {
    if (timedOut || err?.name === 'AbortError') {
      return new LLMTimeoutError(undefined, { cause: err, retryable: true });
    }

    if (err instanceof ApiError) {
      const status = err.status;
      logger.error('Gemini API error', { status, message: err.message });

      if (status === 429) return new LLMRateLimitError(undefined, { cause: err, retryable: true });
      if (status === 401 || status === 403) {
        // Our API key is wrong — not the user's fault, and retrying won't help.
        return new LLMUnavailableError('The AI service is misconfigured on the server.', { cause: err });
      }
      if (status === 400) {
        return new LLMResponseError('The AI service rejected the request.', { cause: err });
      }
      if (status >= 500) return new LLMUnavailableError(undefined, { cause: err, retryable: true });
      return new LLMUnavailableError(undefined, { cause: err });
    }

    // DNS failure, connection reset, etc.
    logger.error('Gemini network error', { message: err?.message });
    return new LLMUnavailableError(undefined, { cause: err, retryable: true });
  }
}

module.exports = { GeminiProvider };
