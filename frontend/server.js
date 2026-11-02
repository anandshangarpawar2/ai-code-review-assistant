// Zero-dependency static file server for the frontend. Usage: PORT=5173 node server.js
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname);
const PORT = Number(process.env.PORT) || 5173;
const HOST = process.env.HOST || '127.0.0.1';

const CONTENT_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
};

// Never serve server-side files even though they live in the same folder.
const BLOCKED = new Set(['server.js', 'package.json', 'package-lock.json']);

function send(res, status, body, type = 'text/plain; charset=utf-8') {
  res.writeHead(status, { 'Content-Type': type, 'X-Content-Type-Options': 'nosniff' });
  res.end(body);
}

function resolveSafePath(urlPath) {
  let decoded;
  try {
    decoded = decodeURIComponent(urlPath);
  } catch {
    return null;
  }
  if (decoded.includes('\0')) return null;
  const relative = decoded === '/' ? 'index.html' : decoded.replace(/^\/+/, '');
  const resolved = path.resolve(ROOT, relative);
  const rel = path.relative(ROOT, resolved);
  if (rel === '' || rel.startsWith('..') || path.isAbsolute(rel)) return null;
  if (rel.split(path.sep).some((seg) => seg.startsWith('.') || seg === 'node_modules')) return null;
  if (BLOCKED.has(rel)) return null;
  return resolved;
}

const server = http.createServer((req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD');
    return send(res, 405, 'Method Not Allowed');
  }

  // Inspect the raw URL too: clients/proxies may normalise "/../" away, but we reject it outright.
  const rawPath = (req.url || '/').split('?')[0].split('#')[0];
  if (/(^|[\\/])\.\.([\\/]|$)/.test(rawPath) || /%2e%2e/i.test(rawPath)) {
    return send(res, 403, 'Forbidden');
  }

  const filePath = resolveSafePath(rawPath);
  if (!filePath) return send(res, 403, 'Forbidden');

  fs.stat(filePath, (err, stat) => {
    if (err || !stat.isFile()) return send(res, 404, 'Not Found');
    const type = CONTENT_TYPES[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
    res.writeHead(200, {
      'Content-Type': type,
      'Content-Length': stat.size,
      'Cache-Control': 'no-cache',
      'X-Content-Type-Options': 'nosniff',
    });
    if (req.method === 'HEAD') return res.end();
    fs.createReadStream(filePath)
      .on('error', () => res.destroy())
      .pipe(res);
  });
});

server.listen(PORT, HOST, () => {
  console.log(`Frontend served at http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}`);
});
