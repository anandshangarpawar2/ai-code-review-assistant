// Runtime configuration. Precedence: ?api= query param > window.APP_CONFIG > default.
const DEFAULT_API_BASE_URL = 'http://localhost:4000';

function resolveApiBaseUrl() {
  const fromQuery = new URLSearchParams(window.location.search).get('api');
  const fromGlobal = window.APP_CONFIG && window.APP_CONFIG.API_BASE_URL;
  const url = fromQuery || fromGlobal || DEFAULT_API_BASE_URL;
  return url.replace(/\/+$/, '');
}

export const config = Object.freeze({
  API_BASE_URL: resolveApiBaseUrl(),
  // Must exceed the backend worst case: (LLM_MAX_RETRIES + 1) * LLM_TIMEOUT_MS + backoff ≈ 95s.
  REQUEST_TIMEOUT_MS: 120_000,
  HEALTH_TIMEOUT_MS: 5_000,
  MAX_CODE_LENGTH: 20_000,
  FALLBACK_LANGUAGES: [
    'javascript', 'typescript', 'python', 'java', 'go', 'c', 'cpp', 'csharp',
    'ruby', 'php', 'rust', 'kotlin', 'swift', 'sql', 'other',
  ],
  FOCUS_AREAS: ['bugs', 'security', 'performance', 'readability', 'best-practice'],
});
