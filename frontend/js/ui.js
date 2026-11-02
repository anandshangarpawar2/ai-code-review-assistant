// DOM rendering only. No fetch, no app state. Model output is always set via textContent.

const $ = (id) => document.getElementById(id);

export const SEVERITY_ORDER = { critical: 0, major: 1, minor: 2, info: 3 };

const FRIENDLY_ERRORS = {
  VALIDATION_ERROR: 'Some of the input was rejected by the server.',
  PAYLOAD_TOO_LARGE: 'That code is too large to review. Try a smaller snippet.',
  INVALID_JSON: 'The request was malformed. Please reload the page and try again.',
  NOT_FOUND: 'The API endpoint was not found. Check the backend URL.',
  RATE_LIMITED: 'You are sending requests too quickly. Wait a moment and retry.',
  LLM_RATE_LIMITED: 'The AI provider is rate-limiting us right now. Please retry shortly.',
  LLM_BAD_RESPONSE: 'The AI returned a response we could not understand. Retrying usually helps.',
  LLM_UNAVAILABLE: 'The AI provider is temporarily unavailable.',
  LLM_TIMEOUT: 'The AI took too long to respond.',
  INTERNAL_ERROR: 'Something went wrong on the server.',
  NETWORK_ERROR: 'Could not reach the backend. Is it running and is CORS enabled?',
  CLIENT_TIMEOUT: 'The request timed out before the server answered.',
  BAD_RESPONSE: 'The server sent an unexpected response.',
};

export const els = {
  form: $('review-form'),
  code: $('code'),
  language: $('language'),
  focusOptions: $('focus-options'),
  submitBtn: $('submit-btn'),
  sampleBtn: $('sample-btn'),
  clearBtn: $('clear-btn'),
  retryBtn: $('retry-btn'),
  dismissErrorBtn: $('dismiss-error-btn'),
  severityFilter: $('severity-filter'),
};

export function setApiUrl(url) {
  $('api-url').textContent = url;
}

export function renderHealth(state, text) {
  $('health-dot').dataset.state = state; // 'ok' | 'down' | 'unknown'
  $('health-text').textContent = text;
}

export function renderLanguages(languages, selected = 'javascript') {
  const select = els.language;
  select.replaceChildren();
  const placeholder = new Option('Select a language…', '');
  select.add(placeholder);
  for (const lang of languages) {
    select.add(new Option(lang, lang, false, lang === selected));
  }
}

export function renderFocusOptions(areas) {
  els.focusOptions.replaceChildren(
    ...areas.map((area) => {
      const label = document.createElement('label');
      label.className = 'checkbox';
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.name = 'focus';
      input.value = area;
      const span = document.createElement('span');
      span.textContent = area.replace('-', ' ');
      label.append(input, span);
      return label;
    }),
  );
}

export function readForm() {
  return {
    code: els.code.value,
    language: els.language.value,
    focus: [...els.focusOptions.querySelectorAll('input[name="focus"]:checked')].map((i) => i.value),
  };
}

export function renderCharCount(length, max) {
  const el = $('char-count');
  el.textContent = `${length.toLocaleString()} / ${max.toLocaleString()}`;
  el.classList.toggle('over', length > max);
  el.classList.toggle('near', length <= max && length > max * 0.9);
}

export function renderFieldErrors(errors) {
  for (const field of ['code', 'language']) {
    const msg = errors[field];
    const errEl = $(`${field}-error`);
    errEl.textContent = msg || '';
    errEl.hidden = !msg;
    els[field].setAttribute('aria-invalid', msg ? 'true' : 'false');
  }
  const firstInvalid = ['code', 'language'].find((f) => errors[f]);
  if (firstInvalid) els[firstInvalid].focus();
}

export function setLoading(isLoading) {
  els.submitBtn.disabled = isLoading;
  els.submitBtn.classList.toggle('is-loading', isLoading);
  els.submitBtn.querySelector('.btn-label').textContent = isLoading ? 'Reviewing…' : 'Review code';
  $('results').setAttribute('aria-busy', String(isLoading));
  $('loading-state').hidden = !isLoading;
  if (isLoading) {
    $('empty-state').hidden = true;
    $('review').hidden = true;
  }
}

export function showEmptyState() {
  $('empty-state').hidden = false;
  $('review').hidden = true;
}

export function showError(err) {
  const banner = $('error-banner');
  $('error-title').textContent = FRIENDLY_ERRORS[err.code] || 'Request failed';
  $('error-message').textContent = err.message || '';

  const detailsEl = $('error-details');
  const details = Array.isArray(err.details) ? err.details : [];
  detailsEl.replaceChildren(
    ...details.map((d) => {
      const li = document.createElement('li');
      li.textContent = d && typeof d === 'object' ? [d.field, d.message].filter(Boolean).join(': ') : String(d);
      return li;
    }),
  );
  detailsEl.hidden = details.length === 0;

  const reqEl = $('error-request-id');
  reqEl.textContent = err.requestId ? `Request ID: ${err.requestId}` : '';
  reqEl.hidden = !err.requestId;

  els.retryBtn.hidden = !err.retryable;
  banner.hidden = false;
  (err.retryable ? els.retryBtn : els.dismissErrorBtn).focus({ preventScroll: true });
  if (!$('review').hidden) return;
  $('empty-state').hidden = false;
}

