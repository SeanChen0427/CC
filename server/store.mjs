import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, chmodSync, existsSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { randomBytes, scryptSync } from 'node:crypto';
import { categoryNames } from '../shared/product-categories.js';
import { promotionSettings } from '../domain/promotion.mjs';

export const DEMO_USERS = [
  { id: 'demo-visitor', name: '測試訪客' },
  { id: 'demo-anna', name: '林小安' },
  { id: 'demo-yiching', name: '陳以晴' },
  { id: 'demo-mumu', name: '王沐沐' },
  { id: 'demo-tang', name: '周小棠' },
  { id: 'demo-lee', name: '李安安' },
  { id: 'demo-hsu', name: '許子涵' },
];

export function openStore(filename, { seed = false, password, credentialPath } = {}) {
  if (filename !== ':memory:') mkdirSync(dirname(filename), { recursive: true, mode: 0o700 });
  const db = new DatabaseSync(filename);
  db.exec(`
    PRAGMA foreign_keys=ON;
    PRAGMA journal_mode=WAL;
    CREATE TABLE IF NOT EXISTS campaign (
      id INTEGER PRIMARY KEY CHECK(id=1), name TEXT NOT NULL,
      status TEXT NOT NULL, closes_at TEXT NOT NULL, description TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS cost_settings (
      id INTEGER PRIMARY KEY CHECK(id=1), exchange_rate REAL NOT NULL
    );
    CREATE TABLE IF NOT EXISTS merchandising_settings (
      id INTEGER PRIMARY KEY CHECK(id=1), data TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS promotion_settings (
      id INTEGER PRIMARY KEY CHECK(id=1), data TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS customer_care (
      customer_id TEXT PRIMARY KEY REFERENCES customers(id), data TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS order_notices (
      order_id INTEGER PRIMARY KEY REFERENCES preorders(id), data TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS admin (
      id INTEGER PRIMARY KEY CHECK(id=1), username TEXT NOT NULL UNIQUE,
      salt TEXT NOT NULL, hash TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY, role TEXT NOT NULL, subject TEXT NOT NULL,
      expires INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS customers (
      id TEXT PRIMARY KEY, display_name TEXT NOT NULL, name TEXT NOT NULL DEFAULT '',
      phone TEXT NOT NULL DEFAULT '', delivery TEXT NOT NULL DEFAULT ''
    );
    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY, code TEXT UNIQUE NOT NULL, name TEXT NOT NULL,
      category TEXT NOT NULL, description TEXT NOT NULL, kind TEXT NOT NULL,
      tone TEXT NOT NULL, badge TEXT NOT NULL DEFAULT '', active INTEGER NOT NULL DEFAULT 1,
      images TEXT NOT NULL DEFAULT '[]', created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS variants (
      id INTEGER PRIMARY KEY, product_id INTEGER NOT NULL REFERENCES products(id),
      color TEXT NOT NULL, size TEXT NOT NULL, price INTEGER NOT NULL CHECK(price>=0),
      active INTEGER NOT NULL DEFAULT 1
    );
    CREATE TABLE IF NOT EXISTS categories (
      name TEXT PRIMARY KEY NOT NULL, created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS preorders (
      id INTEGER PRIMARY KEY, customer_id TEXT NOT NULL REFERENCES customers(id),
      code TEXT UNIQUE, name TEXT NOT NULL, phone TEXT NOT NULL, created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 1,
      deleted_at TEXT, delete_reason TEXT NOT NULL DEFAULT ''
    );
    CREATE TABLE IF NOT EXISTS items (
      id INTEGER PRIMARY KEY, order_id INTEGER NOT NULL REFERENCES preorders(id),
      variant_id INTEGER NOT NULL REFERENCES variants(id),
      product_code TEXT NOT NULL, product_name TEXT NOT NULL,
      color TEXT NOT NULL, size TEXT NOT NULL, price INTEGER NOT NULL,
      quantity INTEGER NOT NULL CHECK(quantity>=0),
      bought INTEGER NOT NULL DEFAULT 0, shortage INTEGER NOT NULL DEFAULT 0,
      UNIQUE(order_id, variant_id, price)
    );
    CREATE TABLE IF NOT EXISTS submissions (
      customer_id TEXT NOT NULL, request_id TEXT NOT NULL,
      fingerprint TEXT NOT NULL, result TEXT NOT NULL,
      PRIMARY KEY(customer_id,request_id)
    );
    CREATE TABLE IF NOT EXISTS procurement (
      variant_id INTEGER PRIMARY KEY REFERENCES variants(id),
      bought INTEGER NOT NULL DEFAULT 0, shortage INTEGER NOT NULL DEFAULT 0,
      note TEXT NOT NULL DEFAULT '', version INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS events (
      id INTEGER PRIMARY KEY, kind TEXT NOT NULL, subject TEXT NOT NULL,
      detail TEXT NOT NULL, created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS browsing_events (
      customer_id TEXT NOT NULL REFERENCES customers(id), id TEXT NOT NULL,
      at TEXT NOT NULL, received_at TEXT NOT NULL, data TEXT NOT NULL,
      PRIMARY KEY(customer_id,id)
    );
    CREATE INDEX IF NOT EXISTS browsing_events_time ON browsing_events(at);
    CREATE INDEX IF NOT EXISTS browsing_events_customer_time ON browsing_events(customer_id,at,id);
    CREATE TABLE IF NOT EXISTS closing_snapshots (
      id INTEGER PRIMARY KEY, data TEXT NOT NULL, created_at TEXT NOT NULL
    );
  `);
  upgradePreorders(db);
  if (!db.prepare('PRAGMA table_info(customers)').all().some(column => column.name === 'contact_code')) {
    db.exec('ALTER TABLE customers ADD COLUMN contact_code TEXT');
  }
  db.exec('CREATE UNIQUE INDEX IF NOT EXISTS customer_contact_code ON customers(contact_code) WHERE contact_code IS NOT NULL');
  if (!db.prepare('PRAGMA table_info(products)').all().some(column => column.name === 'image_bindings')) {
    db.exec("ALTER TABLE products ADD COLUMN image_bindings TEXT NOT NULL DEFAULT '[]'");
  }
  if (!db.prepare('PRAGMA table_info(products)').all().some(column => column.name === 'pricing')) {
    db.exec('ALTER TABLE products ADD COLUMN pricing TEXT');
  }
  if (!db.prepare('PRAGMA table_info(products)').all().some(column => column.name === 'source_url')) {
    db.exec("ALTER TABLE products ADD COLUMN source_url TEXT NOT NULL DEFAULT ''");
  }
  if (!db.prepare('PRAGMA table_info(procurement)').all().some(column => column.name === 'cost')) {
    db.exec('ALTER TABLE procurement ADD COLUMN cost TEXT');
  }
  if (filename !== ':memory:') chmodSync(filename, 0o600);
  const store = {
    db, demoMode: seed,
    all: (sql, ...args) => db.prepare(sql).all(...args),
    get: (sql, ...args) => db.prepare(sql).get(...args),
    run: (sql, ...args) => db.prepare(sql).run(...args),
    transaction(fn) {
      db.exec('BEGIN IMMEDIATE');
      try { const value = fn(); db.exec('COMMIT'); return value; }
      catch (error) { db.exec('ROLLBACK'); throw error; }
    },
    event(kind, subject, detail) {
      this.run('INSERT INTO events(kind,subject,detail,created_at) VALUES(?,?,?,?)',
        kind, String(subject), JSON.stringify(detail), new Date().toISOString());
    },
    campaign() {
      const row = this.get('SELECT * FROM campaign WHERE id=1');
      return { id: row.id, name: row.name, status: row.status, closesAt: row.closes_at, description: row.description };
    },
    categories() {
      return categoryNames(this.all('SELECT name FROM categories ORDER BY rowid').map(row=>row.name),this.all('SELECT category FROM products ORDER BY id'));
    },
    costSettings() {
      return {exchangeRate:this.get('SELECT exchange_rate FROM cost_settings WHERE id=1')?.exchange_rate ?? null};
    },
    merchandisingSettings() {
      const row=this.get('SELECT data FROM merchandising_settings WHERE id=1');
      return row?JSON.parse(row.data):{version:0,productIds:[],previousIds:[]};
    },
    promotionSettings() {
      const row=this.get('SELECT data FROM promotion_settings WHERE id=1');
      return promotionSettings(row?JSON.parse(row.data):undefined);
    },
    careRecords() {
      return Object.fromEntries(this.all('SELECT * FROM customer_care').map(r=>[r.customer_id,JSON.parse(r.data)]));
    },
    noticeRecords() {
      return Object.fromEntries(this.all('SELECT * FROM order_notices').map(r=>[r.order_id,JSON.parse(r.data)]));
    },
    catalog(includeInactive = false) {
      const products = this.all(`SELECT * FROM products ${includeInactive ? '' : 'WHERE active=1'} ORDER BY id`);
      const variants = this.all('SELECT * FROM variants ORDER BY id');
      const costs=includeInactive?this.all('SELECT variant_id,cost,version FROM procurement'):[];
      return products.map(({source_url,...p}) => ({
        ...p, ...(includeInactive ? {sourceUrl:source_url || ''} : {}), active: Boolean(p.active), images: JSON.parse(p.images), imageBindings: JSON.parse(p.image_bindings),
        ...(p.pricing ? JSON.parse(p.pricing) : {}),
        variants: variants.filter(v => v.product_id === p.id && (includeInactive || v.active))
          .map(v => {const row=costs.find(r=>r.variant_id===v.id);return { ...v, active: Boolean(v.active),...(includeInactive?{cost:row?.cost?JSON.parse(row.cost):null,costVersion:row?.version || 0}:{}) };}),
      }));
    },
    orders(customerId) {
      const orders = customerId
        ? this.all('SELECT * FROM preorders WHERE deleted_at IS NULL AND customer_id=? ORDER BY id DESC', customerId)
        : this.all('SELECT * FROM preorders WHERE deleted_at IS NULL ORDER BY updated_at DESC');
      const items = this.all('SELECT * FROM items WHERE quantity>0 ORDER BY id');
      return orders.map(order => ({
        ...order,
        customer: this.get('SELECT * FROM customers WHERE id=?', order.customer_id),
        items: items.filter(item => item.order_id === order.id),
      })).map(order => ({
        ...order,
        total: order.items.reduce((sum, item) => sum + item.price * item.quantity, 0),
        quantity: order.items.reduce((sum, item) => sum + item.quantity, 0),
      }));
    },
    report() {
      return this.all(`
        SELECT v.id AS variant_id, p.code, p.name, p.category, p.kind, p.tone, p.source_url AS sourceUrl,
          v.color, v.size, COALESCE(SUM(i.quantity),0) AS demand,
          COALESCE(SUM(i.bought),0) AS allocated_bought,
          COALESCE(SUM(i.shortage),0) AS allocated_shortage,
          COALESCE(r.bought,0) AS bought, COALESCE(r.shortage,0) AS shortage,
          COALESCE(r.note,'') AS note, COALESCE(r.version,0) AS version, r.cost,
          MIN(i.price) AS priceMin, MAX(i.price) AS priceMax, SUM(i.price*i.quantity) AS salesTotal
        FROM variants v JOIN products p ON p.id=v.product_id
        JOIN items i ON i.variant_id=v.id AND i.quantity>0
        JOIN preorders o ON o.id=i.order_id AND o.deleted_at IS NULL
        LEFT JOIN procurement r ON r.variant_id=v.id
        GROUP BY v.id ORDER BY p.id,v.id
      `).map(row => ({
        ...row, cost:row.cost ? JSON.parse(row.cost) : null, remaining: Math.max(row.demand - row.bought - row.shortage, 0),
        unallocated: row.bought - row.allocated_bought,
      }));
    },
  };
  if (!store.get('SELECT id FROM admin')) {
    const secret = password || randomBytes(12).toString('base64url');
    const salt = randomBytes(16).toString('hex');
    store.run('INSERT INTO admin VALUES(1,?,?,?)', 'hannah', salt, scryptSync(secret, salt, 64).toString('hex'));
    if (credentialPath) writeFileSync(credentialPath,
      `僅供本機測試\n後台：http://127.0.0.1:4174\n帳號：hannah\n密碼：${secret}\n\n正式上線前請更換密碼，勿將本檔上傳。\n`,
      { mode: 0o600 });
  }
  if (!store.get('SELECT id FROM campaign')) {
    const close = new Date(Date.now() + 14 * 86400000).toISOString();
    store.run('INSERT INTO campaign VALUES(1,?,?,?,?)', 'CCBABY 韓國預購', seed ? 'open' : 'draft', close,
      '把喜歡的，先收進清單。韓國親自採買，到台後再通知付款。');
  }
  if (seed && !store.get('SELECT id FROM products LIMIT 1')) seedData(store);
  return store;
}

