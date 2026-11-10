import { productLink } from '../../shared/product-link.js';

const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[ch]);
const description = '用 LINE 詢問這款，和店主一起確認商品細節';

export async function previewResponse(request, settings, fetcher = fetch) {
  const headers = {
    'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff', 'X-Robots-Tag': 'noindex, nofollow, noarchive',
    'Referrer-Policy': 'no-referrer',
    'Content-Security-Policy': "default-src 'none'; script-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
  };
  if (!['GET', 'HEAD'].includes(request.method)) return new Response(null, {status:405, headers:{...headers, Allow:'GET, HEAD'}});
  const url = new URL(request.url);
  const rawId = url.pathname.match(/^\/p\/([1-9]\d{0,15})$/)?.[1] || (url.pathname === '/api/product' ? url.searchParams.get('id') : null);
  const id = rawId && /^[1-9]\d{0,15}$/.test(rawId) ? Number(rawId) : NaN;
  let status = 404, product;
  if (Number.isSafeInteger(id)) {
    try {
      const result = await fetcher(settings.apiURL + '/public/product-preview/' + id, {
        headers:{apikey:settings.publishableKey}, signal:AbortSignal.timeout(6000), redirect:'error', cache:'no-store',
      });
      if (result.ok) {
        const data = await result.json();
        if (data.id !== id || typeof data.name !== 'string' || typeof data.code !== 'string' || data.name.length > 80 || data.code.length > 30) throw new Error('Invalid preview');
        const imagePrefix = new URL(settings.apiURL).origin + '/storage/v1/object/public/ccbaby-products/';
        const image = typeof data.image === 'string' && data.image.startsWith(imagePrefix)
          && /^[a-f0-9-]+\.(png|jpg|webp|gif)$/.test(data.image.slice(imagePrefix.length)) ? data.image : null;
        product = {id, name:data.name, code:data.code, image}; status = 200;
      } else if (result.status !== 404) status = 503;
    } catch (error) {
      console.error('Product preview unavailable', error.name); status = 503;
    }
  }
  const destination = new URL(productLink(settings.customerURL, product ? id : 1));
  if (!product) destination.hash = 'shop';
  const target = destination.href;
  const title = product ? product.code + ' ' + product.name + '｜CCBABY' : status === 503 ? '商品連線暫時中斷｜CCBABY' : '商品暫時無法查看｜CCBABY';
  const canonical = new URL('p/' + id, settings.productPreviewURL);
  const version = url.searchParams.get('v');
  if (version && /^[a-z0-9]{1,16}$/.test(version)) canonical.searchParams.set('v', version);
  const og = product ? `<meta property="og:type" content="product"><meta property="og:site_name" content="CCBABY"><meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${description}"><meta property="og:url" content="${esc(canonical.href)}">${product.image ? `<meta property="og:image" content="${esc(product.image)}"><meta property="og:image:alt" content="${esc(product.name)}">` : ''}` : '';
  // Crawlers read the HTML metadata. People immediately return to the existing shop dialog.
  const html = `<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title><meta name="robots" content="noindex,nofollow,noarchive">${og}</head><body><p>${product ? '正在開啟商品…' : status === 503 ? '連線暫時中斷，請稍後再試' : '商品可能已下架，請回選物頁查看'}</p><a id="open-product" href="${esc(target)}">${product ? '開啟商品' : '返回選物'}</a>${product ? '<script src="/open.js" defer></script>' : ''}</body></html>`;
  if (product) headers['Vercel-CDN-Cache-Control'] = 'public, s-maxage=60';
  return new Response(request.method === 'HEAD' ? null : html, {status, headers});
}
