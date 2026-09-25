// ローカル開発サーバ（Vercel なしで 静的ファイル＋ /api/extract を動かす）
//   node lib/dev-server.js [port]
// 環境変数は .env.local（gitignore済み）から読む: ANTHROPIC_API_KEY / SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY
const http = require('http');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const envPath = path.join(root, '.env.local');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}
const extract = require('../api/extract');
const port = Number(process.argv[2] || process.env.PORT || 3100);
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css', '.json': 'application/json', '.md': 'text/markdown; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml' };

http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${port}`);
  if (url.pathname === '/api/extract') {
    // Vercel 互換の薄いラッパ
    const r = { setHeader: (k, v) => res.setHeader(k, v), status(c) { res.statusCode = c; return r; }, json(o) { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(o)); } };
    req.headers = req.headers; // そのまま
    return extract(req, r);
  }
  let p = decodeURIComponent(url.pathname);
  if (p === '/') p = '/index.html';
  const file = path.join(root, p);
  if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.statusCode = 404; return res.end('not found'); }
  res.setHeader('Content-Type', MIME[path.extname(file)] || 'application/octet-stream');
  fs.createReadStream(file).pipe(res);
}).listen(port, () => console.log(`katachi dev server http://localhost:${port}`));
