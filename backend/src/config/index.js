require('dotenv').config({ quiet: true });

function int(env, name, fallback) {
  const raw = env[name];
  if (raw === undefined || raw === '') return fallback;
  const value = Number.parseInt(raw, 10);
  if (Number.isNaN(value)) {
    throw new Error(`Config error: ${name} must be an integer, got "${raw}"`);
  }
  return value;
}

/**
 * Single source of truth for runtime configuration.
 * Everything is read from environment variables once, at startup,
 * so a misconfiguration fails fast instead of on the first request.
 */
function loadConfig(env = process.env) {
  const config = {
    port: int(env, 'PORT', 4000),
    nodeEnv: env.NODE_ENV || 'development',
    corsOrigins: (env.CORS_ORIGINS || 'http://localhost:5173')
      .split(',')
      .map((o) => o.trim())
      .filter(Boolean),
    llm: {
      provider: (env.LLM_PROVIDER || 'gemini').toLowerCase(),
      apiKey: env.GEMINI_API_KEY || '',
      model: env.GEMINI_MODEL || 'gemini-2.5-flash',
      timeoutMs: int(env, 'LLM_TIMEOUT_MS', 30000),
      maxRetries: int(env, 'LLM_MAX_RETRIES', 2),
    },
    limits: {
      maxCodeChars: int(env, 'MAX_CODE_CHARS', 20000),
    },
    rateLimit: {
      windowMs: int(env, 'RATE_LIMIT_WINDOW_MS', 60000),
      max: int(env, 'RATE_LIMIT_MAX', 20),
    },
  };

  if (config.llm.provider === 'gemini' && !config.llm.apiKey) {
    throw new Error(
      'Config error: GEMINI_API_KEY is required when LLM_PROVIDER=gemini. ' +
        'Copy backend/.env.example to backend/.env and set it, or use LLM_PROVIDER=mock.'
    );
  }

  return Object.freeze(config);
}

module.exports = { loadConfig };
