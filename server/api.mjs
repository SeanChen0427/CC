import { randomBytes, scryptSync, timingSafeEqual, createHash } from 'node:crypto';
import { writeFileSync, mkdirSync, unlinkSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { AppError, text, integer, contact, assertOpen, fingerprint, validateProcurement, csvRows } from '../domain/rules.mjs';
import { DEMO_USERS } from './store.mjs';
import { workbook } from './xlsx.mjs';

const now = () => new Date().toISOString();
const cookieName = role => `sp_${role}`;
const digest = value => createHash('sha256').update(value).digest('hex');
const loginAttempts = new Map();

export function sessionFor(store, req, role) {
  const value = (req.headers.cookie || '').split(';').map(x => x.trim())
    .find(x => x.startsWith(cookieName(role) + '='))?.split('=')[1];
  if (!value) return null;
  return store.get('SELECT * FROM sessions WHERE token=? AND role=? AND expires>?',
    digest(value), role, Date.now()) || null;
}

function login(store, role, subject) {
  const token = randomBytes(32).toString('hex');
  store.run('DELETE FROM sessions WHERE expires<?', Date.now());
  store.run('INSERT INTO sessions VALUES(?,?,?,?)', digest(token), role, subject, Date.now() + 12 * 3600000);
  return { cookie: `${cookieName(role)}=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=43200` };
}

function requireSession(session) {
  if (!session) throw new AppError('請先登入', 401);
}

function summary(store) {
  const orders = store.orders(), report = store.report();
  const active = orders.filter(o => o.quantity > 0);
  return {
    customers: active.length,
    quantity: active.reduce((sum, o) => sum + o.quantity, 0),
    total: active.reduce((sum, o) => sum + o.total, 0),
    bought: report.reduce((sum, r) => sum + r.bought, 0),
    remaining: report.reduce((sum, r) => sum + r.remaining, 0),
    shortage: report.reduce((sum, r) => sum + r.shortage, 0),
    products: store.get('SELECT COUNT(*) AS n FROM products WHERE active=1').n,
  };
}

function validateProduct(input) {
  const code = text(input.code, '商品編號', 30);
  if (!/^[A-Za-z0-9_-]+$/.test(code)) throw new AppError('商品編號請用英文、數字、底線或連字號');
  const name = text(input.name, '商品名稱', 80);
  const category = text(input.category, '商品分類', 30);
  const price = integer(Number(input.price), '售價', 1000000, 1);
  const extra = integer(Number(input.extra || 0), '大尺寸加價', 100000);
  const colors = [...new Set(text(input.colors, '顏色', 200).split(/[,，]/).map(x => x.trim()).filter(Boolean))];
  const sizes = [...new Set(text(input.sizes, '規格', 200).split(/[,，]/).map(x => x.trim()).filter(Boolean))];
  if (colors.length > 12 || sizes.length > 12 || colors.some(x => x.length > 30) || sizes.some(x => x.length > 30)) {
    throw new AppError('顏色及規格各最多 12 種，每種名稱最多 30 字');
  }
  const kinds = ['vest', 'coat', 'bag', 'bowl', 'bed', 'toy', 'scarf'];
  if (!kinds.includes(input.kind)) throw new AppError('請選擇有效的示意圖類型');
  const tone = /^#[a-fA-F0-9]{6}$/.test(input.tone) ? input.tone : '#b9a38b';
  const images = (Array.isArray(input.images) ? input.images : []).slice(0, 8);
  if (images.some(x => typeof x !== 'string' || !/^\/uploads\/[a-f0-9]{24}\.(png|jpg|webp)$/.test(x))) {
    throw new AppError('商品圖片位置無效');
  }
  return {
    code, name, category, price, extra, colors, sizes, kind: input.kind, tone,
    description: String(input.description || '').slice(0, 3000),
    badge: String(input.badge || '').slice(0, 20),
    active: input.active === false ? 0 : 1, images,
  };
}

function saveProduct(store, input, id) {
  const p = validateProduct(input);
  const duplicate = store.get('SELECT id FROM products WHERE code=?', p.code);
  if (duplicate && duplicate.id !== id) throw new AppError('商品編號已存在，請使用不同編號', 409);
  if (id && !store.get('SELECT id FROM products WHERE id=?', id)) throw new AppError('找不到商品', 404);
  const values = [p.code, p.name, p.category, p.description, p.kind, p.tone, p.badge, p.active, JSON.stringify(p.images)];
  if (id) store.run(`UPDATE products SET code=?,name=?,category=?,description=?,kind=?,tone=?,badge=?,active=?,images=? WHERE id=?`, ...values, id);
  else id = Number(store.run(`INSERT INTO products(code,name,category,description,kind,tone,badge,active,images,created_at)
    VALUES(?,?,?,?,?,?,?,?,?,?)`, ...values, now()).lastInsertRowid);
  const previous = store.all('SELECT * FROM variants WHERE product_id=?', id);
  store.run('UPDATE variants SET active=0 WHERE product_id=?', id);
  for (const color of p.colors) for (const size of p.sizes) {
    const price = p.price + (['XL', '2XL'].includes(size) ? p.extra : 0);
    const old = previous.find(v => v.color === color && v.size === size);
    if (old) store.run('UPDATE variants SET price=?,active=1 WHERE id=?', price, old.id);
    else store.run('INSERT INTO variants(product_id,color,size,price) VALUES(?,?,?,?)', id, color, size, price);
  }
  store.event('product.save', id, { code: p.code, name: p.name });
  return id;
}

function importPreview(store, csv) {
  const rows = csvRows(text(csv, 'CSV 內容', 1000000));
  const headers = rows.shift().map(x => x.trim());
  const required = ['code', 'name', 'category', 'price', 'colors', 'sizes'];
  if (required.some(key => !headers.includes(key))) {
    throw new AppError('CSV 欄位需包含 code,name,category,price,colors,sizes');
  }
  const seen = new Set(), errors = [], products = [];
  rows.forEach((cells, index) => {
    try {
      const input = Object.fromEntries(headers.map((key, i) => [key, cells[i] || '']));
      input.kind ||= 'vest'; input.tone ||= '#b9a38b';
      const product = validateProduct(input);
      if (seen.has(product.code) || store.get('SELECT id FROM products WHERE code=?', product.code)) {
        throw new AppError('商品編號重複：' + product.code);
      }
      seen.add(product.code); products.push({ ...input, line: index + 2 });
    } catch (error) { errors.push({ line: index + 2, message: error.message }); }
  });
  return { products, errors, count: rows.length };
}

export async function api({ store, req, role, path, method, body, session, localDir, credentialPath }) {
  if (path === '/api/health') return { ok: true, role, database: 'sqlite', localOnly: true };
  if (path.startsWith('/api/admin/') && role !== 'admin') throw new AppError('此入口不提供管理功能', 403);
  if (path.startsWith('/api/customer/') && role !== 'customer') throw new AppError('此入口不提供客戶登入功能', 403);
  if (path === '/api/catalog' && role === 'customer' && method === 'GET') {
    return { campaign: store.campaign(), products: store.catalog(), localOnly: true, lineConfigured: false };
  }
  if (path === '/api/me' && method === 'GET') {
    return { authenticated: Boolean(session), role, localOnly: true,
      user: session && role === 'customer' ? store.get('SELECT * FROM customers WHERE id=?', session.subject) : null,
      profiles: role === 'customer' && store.demoMode ? DEMO_USERS.slice(0, 4) : undefined };
  }
  if (path === '/api/logout' && method === 'POST') {
    if (session) store.run('DELETE FROM sessions WHERE token=?', session.token);
    return { ok: true, cookie: `${cookieName(role)}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0` };
  }
  if (path === '/api/customer/login' && method === 'POST') {
    if (!store.demoMode) throw new AppError('LINE 登入準備中', 403);
    const user = DEMO_USERS.find(x => x.id === body.profile);
    if (!user) throw new AppError('請選擇本機測試會員');
    store.run('INSERT OR IGNORE INTO customers(id,display_name) VALUES(?,?)', user.id, user.name);
    return { ok: true, ...login(store, role, user.id), user: store.get('SELECT * FROM customers WHERE id=?', user.id) };
  }
  if (path === '/api/admin/login' && method === 'POST') {
    const key = req.socket.remoteAddress;
    const attempt = loginAttempts.get(key);
    if (attempt && attempt.until > Date.now() && attempt.count >= 8) {
      throw new AppError('登入嘗試較多，請五分鐘後再試', 429);
    }
    const account = store.get('SELECT * FROM admin WHERE id=1');
    const derived = scryptSync(String(body.password || '').slice(0, 256), account.salt, 64);
    const correct = timingSafeEqual(derived, Buffer.from(account.hash, 'hex')) && body.username === account.username;
    if (!correct) {
      const current = !attempt || attempt.until <= Date.now() ? { count: 0, until: Date.now() + 300000 } : attempt;
      current.count++; loginAttempts.set(key, current);
      throw new AppError('帳號或密碼不正確', 401);
    }
    loginAttempts.delete(key);
    return { ok: true, ...login(store, role, 'owner') };
  }
  requireSession(session);

  if (path === '/api/customer/orders' && method === 'GET') return { orders: store.orders(session.subject), campaign: store.campaign() };
  if (path === '/api/customer/profile' && method === 'PATCH') {
    const details = contact(body);
    store.run('UPDATE customers SET name=?,phone=?,delivery=? WHERE id=?',
      details.name, details.phone, String(body.delivery || '').slice(0, 500), session.subject);
    store.event('customer.profile', session.subject, { updated: true });
    return { ok: true };
  }
  if (path === '/api/customer/preorders' && method === 'POST') {
    const requestId = text(body.requestId, '送出識別', 100);
    const hash = fingerprint(body);
    const saved = store.get('SELECT * FROM submissions WHERE customer_id=? AND request_id=?', session.subject, requestId);
    if (saved) {
      if (saved.fingerprint !== hash) throw new AppError('同一送出識別不能重複使用於不同內容', 409);
      return JSON.parse(saved.result);
    }
    assertOpen(store.campaign());
    const details = contact(body);
    if (!Array.isArray(body.items) || !body.items.length || body.items.length > 150) throw new AppError('請先將商品加入購物車');
    const combined = new Map();
    for (const item of body.items) {
      integer(item.quantity, '數量', 99, 1);
      integer(item.variantId, '規格識別', 1000000, 1);
      const variant = store.get(`SELECT v.*,p.name,p.code,p.active AS product_active FROM variants v
        JOIN products p ON p.id=v.product_id WHERE v.id=?`, item.variantId);
      if (!variant || !variant.active || !variant.product_active) throw new AppError('部分商品已停止預購，請返回購物車調整', 409);
      if (variant.price !== item.expectedPrice) throw new AppError(`${variant.name} 的價格已更新，請移除並重新選購後再送出`, 409);
      const qty = (combined.get(variant.id)?.quantity || 0) + item.quantity;
      integer(qty, '同規格數量', 99, 1);
      combined.set(variant.id, { ...variant, quantity: qty });
    }
    return store.transaction(() => {
      let order = store.get('SELECT * FROM preorders WHERE customer_id=?', session.subject);
      if (!order) {
        const id = Number(store.run(`INSERT INTO preorders(customer_id,name,phone,created_at,updated_at)
          VALUES(?,?,?,?,?)`, session.subject, details.name, details.phone, now(), now()).lastInsertRowid);
        store.run('UPDATE preorders SET code=? WHERE id=?', `KR26-${String(id).padStart(4, '0')}`, id);
        order = store.get('SELECT * FROM preorders WHERE id=?', id);
      }
      for (const item of combined.values()) {
        const old = store.get('SELECT * FROM items WHERE order_id=? AND variant_id=? AND price=?', order.id, item.id, item.price);
        if (old) {
          integer(old.quantity + item.quantity, '累計數量', 999, 1);
          store.run('UPDATE items SET quantity=quantity+? WHERE id=?', item.quantity, old.id);
        } else store.run(`INSERT INTO items(order_id,variant_id,product_code,product_name,color,size,price,quantity)
          VALUES(?,?,?,?,?,?,?,?)`, order.id, item.id, item.code, item.name, item.color, item.size, item.price, item.quantity);
      }
      store.run('UPDATE preorders SET name=?,phone=?,updated_at=?,version=version+1 WHERE id=?',
        details.name, details.phone, now(), order.id);
      store.run('UPDATE customers SET name=?,phone=? WHERE id=?', details.name, details.phone, session.subject);
      const result = { ok: true, orderId: order.id, code: order.code, added: [...combined.values()].reduce((sum, i) => sum + i.quantity, 0) };
      store.run('INSERT INTO submissions VALUES(?,?,?,?)', session.subject, requestId, hash, JSON.stringify(result));
      store.event('preorder.submit', order.id, { customer: session.subject, items: [...combined.values()] });
      return result;
    });
  }
  const itemMatch = path.match(/^\/api\/customer\/items\/(\d+)$/);
  if (itemMatch && method === 'PATCH') {
    assertOpen(store.campaign());
    const item = store.get(`SELECT i.* FROM items i JOIN preorders o ON o.id=i.order_id
      WHERE i.id=? AND o.customer_id=?`, Number(itemMatch[1]), session.subject);
    if (!item) throw new AppError('找不到這筆預購', 404);
    const quantity = integer(body.quantity, '數量', 999);
    const recorded = store.get('SELECT bought,shortage FROM procurement WHERE variant_id=?', item.variant_id);
    if (item.bought || item.shortage || recorded?.bought || recorded?.shortage) {
      throw new AppError('這項商品已有採購紀錄，請聯絡店主協助', 409);
    }
    return store.transaction(() => {
      store.run('UPDATE items SET quantity=? WHERE id=?', quantity, item.id);
      store.run('UPDATE preorders SET updated_at=?,version=version+1 WHERE id=?', now(), item.order_id);
      store.event('preorder.modify', item.id, { before: item.quantity, after: quantity });
      return { ok: true };
    });
  }
  if (path === '/api/admin/state' && method === 'GET') {
    return {
      campaign: store.campaign(), products: store.catalog(true), orders: store.orders(),
      report: store.report(), stats: summary(store),
      events: store.all('SELECT id,kind,subject,created_at FROM events ORDER BY id DESC LIMIT 12'),
    };
  }
  if (path === '/api/admin/products' && method === 'POST') {
    const id = store.transaction(() => saveProduct(store, body, body.id ? Number(body.id) : undefined));
    return { ok: true, id };
  }
  if (path === '/api/admin/import' && method === 'POST') {
    const preview = importPreview(store, body.csv);
    if (body.commit) {
      if (preview.errors.length) throw new AppError('請先修正所有匯入錯誤');
      store.transaction(() => {
        for (const product of preview.products) saveProduct(store, product);
        store.event('products.import', 'campaign', { count: preview.count });
      });
    }
    return { ok: true, ...preview };
  }
  const procurement = path.match(/^\/api\/admin\/procurement\/(\d+)$/);
  if (procurement && method === 'PUT') {
    const row = store.report().find(r => r.variant_id === Number(procurement[1]));
    if (!row) throw new AppError('找不到採買需求', 404);
    if (row.version !== body.version) throw new AppError('資料已在另一個畫面更新，請重新整理', 409);
    validateProcurement({ demand: row.demand, bought: body.bought, shortage: body.shortage,
      allocatedBought: row.allocated_bought, allocatedShortage: row.allocated_shortage });
    return store.transaction(() => {
      store.run(`INSERT INTO procurement(variant_id,bought,shortage,note,version) VALUES(?,?,?,?,1)
        ON CONFLICT(variant_id) DO UPDATE SET bought=excluded.bought,shortage=excluded.shortage,note=excluded.note,version=procurement.version+1`,
        row.variant_id, body.bought, body.shortage, String(body.note || '').slice(0, 500));
      store.event('procurement.update', row.variant_id, { before: row, after: body });
      return { ok: true };
    });
  }
  if (path === '/api/admin/allocation' && method === 'POST') {
    const item = store.get('SELECT * FROM items WHERE id=?', Number(body.itemId));
    if (!item || !item.quantity) throw new AppError('找不到有效明細', 404);
    const row = store.report().find(r => r.variant_id === item.variant_id);
    const bought = integer(body.bought, '分配買到數', item.quantity);
    const shortage = integer(body.shortage, '分配缺貨數', item.quantity);
    if (bought + shortage > item.quantity) throw new AppError('買到與缺貨合計超過預購數量');
    if (row.allocated_bought - item.bought + bought > row.bought ||
        row.allocated_shortage - item.shortage + shortage > row.shortage) {
      throw new AppError('超過已記錄的採購／缺貨數量，請先更新採買表');
    }
    return store.transaction(() => {
      store.run('UPDATE items SET bought=?,shortage=? WHERE id=?', bought, shortage, item.id);
      store.event('allocation.update', item.id, { bought, shortage });
      return { ok: true };
    });
  }
  if (path === '/api/admin/campaign' && method === 'PUT') {
    const statuses = ['draft', 'open', 'closed', 'purchasing', 'arrived', 'archived'];
    if (!statuses.includes(body.status)) throw new AppError('活動階段無效');
    const name = text(body.name, '活動名稱', 80);
    const closes = new Date(body.closesAt);
    if (!Number.isFinite(closes.getTime())) throw new AppError('請填寫有效的截止時間');
    const closesAt = closes.toISOString();
    return store.transaction(() => {
      if (store.campaign().status === 'open' && body.status !== 'open') {
        store.run('INSERT INTO closing_snapshots(data,created_at) VALUES(?,?)', JSON.stringify(store.report()), now());
      }
      store.run('UPDATE campaign SET name=?,status=?,closes_at=? WHERE id=1', name, body.status, closesAt);
      store.event('campaign.update', '1', { name, status: body.status, closesAt });
      return { ok: true };
    });
  }
  if (path === '/api/admin/upload' && method === 'POST') {
    const match = String(body.data || '').match(/^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/=]+)$/);
    if (!match) throw new AppError('請選擇 PNG、JPG 或 WebP 圖片');
    const buffer = Buffer.from(match[2], 'base64');
    if (buffer.length > 1400000) throw new AppError('圖片需小於 1.4 MB');
    const valid = match[1] === 'png' ? buffer.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))
      : match[1] === 'jpeg' ? buffer[0] === 255 && buffer[1] === 216
      : buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP';
    if (!valid) throw new AppError('圖片內容與檔案類型不符');
    mkdirSync(join(localDir, 'uploads'), { recursive: true, mode: 0o700 });
    const filename = randomBytes(12).toString('hex') + '.' + (match[1] === 'jpeg' ? 'jpg' : match[1]);
    writeFileSync(join(localDir, 'uploads', filename), buffer, { mode: 0o600 });
    return { ok: true, url: '/uploads/' + filename };
  }
  if (path === '/api/admin/password' && method === 'POST') {
    const account = store.get('SELECT * FROM admin');
    const oldHash = scryptSync(String(body.current || '').slice(0, 256), account.salt, 64);
    if (!timingSafeEqual(oldHash, Buffer.from(account.hash, 'hex'))) throw new AppError('目前密碼不正確', 401);
    const password = text(body.password, '新密碼', 128);
    if (password.length < 12) throw new AppError('新密碼至少 12 個字元');
    const salt = randomBytes(16).toString('hex');
    store.transaction(() => {
      store.run('UPDATE admin SET salt=?,hash=? WHERE id=1', salt, scryptSync(password, salt, 64).toString('hex'));
      store.run("DELETE FROM sessions WHERE role='admin'");
    });
    if (credentialPath && existsSync(credentialPath)) unlinkSync(credentialPath);
    return { ok: true, cookie: 'sp_admin=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0' };
  }
  if (path === '/api/admin/export.xlsx' && method === 'GET') {
    const campaign = store.campaign(), exported = now();
    const customerRows = [['活動','預購編號','LINE 暱稱','聯絡姓名','手機','商品編號','商品名稱','規格','數量','預估單價','預估小計','分配買到','分配缺貨','收件資料','匯出時間']];
    for (const o of store.orders()) for (const i of o.items) customerRows.push([
      campaign.name,o.code,o.customer.display_name,o.name,o.phone,i.product_code,i.product_name,
      i.color + ' / ' + i.size,i.quantity,i.price,i.quantity*i.price,i.bought,i.shortage,o.customer.delivery,exported,
    ]);
    const reportRows = [['活動','商品編號','商品名稱','顏色','尺寸／規格','需求','已買','待採買','確認缺貨','未分配已買','備註','匯出時間'],
      ...store.report().map(r => [campaign.name,r.code,r.name,r.color,r.size,r.demand,r.bought,r.remaining,r.shortage,r.unallocated,r.note,exported])];
    return { buffer: workbook([{ name: '客戶預購明細', rows: customerRows }, { name: '採買彙總', rows: reportRows }]),
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', filename: 'ccbaby-preorder.xlsx' };
  }
  if (path === '/api/admin/backup' && method === 'GET') {
    const tables = ['campaign','customers','products','variants','preorders','items','procurement','events','closing_snapshots'];
    return { buffer: Buffer.from(JSON.stringify({ schemaVersion: 1, exportedAt: now(),
      tables: Object.fromEntries(tables.map(table => [table, store.all('SELECT * FROM ' + table)])) }, null, 2)),
      type: 'application/json', filename: 'ccbaby-preorder-backup.json' };
  }
  throw new AppError('找不到此功能', 404);
}
