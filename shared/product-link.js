// Shared links open the existing product dialog over the shop.
export function linkedProductId(hash) {
  const match = typeof hash === 'string' && /^#product\/([1-9]\d{0,15})$/.exec(hash);
  const id = match ? Number(match[1]) : NaN;
  return Number.isSafeInteger(id) ? id : null;
}

export function customerReturnHash(hash) {
  return ['#shop', '#cart', '#orders'].includes(hash) || linkedProductId(hash) !== null ? hash : '';
}

export function productLink(customerURL, id) {
  if (!Number.isSafeInteger(id) || id < 1) throw new Error('商品連結無效');
  const url = new URL(customerURL);
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) throw new Error('商品連結無效');
  url.search = '';
  url.hash = 'product/' + id;
  return url.href;
}

// A new URL after a cover/name edit lets LINE fetch a fresh preview.
export function productShareLink(customerURL, product, previewURL) {
  const destination = productLink(customerURL, product.id);
  if (!previewURL) return destination;
  const url = new URL(previewURL);
  if (url.protocol !== 'https:' || url.username || url.password) throw new Error('商品連結無效');
  let version = 2166136261;
  for (const char of JSON.stringify([product.code, product.name, product.images?.[0] || ''])) {
    version = Math.imul(version ^ char.charCodeAt(0), 16777619) >>> 0;
  }
  url.pathname = url.pathname.replace(/\/$/, '') + '/p/' + product.id;
  url.search = '?v=' + version.toString(36);
  url.hash = '';
  return url.href;
}
