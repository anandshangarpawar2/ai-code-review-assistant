// The only module that talks to the network. Every failure surfaces as an ApiError.
import { config } from './config.js';

export class ApiError extends Error {
  constructor({ status = 0, code = 'UNKNOWN_ERROR', message = 'Unexpected error', details, retryable = false, requestId = null }) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
    this.retryable = retryable;
    this.requestId = requestId;
  }
}

export class ApiClient {
  constructor(baseUrl = config.API_BASE_URL) {
    this.baseUrl = baseUrl;
  }

  async reviewCode({ code, language, focus }, { signal } = {}) {
    const body = { code, language };
    if (Array.isArray(focus) && focus.length > 0) body.focus = focus;
    const res = await this.#request('/api/v1/reviews', {
      method: 'POST',
      body: JSON.stringify(body),
      signal,
    });
    return { ...res.data, requestId: res.requestId };
  }

  async getLanguages() {
    const res = await this.#request('/api/v1/languages', { timeoutMs: config.HEALTH_TIMEOUT_MS });
    if (!Array.isArray(res.data)) {
      throw new ApiError({ code: 'BAD_RESPONSE', message: 'Languages response was malformed' });
    }
    return res.data;
  }

  getHealth() {
    return this.#request('/api/health', { timeoutMs: config.HEALTH_TIMEOUT_MS });
  }

  async #request(path, { method = 'GET', body, signal, timeoutMs = config.REQUEST_TIMEOUT_MS } = {}) {
    const controller = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
    const onExternalAbort = () => controller.abort();
    signal?.addEventListener('abort', onExternalAbort, { once: true });

    let response;
    try {
      response = await fetch(this.baseUrl + path, {
        method,
        body,
        headers: body ? { 'Content-Type': 'application/json', Accept: 'application/json' } : { Accept: 'application/json' },
        signal: controller.signal,
      });
    } catch (err) {
      if (timedOut) {
        throw new ApiError({
          code: 'CLIENT_TIMEOUT',
          message: `No response from the server within ${Math.round(timeoutMs / 1000)}s`,
          retryable: true,
        });
      }
      if (err?.name === 'AbortError') {
        throw new ApiError({ code: 'ABORTED', message: 'Request was cancelled', retryable: true });
      }
      throw new ApiError({
        code: 'NETWORK_ERROR',
        message: 'Could not reach the server. Is the backend running?',
        retryable: true,
      });
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onExternalAbort);
    }

    const headerRequestId = response.headers.get('X-Request-Id');
    let payload;
    try {
      const text = await response.text();
      payload = text ? JSON.parse(text) : null;
    } catch {
      throw new ApiError({
        status: response.status,
        code: 'BAD_RESPONSE',
        message: `Server returned a non-JSON response (HTTP ${response.status})`,
        retryable: response.status >= 500,
        requestId: headerRequestId,
      });
    }

    const requestId = payload?.requestId ?? headerRequestId;

    if (!response.ok) {
      const e = payload?.error ?? {};
      throw new ApiError({
        status: response.status,
        code: e.code ?? `HTTP_${response.status}`,
        message: e.message ?? `Request failed with HTTP ${response.status}`,
        details: e.details,
        retryable: typeof e.retryable === 'boolean' ? e.retryable : response.status >= 500 || response.status === 429,
        requestId,
      });
    }

    if (payload === null || typeof payload !== 'object') {
      throw new ApiError({ status: response.status, code: 'BAD_RESPONSE', message: 'Server returned an empty response', requestId });
    }
    return { ...payload, requestId };
  }
}
