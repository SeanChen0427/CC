import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { mkdirSync } from 'node:fs';
import { resolve, join, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openStore } from './store.mjs';
import { api, sessionFor } from './api.mjs';
import { art } from './art.mjs';
import { AppError } from '../domain/rules.mjs';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const mime = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon' };

export async function startApp({ directory = join(ROOT, '.local'), customerPort = 4173, adminPort = 4174,
  password, seed = false, quiet = false } = {}) {
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const credentialPath = join(directory, 'admin-credentials.txt');
  const store = openStore(join(directory, 'preorder.sqlite'), { seed, password, credentialPath });
  const servers = [];
  for (const [role, port] of [['customer', customerPort], ['admin', adminPort]]) {
    const appRoot = join(ROOT, 'apps', role === 'customer' ? 'customer-web' : 'admin-web');
    const server = createServer(async (req, res) => {
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Referrer-Policy', 'same-origin');
      res.setHeader('Cache-Control', 'no-store');
      res.setHeader('Content-Security-Policy', "default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'");
      try {
        const actualPort = server.address().port;
        const hosts = [`127.0.0.1:${actualPort}`, `localhost:${actualPort}`];
        if (!hosts.includes(req.headers.host)) throw new AppError('僅允許本機存取', 403);
        const url = new URL(req.url, `http://${req.headers.host}`);
        if (url.pathname === '/config.json') {
          res.setHeader('Content-Type','application/json');res.end(JSON.stringify({mode:'local',role,demoMode:seed,customerURL:'http://127.0.0.1:'+servers[0].address().port+'/'}));return;
        }
        const sharedFiles={'/runtime.js':'shared/runtime.js','/product-art.js':'server/art.mjs','/product-gallery.js':'shared/product-gallery.js','/product-pricing.js':'shared/product-pricing.js','/product-categories.js':'shared/product-categories.js'};
        if (sharedFiles[url.pathname]) {
          res.setHeader('Content-Type','text/javascript; charset=utf-8');res.end(await readFile(join(ROOT,sharedFiles[url.pathname])));return;
        }
        if (url.pathname.startsWith('/api/')) {
          const method = req.method;
          let body = {};
          if (!['GET','HEAD'].includes(method)) {
            if (!hosts.map(h => 'http://' + h).includes(req.headers.origin)) throw new AppError('請從本機網站操作', 403);
            if (!(req.headers['content-type'] || '').startsWith('application/json')) throw new AppError('請使用 JSON', 415);
            let raw = '';
            for await (const chunk of req) {
              raw += chunk;
              if (Buffer.byteLength(raw) > 2200000) throw new AppError('資料超過允許大小', 413);
            }
            try { body = raw ? JSON.parse(raw) : {}; }
            catch { throw new AppError('資料格式不正確'); }
            if (!body || typeof body !== 'object' || Array.isArray(body)) throw new AppError('資料格式不正確');
          }
          const result = await api({ store, req, role, path: url.pathname, method, body,
            session: sessionFor(store, req, role), localDir: directory, credentialPath });
          if (result.cookie) { res.setHeader('Set-Cookie', result.cookie); delete result.cookie; }
          if (result.buffer) {
            res.setHeader('Content-Type', result.type);
            res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
            res.end(result.buffer);
          } else { res.setHeader('Content-Type', 'application/json; charset=utf-8'); res.end(JSON.stringify(result)); }
          return;
        }
        const artMatch = url.pathname.match(/^\/assets\/art\/(vest|coat|bag|bowl|bed|toy|scarf)\.svg$/);
        if (artMatch) {
          res.setHeader('Content-Type', 'image/svg+xml');
          res.setHeader('Cache-Control', 'public,max-age=3600');
          res.end(art(artMatch[1], url.searchParams.get('color'), Number(url.searchParams.get('angle'))));
          return;
        }
        let file;
        if (/^\/uploads\/[a-f0-9]{24}\.(png|jpg|webp)$/.test(url.pathname)) {
          file = join(directory, url.pathname.slice(1));
        } else {
          let pathname;
          try { pathname = decodeURIComponent(url.pathname); } catch { throw new AppError('路徑無效'); }
          file = resolve(appRoot, '.' + (pathname === '/' ? '/index.html' : pathname));
          if (!file.startsWith(appRoot + sep)) throw new AppError('找不到頁面', 404);
        }
        if ((await stat(file)).isDirectory()) throw new AppError('找不到頁面', 404);
        res.setHeader('Content-Type', mime[extname(file)] || 'application/octet-stream');
        res.end(await readFile(file));
      } catch (error) {
        const status = error.status || (error.code === 'ENOENT' ? 404 : 500);
        res.statusCode = status;
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.end(JSON.stringify({ error: status === 500 ? '服務暫時無法完成，請稍後重試' : error.message }));
        if (status === 500 && !quiet) console.error('Request failed:', error.message);
      }
    });
    await new Promise((resolveReady, reject) => {
      server.once('error', reject);
      server.listen(port, '127.0.0.1', resolveReady);
    });
    servers.push(server);
  }
  if (!quiet) {
    console.log(`客戶端 http://127.0.0.1:${servers[0].address().port}`);
    console.log(`管理端 http://127.0.0.1:${servers[1].address().port}`);
    console.log('本機管理帳密：.local/admin-credentials.txt（私有檔，不上傳）');
  }
  return {
    store, customerPort: servers[0].address().port, adminPort: servers[1].address().port,
    async close() {
      await Promise.all(servers.map(server => new Promise(done => server.close(done))));
      store.db.close();
    },
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const app = await startApp({ customerPort: Number(process.env.CUSTOMER_PORT || 4173),
    adminPort: Number(process.env.ADMIN_PORT || 4174), seed: process.env.CCBABY_DEMO_MODE === '1' });
  let stopping = false;
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, async () => {
    if (stopping) return;
    stopping = true; await app.close(); process.exit(0);
  });
}
