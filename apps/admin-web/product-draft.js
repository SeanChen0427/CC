const fields = ['code', 'name', 'category', 'active', 'price', 'colors', 'sizes', 'kind', 'tone', 'badge', 'description', 'sourceUrl'];
const idKey = id => id == null ? 'new' : String(id);

// Keep product drafts in this tab only; never persist credentials or customer data.
export function createProductDrafts(scope, storage = () => sessionStorage) {
  const key = 'ccbaby.admin.product-drafts.v1:' + scope;
  function readAll() {
    try {
      const data = JSON.parse(storage().getItem(key) || '{}');
      return data && typeof data === 'object' && !Array.isArray(data) ? data : {};
    } catch { return {}; }
  }
  function writeAll(data) {
    try { storage().setItem(key, JSON.stringify(data)); return true; }
    catch { return false; }
  }
  function clean(draft) {
    if (!draft || !draft.fields || typeof draft.fields !== 'object') return null;
    if (draft.id != null && (!Number.isSafeInteger(draft.id) || draft.id < 1)) return null;
    return {
      id: draft.id ?? null,
      fields: Object.fromEntries(fields.filter(name => typeof draft.fields[name] === 'string').map(name => [name, draft.fields[name]])),
      sizeSurcharges: (Array.isArray(draft.sizeSurcharges) ? draft.sizeSurcharges : [])
        .filter(entry => entry && typeof entry.size === 'string' && ['number', 'string'].includes(typeof entry.extra))
        .map(({ size, extra }) => ({ size, extra })),
      images: (Array.isArray(draft.images) ? draft.images : []).filter(url => typeof url === 'string').slice(0, 8),
      imageBindings: (Array.isArray(draft.imageBindings) ? draft.imageBindings : [])
        .filter(link => link && typeof link.color === 'string' && typeof link.url === 'string')
        .map(({ color, url }) => ({ color, url })),
      bindingEnabled: draft.bindingEnabled === true,
      pendingCount: Number.isSafeInteger(draft.pendingCount) && draft.pendingCount > 0 ? draft.pendingCount : 0,
      ...(draft.productCost && typeof draft.productCost === 'object' ? {productCost:{
        ...Object.fromEntries(['unitKrw','exchangeRate','initialUnitKrw','initialExchangeRate'].filter(key=>typeof draft.productCost[key]==='string').map(key=>[key,draft.productCost[key]])),
        versions:(Array.isArray(draft.productCost.versions)?draft.productCost.versions:[]).filter(v=>v&&Number.isSafeInteger(v.variantId)&&v.variantId>0&&Number.isSafeInteger(v.version)&&v.version>=0).map(v=>({variantId:v.variantId,version:v.version})),
        clearMixed:draft.productCost.clearMixed===true,
        ...Object.fromEntries(['sizeCosts','initialSizeCosts'].filter(key=>Array.isArray(draft.productCost[key])).map(key=>[key,draft.productCost[key].filter(row=>row&&typeof row.size==='string'&&typeof row.unitKrw==='string').slice(0,144).map(({size,unitKrw})=>({size,unitKrw}))])),
      }} : {}),
      open: draft.open !== false,
    };
  }
  return {
    read(id) { const draft = clean(readAll()[idKey(id)]); return draft && idKey(draft.id) === idKey(id) ? draft : null; },
    active() { return Object.values(readAll()).map(clean).find(draft => draft?.open) || null; },
    save(draft) {
      const data = readAll(), value = clean(draft);
      if (!value) return false;
      for (const entry of Object.values(data)) if (entry && typeof entry === 'object') entry.open = false;
      data[idKey(value.id)] = value;
      return writeAll(data);
    },
    remove(id) { const data = readAll(); delete data[idKey(id)]; return writeAll(data); },
  };
}

export function watchProductDraft({ form, document, window, capture, initial, drafts, onStatus }) {
  let dirty = initial === null, stored = true, done = false;
  function flush() {
    if (done) return;
    const draft = capture();
    dirty = initial === null || JSON.stringify(draft) !== initial;
    stored = dirty ? drafts.save(draft) : drafts.remove(draft.id);
    onStatus({ dirty, stored, pendingCount: draft.pendingCount });
  }
  const hidden = () => { if (document.visibilityState === 'hidden') flush(); };
  const leaving = event => {
    flush();
    if (dirty && (!stored || capture().pendingCount > 0)) { event.preventDefault(); event.returnValue = ''; }
  };
  form.addEventListener('input', flush);
  form.addEventListener('change', flush);
  document.addEventListener('visibilitychange', hidden);
  window.addEventListener('pagehide', flush);
  window.addEventListener('beforeunload', leaving);
  return {
    flush,
    get dirty() { return dirty; },
    pause() { flush(); if (dirty) return drafts.save({ ...capture(), open: false }); return true; },
    dispose() {
      done = true;
      form.removeEventListener('input', flush);
      form.removeEventListener('change', flush);
      document.removeEventListener('visibilitychange', hidden);
      window.removeEventListener('pagehide', flush);
      window.removeEventListener('beforeunload', leaving);
    },
  };
}
