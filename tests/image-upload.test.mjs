import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { prepareUpload } from '../apps/admin-web/image-upload.js';
import { startApp } from '../server/index.mjs';
import { productGif, productGifData } from './fixtures/product-gif.mjs';

test('GIF preparation preserves every source byte and bypasses still-image resizing', async () => {
  const original = { Image: globalThis.Image, FileReader: globalThis.FileReader, document: globalThis.document };
  let revoked = 0;
  const revoke = URL.revokeObjectURL;
  URL.revokeObjectURL = value => { revoked++; revoke(value); };
  globalThis.Image = class {
    naturalWidth = 2400; naturalHeight = 32;
    set src(value) { queueMicrotask(() => this.onload()); }
  };
  globalThis.FileReader = class {
    async readAsDataURL(blob) { this.result = `data:${blob.type};base64,${Buffer.from(await blob.arrayBuffer()).toString('base64')}`; this.onload(); }
  };
  globalThis.document = { createElement() { throw new Error('GIF must never pass through canvas'); } };
  try {
    for (const type of ['image/gif', '']) {
      assert.equal(await prepareUpload(new File([Buffer.from(productGif, 'base64')], 'animation.GIF', { type })), productGifData);
    }
    assert.equal(revoked, 2);
    await assert.rejects(prepareUpload(new File([new Uint8Array(1400001)], 'large.gif', { type: 'image/gif' })), /1.4 MB.*保留動畫/);
    await assert.rejects(prepareUpload(new File([], 'empty.gif', { type: 'image/gif' })), /空檔案/);
    await assert.rejects(prepareUpload(new File(['<svg/>'], 'image.svg', { type: 'image/svg+xml' })), /JPG.*GIF/);
  } finally {
    URL.revokeObjectURL = revoke;
    for (const [key, value] of Object.entries(original)) { if (value === undefined) delete globalThis[key]; else globalThis[key] = value; }
  }
});

test('local GIF upload enforces role, content and size, and preserves gallery order through restart and CSV', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'ccbaby-gif-test-')), password = randomUUID();
  let app = await startApp({ directory, customerPort: 0, adminPort: 0, password, seed: true, quiet: true });
  const jars = {};
  const request = async (role, path, body) => {
    const base = `http://127.0.0.1:${app[role + 'Port']}`;
    const response = await fetch(base + '/api/' + path, { method: body ? 'POST' : 'GET', headers: { Origin: base, 'Content-Type': 'application/json', ...(jars[role] ? { Cookie: jars[role] } : {}) }, body: body ? JSON.stringify(body) : undefined });
    const cookie = response.headers.get('set-cookie'); if (cookie) jars[role] = cookie.split(';')[0];
    return { status: response.status, data: await response.json() };
  };
  try {
    assert.equal((await request('admin', 'admin/upload', { data: productGifData })).status, 401);
    assert.equal((await request('customer', 'admin/upload', { data: productGifData })).status, 403);
    assert.equal((await request('admin', 'admin/login', { username: 'hannah', password })).status, 200);
    const gif = await request('admin', 'admin/upload', { data: productGifData });
    assert.equal(gif.status, 200); assert.match(gif.data.url, /^\/uploads\/[a-f0-9]{24}\.gif$/);
    const served = await fetch(`http://127.0.0.1:${app.customerPort}` + gif.data.url);
    assert.equal(served.headers.get('content-type'), 'image/gif');
    assert.equal(Buffer.from(await served.arrayBuffer()).toString('base64'), productGif);
    const invalid = ['data:image/gif;base64,' + Buffer.from('GIF89a').toString('base64'), productGifData.replace('image/gif', 'image/png'), 'data:image/gif;base64,' + Buffer.alloc(1400001).toString('base64')];
    for (const data of invalid) assert.equal((await request('admin', 'admin/upload', { data })).status, 400);
    const png = '/uploads/' + 'a'.repeat(24) + '.png';
    const body = { code: 'GIF', name: '動畫測試商品', category: '衣著', price: 590, colors: '紅,藍', sizes: 'S', kind: 'vest', tone: '#b9a38b', images: [png, gif.data.url], imageBindings: [{ color: '藍', url: gif.data.url }] };
    assert.equal((await request('admin', 'admin/products', body)).status, 200);
    const saved = (await request('admin', 'admin/state')).data.products.find(p => p.code === 'GIF');
    assert.equal((await request('admin', 'admin/products', { ...body, id: saved.id, images: [gif.data.url, png] })).status, 200);
    const response = await fetch(`http://127.0.0.1:${app.adminPort}/api/admin/products.csv`, { headers: { Cookie: jars.admin } });
    const exported = (await response.text()).split('\r\n');
    const csv = [exported[0], ...exported.filter(row => row.startsWith('GIF,'))].join('\r\n').replace('GIF,', 'GIF-COPY,');
    assert.equal((await request('admin', 'admin/import', { csv, commit: true })).status, 200);
    await app.close(); app = await startApp({ directory, customerPort: 0, adminPort: 0, quiet: true, seed: true });
    const products = (await request('admin', 'admin/state')).data.products;
    for (const code of ['GIF', 'GIF-COPY']) {
      const product = products.find(p => p.code === code);
      assert.deepEqual(product.images, [gif.data.url, png]); assert.deepEqual(product.imageBindings, body.imageBindings);
    }
  } finally { await app.close(); await rm(directory, { recursive: true, force: true }); }
});
