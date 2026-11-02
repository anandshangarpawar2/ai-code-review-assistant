const { GeminiProvider } = require('./GeminiProvider');
const { MockProvider } = require('./MockProvider');

/** Factory: pick the LLMProvider implementation from config. */
function createLLMProvider(llmConfig) {
  switch (llmConfig.provider) {
    case 'gemini':
      return new GeminiProvider(llmConfig);
    case 'mock':
      return new MockProvider();
    default:
      throw new Error(`Config error: unknown LLM_PROVIDER "${llmConfig.provider}" (expected "gemini" or "mock")`);
  }
}

module.exports = { createLLMProvider };
