// Wiring and state. Talks to the API via ApiClient and to the DOM via ui.js.
import { config } from './config.js';
import { ApiClient, ApiError } from './api.js';
import * as ui from './ui.js';

const api = new ApiClient(config.API_BASE_URL);

const state = {
  inFlight: null,      // AbortController of the current review request
  lastPayload: null,   // for Retry
  issues: [],          // sorted
  filter: 'all',
};

const SAMPLE_CODE = `var cache = {};

async function fetchUser(id) {
  const res = await fetch('/api/users/' + id);
  return res.json();
}

function calculate(expr) {
  // Evaluate user-supplied math expressions
  return eval(expr);
}

async function showUser(id) {
  var user = fetchUser(id); // missing await
  console.log('User loaded', user);
  cache[id] = user;
  document.getElementById('name').innerHTML = user.name;
  for (var i = 0; i <= user.friends.length; i++) {
    console.log(user.friends[i]);
  }
}
`;

function validate({ code, language }) {
  const errors = {};
  if (!code.trim()) errors.code = 'Please paste some code to review.';
  else if (code.length > config.MAX_CODE_LENGTH) {
    errors.code = `Code is ${code.length.toLocaleString()} characters; the limit is ${config.MAX_CODE_LENGTH.toLocaleString()}.`;
  }
  if (!language) errors.language = 'Please choose a language.';
  return errors;
}

async function submitReview(payload) {
  state.inFlight?.abort();
  const controller = new AbortController();
  state.inFlight = controller;
  state.lastPayload = payload;

  ui.hideError();
  ui.setLoading(true);
  try {
    const result = await api.reviewCode(payload, { signal: controller.signal });
    state.issues = ui.sortIssues(Array.isArray(result.review?.issues) ? result.review.issues : []);
    state.filter = 'all';
    ui.renderReview(result);
    ui.renderIssues(state.issues, state.filter);
  } catch (err) {
    if (err instanceof ApiError && err.code === 'ABORTED' && state.inFlight !== controller) return;
    const apiErr = err instanceof ApiError
      ? err
      : new ApiError({ code: 'UNKNOWN_ERROR', message: err?.message || String(err) });
    console.error('Review failed', apiErr);
    ui.showError(apiErr);
    if (apiErr.code === 'VALIDATION_ERROR' && Array.isArray(apiErr.details)) {
      const fieldErrors = {};
      for (const d of apiErr.details) if (d?.field && d?.message) fieldErrors[d.field] = d.message;
      ui.renderFieldErrors(fieldErrors);
    }
  } finally {
    if (state.inFlight === controller) {
      state.inFlight = null;
      ui.setLoading(false);
    }
  }
}

function onSubmit(event) {
  event.preventDefault();
  if (state.inFlight) return;
  const payload = ui.readForm();
  const errors = validate(payload);
  ui.renderFieldErrors(errors);
  if (Object.keys(errors).length > 0) return;
  submitReview(payload);
}

async function loadLanguages() {
  let languages = config.FALLBACK_LANGUAGES;
  try {
    const fromApi = await api.getLanguages();
    if (fromApi.length > 0) languages = fromApi;
  } catch (err) {
    console.warn('Falling back to static language list:', err.message);
  }
  ui.renderLanguages(languages, 'javascript');
}

async function checkHealth() {
  try {
    const health = await api.getHealth();
    const ok = health.status === 'ok';
    ui.renderHealth(ok ? 'ok' : 'down', ok ? `Online · ${health.provider ?? 'unknown provider'}` : `Degraded (${health.status})`);
  } catch (err) {
    ui.renderHealth('down', err.code === 'NETWORK_ERROR' ? 'Backend offline' : `Backend error (${err.code})`);
  }
}

function init() {
  ui.setApiUrl(config.API_BASE_URL);
  ui.renderFocusOptions(config.FOCUS_AREAS);
  ui.renderCharCount(0, config.MAX_CODE_LENGTH);

  const { form, code, sampleBtn, clearBtn, retryBtn, dismissErrorBtn, severityFilter, language } = ui.els;

  form.addEventListener('submit', onSubmit);
  code.addEventListener('input', () => {
    ui.renderCharCount(code.value.length, config.MAX_CODE_LENGTH);
    if (code.getAttribute('aria-invalid') === 'true' && code.value.trim()) ui.renderFieldErrors({});
  });
  code.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) form.requestSubmit();
    // Let Tab insert two spaces unless Shift is held; Esc then Tab still leaves the editor.
    if (e.key === 'Tab' && !e.shiftKey && !code.dataset.escaped) {
      e.preventDefault();
      code.setRangeText('  ', code.selectionStart, code.selectionEnd, 'end');
      code.dispatchEvent(new Event('input'));
    }
    if (e.key === 'Escape') code.dataset.escaped = '1';
    else if (e.key !== 'Tab') delete code.dataset.escaped;
  });
  code.addEventListener('blur', () => delete code.dataset.escaped);
  language.addEventListener('change', () => {
    if (language.value) ui.renderFieldErrors({});
  });

  sampleBtn.addEventListener('click', () => {
    code.value = SAMPLE_CODE;
    language.value = 'javascript';
    ui.renderCharCount(code.value.length, config.MAX_CODE_LENGTH);
    ui.renderFieldErrors({});
    code.focus();
  });
  clearBtn.addEventListener('click', () => {
    code.value = '';
    ui.renderCharCount(0, config.MAX_CODE_LENGTH);
    ui.renderFieldErrors({});
    ui.hideError();
    code.focus();
  });

  retryBtn.addEventListener('click', () => {
    if (state.lastPayload && !state.inFlight) submitReview(state.lastPayload);
  });
  dismissErrorBtn.addEventListener('click', () => ui.hideError());
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && document.activeElement !== code) ui.hideError();
  });

  severityFilter.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-severity]');
    if (!btn) return;
    state.filter = btn.dataset.severity;
    ui.renderIssues(state.issues, state.filter);
  });

  loadLanguages();
  checkHealth();
  setInterval(checkHealth, 30_000);
}

init();