function upgradePreorders(db) {
  const columns=db.prepare('PRAGMA table_info(preorders)').all();
  if(!columns.some(c=>c.name==='deleted_at'))db.exec('ALTER TABLE preorders ADD COLUMN deleted_at TEXT');
  if(!columns.some(c=>c.name==='delete_reason'))db.exec("ALTER TABLE preorders ADD COLUMN delete_reason TEXT NOT NULL DEFAULT ''");
  const legacyUnique=db.prepare('PRAGMA index_list(preorders)').all().some(index=>{
    const fields=db.prepare('SELECT name FROM pragma_index_info(?)').all(index.name);
    return index.unique && !index.partial && fields.length===1 && fields[0].name==='customer_id';
  });
  if(legacyUnique) {
    // Replace the old unconditional customer uniqueness without deleting history or items.
    db.exec('PRAGMA foreign_keys=OFF; BEGIN IMMEDIATE;');
    try {
      db.exec(`CREATE TABLE preorders_upgrade (
        id INTEGER PRIMARY KEY, customer_id TEXT NOT NULL REFERENCES customers(id),
        code TEXT UNIQUE, name TEXT NOT NULL, phone TEXT NOT NULL, created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 1,
        deleted_at TEXT, delete_reason TEXT NOT NULL DEFAULT ''
      );
      INSERT INTO preorders_upgrade SELECT id,customer_id,code,name,phone,created_at,updated_at,version,deleted_at,delete_reason FROM preorders;
      DROP TABLE preorders;
      ALTER TABLE preorders_upgrade RENAME TO preorders;`);
      if(db.prepare('PRAGMA foreign_key_check').all().length)throw new Error('預購升級關聯檢查失敗');
      db.exec('COMMIT');
    } catch(error) {db.exec('ROLLBACK');throw error;}
    finally {db.exec('PRAGMA foreign_keys=ON');}
  }
  db.exec('CREATE UNIQUE INDEX IF NOT EXISTS preorders_active_customer ON preorders(customer_id) WHERE deleted_at IS NULL');
}

