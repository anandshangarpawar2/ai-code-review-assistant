/**
 * Abstraction over any LLM vendor (Strategy pattern).
 *
 * The rest of the app depends only on this contract, so switching Gemini for
 * another vendor means writing one new subclass and changing one line in the
 * factory — no service, controller, or route changes.
 *
 * Implementations MUST:
 *  - return a plain JS object parsed from the model's JSON output
 *  - translate vendor-specific failures into the LLM*Error classes in errors/AppError.js
 */
class LLMProvider {
  /** @returns {string} human-readable provider/model name, for logs and responses */
  get name() {
    throw new Error('LLMProvider.name not implemented');
  }

  /**
   * Ask the model for a JSON object matching `schema`.
   * @param {object} params
   * @param {string} params.systemPrompt  instructions for the model
   * @param {string} params.userPrompt    the actual task / data
   * @param {object} params.schema        JSON Schema the output must follow
   * @returns {Promise<object>}
   */
  // eslint-disable-next-line no-unused-vars
  async generateJson({ systemPrompt, userPrompt, schema }) {
    throw new Error('LLMProvider.generateJson not implemented');
  }
}

module.exports = { LLMProvider };
