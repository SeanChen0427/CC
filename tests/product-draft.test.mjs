import test from 'node:test';
import assert from 'node:assert/strict';
import { createProductDrafts, watchProductDraft } from '../apps/admin-web/product-draft.js';

function memoryStorage() {
  const values = new Map();
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), values };
}
const sample = (id = null) => ({ id, fields: { code: 'D01', name: '尚未上架', price: '', colors: '白,黑', sizes: 'S,3XL', description: '查完資料繼續填', sourceUrl: 'https://example.test/product/123?color=white&size=M' },
  sizeSurcharges: [{ size: 'S', extra: 0 }, { size: '3XL', extra: '120' }], images: ['https://example.test/2.jpg', 'https://example.test/1.jpg'],
  imageBindings: [{ color: '黑', url: 'https://example.test/1.jpg' }], bindingEnabled: true, pendingCount: 1 });

test('cost drafts retain raw optional prices, rates and original concurrency versions without extra fields',()=>{
  const storage=memoryStorage(),drafts=createProductDrafts('costs',()=>storage);
  const productCost={unitKrw:'10001',exchangeRate:'0.024',initialUnitKrw:'',initialExchangeRate:'',versions:[{variantId:7,version:3}],clearMixed:false,sizeCosts:[{size:'2XL',unitKrw:'15000'}],initialSizeCosts:[{size:'2XL',unitKrw:''}]};
  drafts.save({...sample(1),productCost:{...productCost,token:'never-store'}});
  assert.deepEqual(drafts.read(1).productCost,productCost);
  assert.ok(![...storage.values.values()][0].includes('never-store'));
});

test('reload restores unfinished fields, per-size amounts, photo order, bindings and incomplete-photo warning', () => {
  const storage = memoryStorage(), first = createProductDrafts('campaign-1', () => storage);
  assert.equal(first.save(sample()), true);
  const restored = createProductDrafts('campaign-1', () => storage).active();
  assert.deepEqual(restored, { ...sample(), open: true });
  assert.equal(createProductDrafts('campaign-2', () => storage).active(), null);
  assert.equal(first.read(1), null);
});

test('drafts do not overwrite other products and only the interrupted editor resumes automatically', () => {
  const drafts = createProductDrafts('one', () => storage), storage = memoryStorage();
  drafts.save(sample(1)); drafts.save(sample(2));
  assert.equal(drafts.active().id, 2);
  assert.equal(drafts.read(1).fields.code, 'D01');
  drafts.save({ ...drafts.read(2), open: false });
  assert.equal(drafts.active(), null);
  drafts.remove(2);
  assert.ok(drafts.read(1)); assert.equal(drafts.read(2), null);
});

test('draft storage whitelists product data and handles corrupt or blocked browser storage', () => {
  const storage = memoryStorage(), drafts = createProductDrafts('one', () => storage);
  drafts.save({ ...sample(), token: 'private', fields: { ...sample().fields, password: 'private' } });
  assert.ok(![...storage.values.values()][0].includes('private'));
  for (const value of ['null', '[]', 'broken', '{"new":null}', '{"new":{"fields":{},"id":99}}']) {
    storage.setItem([...storage.values.keys()][0], value);
    assert.equal(drafts.read(null), null);
  }
  const blocked = createProductDrafts('two', () => { throw new Error('SecurityError'); });
  assert.equal(blocked.active(), null); assert.equal(blocked.save(sample()), false);
});

function fixture({ restored = false, blocked = false } = {}) {
  const form = new EventTarget(), document = new EventTarget(), window = new EventTarget();
  document.visibilityState = 'visible';
  const storage = memoryStorage(), drafts = createProductDrafts('test', () => { if (blocked) throw new Error('blocked'); return storage; });
  let data = { ...sample(7), pendingCount: 0 }, status;
  const watcher = watchProductDraft({ form, document, window, capture: () => data, initial: restored ? null : JSON.stringify(data), drafts, onStatus: value => status = value });
  return { form, document, window, drafts, watcher, get data() { return data; }, set data(value) { data = value; }, get status() { return status; } };
}

test('typing saves immediately; backgrounding and pagehide capture the latest values without closing the editor', () => {
  const f = fixture(); f.watcher.flush(); assert.equal(f.watcher.dirty, false);
  f.data = { ...f.data, fields: { ...f.data.fields, name: '已修改' } };
  f.form.dispatchEvent(new Event('input'));
  assert.equal(f.drafts.read(7).fields.name, '已修改'); assert.equal(f.watcher.dirty, true);
  f.data = { ...f.data, images: ['https://example.test/just-uploaded.jpg'] };
  f.document.visibilityState = 'hidden'; f.document.dispatchEvent(new Event('visibilitychange'));
  assert.deepEqual(f.drafts.active().images, f.data.images);
  f.data = { ...f.data, bindingEnabled: false }; f.window.dispatchEvent(new Event('pagehide'));
  assert.equal(f.drafts.active().bindingEnabled, false);
  f.watcher.dispose();
});

test('reverting a clean form removes the draft; explicit close pauses it; successful save or discard cannot resurrect it', () => {
  const f = fixture(), initial = structuredClone(f.data);
  f.data = sample(7); f.form.dispatchEvent(new Event('change')); assert.ok(f.drafts.active());
  f.data = initial; f.form.dispatchEvent(new Event('input')); assert.equal(f.drafts.read(7), null);
  f.data = sample(7); f.watcher.flush(); f.watcher.pause();
  assert.equal(f.drafts.active(), null); assert.ok(f.drafts.read(7));
  f.watcher.dispose(); f.drafts.remove(7);
  for (const target of [f.form, f.document, f.window]) {
    for (const type of ['input', 'change', 'visibilitychange', 'pagehide', 'beforeunload']) target.dispatchEvent(new Event(type));
  }
  assert.equal(f.drafts.read(7), null);
});

test('interrupted photos or unavailable storage warn before leaving; a fully saved draft reloads without a prompt', () => {
  for (const options of [{ restored: true }, { restored: true, blocked: true }]) {
    const f = fixture(options);
    const leaving = () => { const e = new Event('beforeunload', { cancelable: true }); f.window.dispatchEvent(e); return e.defaultPrevented; };
    assert.equal(leaving(), Boolean(options.blocked));
    f.data = { ...f.data, pendingCount: 1 }; assert.equal(leaving(), true);
    assert.equal(f.status.stored, !options.blocked);
    f.watcher.dispose();
  }
});