function seedData(store) {
  const bases = [
    ['奶油針織背心', '毛孩衣著', 'vest', '#d5c3a5', 590, '人氣選物'],
    ['雲朵絎縫外套', '毛孩衣著', 'coat', '#a9b8ad', 890, 'NEW'],
    ['格紋散步提袋', '外出配件', 'bag', '#b9a38b', 690, 'NEW'],
    ['奶霜陶瓷食碗', '餐食器皿', 'bowl', '#c7b7a4', 450, '編輯推薦'],
    ['小熊搖粒絨', '毛孩衣著', 'vest', '#bd947d', 790, ''],
    ['週末棉麻領巾', '生活選物', 'scarf', '#a6ad8f', 290, ''],
    ['暖日毛絨睡墊', '居家用品', 'bed', '#cbb49e', 1290, ''],
    ['布丁聞嗅玩具', '玩具小物', 'toy', '#d8b66a', 390, ''],
    ['旅行隨行提袋', '外出配件', 'bag', '#9caaa2', 990, ''],
    ['雙耳慢食小碗', '餐食器皿', 'bowl', '#c79e99', 490, ''],
    ['柔霧針織開衫', '毛孩衣著', 'coat', '#c6a8ab', 750, ''],
    ['小森林咬咬球', '玩具小物', 'toy', '#a4b092', 350, ''],
    ['薄荷散步小包', '外出配件', 'bag', '#a4b6a3', 590, ''],
    ['圓圓收納籃', '居家用品', 'bed', '#b7a486', 850, ''],
    ['花園棉紗領巾', '生活選物', 'scarf', '#c8b787', 320, ''],
    ['燕麥保暖背心', '毛孩衣著', 'vest', '#cfbf9c', 650, ''],
    ['日光雙層睡墊', '居家用品', 'bed', '#adbaa7', 1190, ''],
    ['小雲朵食器', '餐食器皿', 'bowl', '#b0b9bd', 420, ''],
    ['豆豆布偶玩具', '玩具小物', 'toy', '#caa7a1', 390, ''],
    ['冬日飛行外套', '毛孩衣著', 'coat', '#98a2a3', 1090, ''],
    ['簡約外出托特', '外出配件', 'bag', '#b8aa94', 790, ''],
    ['暖暖毛絨小窩', '居家用品', 'bed', '#c5aeb7', 1490, ''],
    ['午茶小圓碗', '餐食器皿', 'bowl', '#b8c3a4', 450, ''],
    ['細格日常領巾', '生活選物', 'scarf', '#b69b8b', 290, ''],
  ];
  store.transaction(() => {
    for (let series = 0; series < 5; series++) {
      bases.forEach((base, index) => {
        const [name, category, kind, tone, price, badge] = base;
        const id = series * bases.length + index + 1;
        const code = `SP${String(id).padStart(3, '0')}`;
        const suffix = ['', '・暖日款', '・經典款', '・秋日款', '・輕旅款'][series];
        store.run(`INSERT INTO products(code,name,category,description,kind,tone,badge,created_at)
          VALUES(?,?,?,?,?,?,?,?)`, code, name + suffix, category,
          '柔和的日常色調，剛剛好的生活細節。由我們在韓國親自挑選，適合慢慢收藏的日常選物。\n本商品為本機示範資料，圖片為原創向量示意，正式款式與規格將另行上架。',
          kind, tone, series === 0 ? badge : '', new Date().toISOString());
        const sizes = ['vest', 'coat'].includes(kind) ? ['S', 'M', 'L', 'XL'] : ['標準'];
        for (const color of ['奶油白', '燕麥棕', '鼠尾草綠']) {
          for (const size of sizes) {
            store.run('INSERT INTO variants(product_id,color,size,price) VALUES(?,?,?,?)',
              id, color, size, price + (size === 'XL' ? 100 : 0));
          }
        }
      });
    }
    for (const user of DEMO_USERS) {
      store.run('INSERT INTO customers(id,display_name) VALUES(?,?)', user.id, user.name);
    }
    for (let i = 1; i < DEMO_USERS.length; i++) {
      const user = DEMO_USERS[i];
      const date = new Date(Date.now() - (7 - i) * 3600000).toISOString();
      store.run('UPDATE customers SET name=? WHERE id=?', user.name, user.id);
      const order = store.run(`INSERT INTO preorders(customer_id,code,name,phone,created_at,updated_at)
        VALUES(?,?,?,?,?,?)`, user.id, `KR26-${String(i).padStart(4, '0')}`, user.name, '', date, date);
      for (let j = 0; j < 3; j++) {
        const variant = store.get(`SELECT v.*,p.code,p.name FROM variants v
          JOIN products p ON p.id=v.product_id WHERE p.id=? ORDER BY v.id LIMIT 1`, (i + j * 2) % 10 + 1);
        store.run(`INSERT INTO items(order_id,variant_id,product_code,product_name,color,size,price,quantity)
          VALUES(?,?,?,?,?,?,?,?)`, Number(order.lastInsertRowid), variant.id,
          variant.code, variant.name, variant.color, variant.size, variant.price, (i + j) % 2 + 1);
      }
    }
  });
}
