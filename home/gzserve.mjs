// Static server that gzips like GitHub Pages does, so speed is measured on the bytes a phone really downloads.
import http from 'http'; import fs from 'fs'; import path from 'path'; import zlib from 'zlib';
const ROOT = process.argv[2], PORT = +process.argv[3];
const T = { '.html': 'text/html; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' };
const cache = new Map();
http.createServer((q, r) => {
  const f = path.join(ROOT, decodeURIComponent(q.url.split('?')[0]).replace(/\.\.+/g, ''));
  fs.readFile(f, (e, buf) => {
    if (e) { r.writeHead(404); return r.end('no'); }
    const ext = path.extname(f), h = { 'Content-Type': T[ext] || 'application/octet-stream', 'Cache-Control': 'max-age=600' };
    if (/gzip/.test(q.headers['accept-encoding'] || '') && /html|json|javascript|css|svg/.test(h['Content-Type'])) {
      const k = f + buf.length; if (!cache.has(k)) cache.set(k, zlib.gzipSync(buf)); h['Content-Encoding'] = 'gzip'; buf = cache.get(k);
    }
    r.writeHead(200, h); r.end(buf);
  });
}).listen(PORT, '127.0.0.1', () => console.log('gz server on', PORT));
