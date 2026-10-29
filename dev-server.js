// Local stand-in for Vercel: serves /public and runs /api/*.js the same way Vercel does.
// Usage: APP_PASSWORD=test ZEUS_ICS_URL=… node dev-server.js
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 3000);
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };

function wrapRes(res) {
  res.status = (c) => { res.statusCode = c; return res; };
  res.json = (o) => { if (!res.getHeader('Content-Type')) res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(o)); return res; };
  res.send = (b) => { res.end(b); return res; };
  return res;
}

export function createServer() {
  return http.createServer(async (req, res) => {
    wrapRes(res);
    const url = new URL(req.url, 'http://localhost');
    let p = url.pathname === '/feed.ics' ? '/api/feed' : url.pathname;
    try {
      if (p.startsWith('/api/')) {
        const file = path.join(root, 'api', path.basename(p) + '.js');
        if (!fs.existsSync(file)) return res.status(404).json({ error: 'Not found' });
        const chunks = [];
        for await (const c of req) chunks.push(c);
        const raw = Buffer.concat(chunks).toString();
        req.query = Object.fromEntries(url.searchParams);
        try { req.body = raw && /json/.test(req.headers['content-type'] || '') ? JSON.parse(raw) : raw; } catch { req.body = raw; }
        const mod = await import(pathToFileURL(file).href);
        return await mod.default(req, res);
      }
      if (p === '/') p = '/index.html';
      const file = path.join(root, 'public', path.normalize(p).replace(/^(\.\.[/\\])+/, ''));
      if (!file.startsWith(path.join(root, 'public')) || !fs.existsSync(file)) return res.status(404).send('Not found');
      res.setHeader('Content-Type', TYPES[path.extname(file)] || 'application/octet-stream');
      fs.createReadStream(file).pipe(res);
    } catch (e) {
      console.error(e);
      if (!res.headersSent) res.status(500).json({ error: e.message });
    }
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  createServer().listen(PORT, () => console.log(`http://localhost:${PORT}`));
}