export function hideError() {
  $('error-banner').hidden = true;
}

function scoreTier(score) {
  if (score >= 8) return 'good';
  if (score >= 5) return 'fair';
  return 'poor';
}

export function renderReview({ review, meta }) {
  const score = Number.isFinite(review.overallScore) ? review.overallScore : null;
  const badge = $('score-badge');
  $('score-value').textContent = score ?? '–';
  badge.dataset.tier = score === null ? 'none' : scoreTier(score);
  badge.setAttribute('aria-label', score === null ? 'Overall score unavailable' : `Overall score ${score} out of 10`);

  $('summary').textContent = review.summary || 'No summary provided.';

  const metaParts = [];
  if (meta?.provider) metaParts.push(meta.provider);
  if (meta?.language) metaParts.push(meta.language);
  if (Number.isFinite(meta?.latencyMs)) metaParts.push(`${(meta.latencyMs / 1000).toFixed(1)}s`);
  if (meta?.reviewedAt) {
    const d = new Date(meta.reviewedAt);
    if (!Number.isNaN(d.getTime())) metaParts.push(d.toLocaleTimeString());
  }
  $('meta').textContent = metaParts.join(' · ');

  const strengths = Array.isArray(review.strengths) ? review.strengths : [];
  $('strengths-list').replaceChildren(
    ...strengths.map((s) => {
      const li = document.createElement('li');
      li.textContent = String(s);
      return li;
    }),
  );
  $('strengths-section').hidden = strengths.length === 0;

  $('empty-state').hidden = true;
  $('review').hidden = false;
}

export function sortIssues(issues) {
  return [...issues].sort((a, b) => {
    const sa = SEVERITY_ORDER[a.severity] ?? 99;
    const sb = SEVERITY_ORDER[b.severity] ?? 99;
    if (sa !== sb) return sa - sb;
    return (a.line ?? Infinity) - (b.line ?? Infinity);
  });
}

function issueCard(issue) {
  const li = document.createElement('li');
  li.className = 'issue-card';
  li.dataset.severity = issue.severity || 'info';

  const head = document.createElement('div');
  head.className = 'issue-head';

  const sev = document.createElement('span');
  sev.className = 'sev-chip';
  sev.dataset.severity = issue.severity || 'info';
  sev.textContent = issue.severity || 'info';
  head.append(sev);

  if (issue.category) {
    const cat = document.createElement('span');
    cat.className = 'cat-chip';
    cat.textContent = issue.category;
    head.append(cat);
  }
  if (Number.isInteger(issue.line)) {
    const line = document.createElement('span');
    line.className = 'line-ref';
    line.textContent = `Line ${issue.line}`;
    head.append(line);
  }

  const title = document.createElement('h4');
  title.className = 'issue-title';
  title.textContent = issue.title || 'Untitled issue';

  const desc = document.createElement('p');
  desc.className = 'issue-desc';
  desc.textContent = issue.description || '';

  li.append(head, title, desc);

  if (issue.suggestion) {
    const sugWrap = document.createElement('div');
    sugWrap.className = 'issue-suggestion';
    const label = document.createElement('span');
    label.className = 'suggestion-label';
    label.textContent = 'Suggestion';
    const sug = document.createElement('p');
    sug.textContent = issue.suggestion;
    sugWrap.append(label, sug);
    li.append(sugWrap);
  }
  return li;
}

export function renderIssues(sortedIssues, filter) {
  const visible = filter === 'all' ? sortedIssues : sortedIssues.filter((i) => i.severity === filter);
  $('issue-list').replaceChildren(...visible.map(issueCard));

  const counts = sortedIssues.reduce((acc, i) => ((acc[i.severity] = (acc[i.severity] || 0) + 1), acc), {});
  $('issues-count').textContent = `(${sortedIssues.length})`;
  for (const btn of els.severityFilter.querySelectorAll('.chip-btn')) {
    const sev = btn.dataset.severity;
    btn.setAttribute('aria-pressed', String(sev === filter));
    const n = sev === 'all' ? sortedIssues.length : counts[sev] || 0;
    btn.textContent = `${sev[0].toUpperCase()}${sev.slice(1)} ${n}`;
  }

  const emptyEl = $('issues-empty');
  if (sortedIssues.length === 0) {
    emptyEl.textContent = 'No issues found. Nice work!';
  } else if (visible.length === 0) {
    emptyEl.textContent = `No ${filter} issues.`;
  }
  emptyEl.hidden = visible.length > 0;
}
