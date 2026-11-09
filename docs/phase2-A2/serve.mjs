// serve.mjs — rewrite-aware local serve for the A2 QA runs (Wave A cluster A2).
// Serves public/ at the root (what Vercel serves) and applies vercel.json
// rewrites, so extensionless links resolve. Never use plain `python3
// -m http.server` here: it 404s every extensionless link (phase-1 lesson;
// that is a serve artifact, not a page defect).
// Fixture: /api/espn/scoreboard returns {"events":[]} locally (the real
// rewrite proxies ESPN, unreachable from the offline harness). The landing
// page's own Tonight strip still fetches ESPN directly and fails offline;
// that cross-origin failure is the recorded T13 fixture, out of scope.
// Usage: node docs/phase2-A2/serve.mjs [port]   (default 8473)
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', '..', 'public');
const vercel = JSON.parse(fs.readFileSync(path.resolve(here, '..', '..', 'vercel.json'), 'utf8'));
const port = Number(process.argv[2] || 8473);

const rewrites = (vercel.rewrites || []).filter((r) => !r.destination.startsWith('http'));
function rewrite(p) {
  for (const r of rewrites) {
    if (!r.source.includes(':')) { if (r.source === p) return r.destination; continue; }
    const srcParts = r.source.split('/'), pParts = p.split('/');
    if (srcParts.length !== pParts.length) continue;
    const params = {};
    let ok = true;
    for (let i = 0; i < srcParts.length; i++) {
      if (srcParts[i].startsWith(':')) params[srcParts[i].slice(1)] = pParts[i];
      else if (srcParts[i] !== pParts[i]) { ok = false; break; }
    }
    if (ok) return r.destination.replace(/:([a-zA-Z]+)/g, (_, k) => params[k] || '');
  }
  return null;
}

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json', '.txt': 'text/plain', '.md': 'text/plain' };

const server = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://127.0.0.1');
  let p = decodeURIComponent(u.pathname);
  if (p === '/api/espn/scoreboard') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ events: [] }));
    return;
  }
  const rw = rewrite(p);
  if (rw) p = rw;
  if (p.endsWith('/')) p += 'index.html';
  const file = path.join(root, p);
  if (!file.startsWith(root)) { res.writeHead(403); res.end(); return; }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404, { 'content-type': 'text/plain' }); res.end('404 ' + p); return; }
    res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream' });
    res.end(data);
  });
});
server.listen(port, '127.0.0.1', () => console.log('A2 serve: http://127.0.0.1:' + port + '/ from ' + root));
