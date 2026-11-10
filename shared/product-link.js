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
