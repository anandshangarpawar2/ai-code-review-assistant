const { randomUUID } = require('node:crypto');

/** Tag every request with an id (reused from X-Request-Id if the caller sent a sane one) for log correlation. */
function requestId(req, res, next) {
  const incoming = req.get('X-Request-Id');
  req.id = incoming && /^[\w-]{1,64}$/.test(incoming) ? incoming : randomUUID();
  res.set('X-Request-Id', req.id);
  next();
}

module.exports = { requestId };
