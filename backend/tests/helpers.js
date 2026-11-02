process.env.NODE_ENV = 'test';

const { loadConfig } = require('../src/config');
const { createApp } = require('../src/app');

function testConfig(overrides = {}) {
  return loadConfig({ LLM_PROVIDER: 'mock', MAX_CODE_CHARS: '200', RATE_LIMIT_MAX: '100', ...overrides });
}

/** Start the app on a random port; returns { baseUrl, close }. */
async function startServer({ config = testConfig(), llmProvider } = {}) {
  const app = createApp({ config, llmProvider });
  const server = await new Promise((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  const { port } = server.address();
  return {
    baseUrl: `http://127.0.0.1:${port}`,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}

const postJson = (url, body, headers = {}) =>
  fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });

module.exports = { testConfig, startServer, postJson };
