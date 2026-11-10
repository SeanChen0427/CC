import test from 'node:test';
import assert from 'node:assert/strict';
import { linkedProductId, customerReturnHash, productLink } from '../shared/product-link.js';
import { saveLineAttempt, takeLineAttempt } from '../shared/line-auth.js';

test('product links accept only a complete positive safe product ID and preserve existing return routes', () => {
  for (const hash of ['#shop', '#cart', '#orders', '#product/1', '#product/9007199254740991']) assert.equal(customerReturnHash(hash), hash);
  assert.equal(linkedProductId('#product/48'), 48);
  for (const hash of [undefined, null, {}, '#product/0', '#product/-1', '#product/01', '#product/1.5', '#product/1/extra', '#product/9007199254740992', '#product/1?next=https://example.test', '#product/%31', '#product/1\n', 'https://example.test', '#other']) {
    assert.equal(linkedProductId(hash), null);
    assert.equal(customerReturnHash(hash), '');
  }
});

test('sharing uses the configured customer entrance and strips query strings and old routes', () => {
  assert.equal(productLink('https://ccbaby.beecharge.live/', 48), 'https://ccbaby.beecharge.live/#product/48');
  assert.equal(productLink('https://example.test/CC/?code=private&state=private#orders', 12), 'https://example.test/CC/#product/12');
  assert.equal(productLink('http://127.0.0.1:4383/', 1), 'http://127.0.0.1:4383/#product/1');
  for (const id of [0, -1, 1.5, '1', NaN, Number.MAX_SAFE_INTEGER + 1]) assert.throws(() => productLink('https://example.test/', id));
  for (const url of ['javascript:alert(1)', 'https://user:password@example.test/']) assert.throws(() => productLink(url, 1));
});

function storage() {
  const values = new Map();
  return { get length() { return values.size; }, key: i => [...values.keys()][i] ?? null, getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, String(value)), removeItem: key => values.delete(key) };
}

let caseId = 0;
async function browserFixture(run) {
  const names = ['document', 'window', 'location', 'history', 'sessionStorage', 'fetch'];
  const original = new Map(names.map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
  const session = storage(), local = storage(), sent = [], redirects = [];
  const pending = { state: 's'.repeat(43), verifier: 'v'.repeat(43), nonce: 'n'.repeat(43), at: Date.now(), returnHash: '#product/48' };
  const location = new URL('https://shop.example.test/?code=fixture&state=' + pending.state);
  location.assign = url => redirects.push(url);
  location.replace = url => redirects.push(url);
  const config = { mode: 'cloud', role: 'customer', customerURL: 'https://shop.example.test/', apiURL: 'https://api.example.test', publishableKey: 'fixture' };
  let status = 200;
  const startup = { me: { authenticated: true, user: { id: 'fixture-member' } }, catalog: { products: [{ id: 48 }] } };
  const replacements = {
    document: { getElementById: () => ({ textContent: JSON.stringify(config) }) },
    window: { sessionStorage: session, localStorage: local }, sessionStorage: session, location,
    history: { replaceState: (_data, _title, url) => { location.href = new URL(url, location).href; } },
    fetch: async (url, options) => { sent.push({ url, body: JSON.parse(options.body) }); return Response.json(status === 200 ? { token: 'fixture-session', startup } : { error: 'fixture exchange failure' }, { status }); },
  };
  for (const [name, value] of Object.entries(replacements)) Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
  try {
    const runtime = await import('../shared/runtime.js?product-link-test=' + ++caseId);
    await run({ runtime, pending, session, local, location, sent, redirects, startup, fail: () => { status = 503; } });
  } finally {
    for (const name of names) { if (original.get(name)) Object.defineProperty(globalThis, name, original.get(name)); else delete globalThis[name]; }
  }
}

test('the real LINE redirect saves the linked product with the exact PKCE and state attempt', async () => {
  await browserFixture(async f => {
    f.location.href = 'https://shop.example.test/#product/48';
    await f.runtime.lineLogin('fixture-channel');
    const oauth = new URL(f.redirects[0]);
    assert.equal(oauth.searchParams.get('redirect_uri'), 'https://shop.example.test/');
    const pending = takeLineAttempt(oauth.searchParams.get('state'), { session: f.session, local: f.local });
    assert.equal(pending.returnHash, '#product/48');
    assert.equal(pending.nonce, oauth.searchParams.get('nonce'));
    assert.equal(oauth.searchParams.get('code_challenge_method'), 'S256');
    assert.equal(f.sent.length, 0);
  });
});

test('the real successful callback restores the product only after valid state and returns protected startup data', async () => {
  await browserFixture(async f => {
    saveLineAttempt(f.pending, { session: f.session, local: f.local });
    assert.deepEqual(await f.runtime.finishLineLogin(), f.startup);
    assert.equal(f.location.hash, '#product/48');
    assert.equal(f.location.search, '');
    assert.equal(f.runtime.hasSession(), true);
    assert.deepEqual(f.sent[0].body, { code: 'fixture', verifier: f.pending.verifier, nonce: f.pending.nonce, includeStartup: true });
    assert.equal(takeLineAttempt(f.pending.state, { session: f.session, local: f.local }), null);
  });
});

test('cancelled login and transient exchange failure preserve the product for manual retry without granting a session', async () => {
  for (const cancel of [true, false]) await browserFixture(async f => {
    saveLineAttempt(f.pending, { session: f.session, local: f.local });
    if (cancel) f.location.href = 'https://shop.example.test/?error=ACCESS_DENIED&state=' + f.pending.state;
    else f.fail();
    await assert.rejects(f.runtime.finishLineLogin(), cancel ? /已取消/ : /exchange failure/);
    assert.equal(f.location.hash, '#product/48');
    assert.equal(f.location.search, '');
    assert.equal(f.runtime.hasSession(), false);
    assert.equal(f.sent.length, cancel ? 0 : 1);
  });
});

test('wrong state and expired product-link attempts cannot exchange or load customer data', async () => {
  for (const expired of [true, false]) await browserFixture(async f => {
    const pending = { ...f.pending, ...(expired ? { at: Date.now() - 600001 } : {}) };
    saveLineAttempt(pending, { session: f.session, local: f.local, now: pending.at });
    if (!expired) f.location.search = '?code=fixture&state=' + 'x'.repeat(43);
    await assert.rejects(f.runtime.finishLineLogin(), /未能接續/);
    assert.equal(f.sent.length, 0);
    assert.equal(f.runtime.hasSession(), false);
    assert.equal(f.location.hash, '');
  });
});
