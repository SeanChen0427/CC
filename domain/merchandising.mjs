import { AppError } from './validation.mjs';

// An owner-reviewed merchandising rule, not a purchase probability model.
export function orderedProducts(products, ids = []) {
  const rank = new Map(ids.map((id, index) => [id, index]));
  return products.map((product, index) => ({product, index})).sort((a,b) =>
    (rank.get(a.product.id) ?? Infinity) - (rank.get(b.product.id) ?? Infinity) || a.index-b.index
  ).map(row => row.product);
}

export function planProductOrder(body, products, current = {}, now = Date.now()) {
  if (!Number.isSafeInteger(body.version) || body.version !== (current.version || 0)) {
    throw new AppError('排序已在另一個畫面更新，請重新載入後再調整',409);
  }
  const active = products.filter(p => p.active).map(p => p.id), ids = body.productIds;
  if (!Array.isArray(ids) || ids.length !== active.length || new Set(ids).size !== ids.length ||
    ids.some(id => !Number.isSafeInteger(id) || !active.includes(id))) {
    throw new AppError('上架商品已變動，請重新載入完整商品後再套用',409);
  }
  return {version:(current.version || 0)+1,productIds:[...ids],previousIds:[...(current.productIds || [])],updatedAt:new Date(now).toISOString()};
}

export function productSignals(events) {
  const people = new Set(), rows = new Map();
  for (const e of events) {
    people.add(e.customerId);
    if (!e.productId) continue;
    if (!rows.has(e.productId)) rows.set(e.productId,{productId:e.productId,viewers:new Set(),cartPeople:new Set()});
    const row = rows.get(e.productId);
    if (e.type === 'page_view' && e.page === 'product') row.viewers.add(e.customerId);
    if (e.action === 'cart_add') row.cartPeople.add(e.customerId);
  }
  return {observedPeople:people.size,products:[...rows.values()].map(r=>({productId:r.productId,viewers:r.viewers.size,cartPeople:r.cartPeople.size}))};
}

export function merchandising(products, orders, signals = {}, settings = {}, days = 30) {
  const active = products.filter(p=>p.active), current = orderedProducts(active,settings.productIds);
  const rows = current.map((p,index)=>{
    const metric = signals.products?.find(row=>row.productId===p.id);
    const buyers = new Set();let quantity=0;
    const variants = new Set(p.variants.map(v=>v.id));
    for (const o of orders.filter(o=>!o.deleted_at)) for (const item of o.items || []) {
      if (item.quantity>0 && variants.has(item.variant_id)) {buyers.add(o.customer_id);quantity+=item.quantity;}
    }
    const viewers = Number(metric?.viewers) || 0, cartPeople = Number(metric?.cartPeople) || 0;
    const score = buyers.size*6+cartPeople*3+Math.min(viewers,10);
    return {productId:p.id,code:p.code,name:p.name,category:p.category,image:p.images?.[0] || '',
      currentPosition:index+1,viewers,cartPeople,buyers:buyers.size,quantity,score,
      reason:score?`有效預購 ${buyers.size} 人、曾加購 ${cartPeople} 人、瀏覽 ${viewers} 人`:'尚無商品訊號，保留觀察機會'};
  });
  const ranked = [...rows].sort((a,b)=>b.score-a.score || a.currentPosition-b.currentPosition);
  const known = ranked.filter(r=>r.score>0), unexplored = ranked.filter(r=>r.score===0), suggested=[];
  // Reserve every fifth position for an item without signals to reduce a popularity loop.
  while (known.length || unexplored.length) {
    suggested.push(((suggested.length+1)%5===0 && unexplored.length || !known.length) ? unexplored.shift() : known.shift());
  }
  const hasSignals = rows.some(r=>r.score>0), suggestedIds = hasSignals?suggested.map(r=>r.productId):current.map(p=>p.id);
  return {days,settings:{version:settings.version || 0,productIds:settings.productIds || [],previousIds:settings.previousIds || [],updatedAt:settings.updatedAt || null},
    observedPeople:signals.observedPeople || 0,lowSample:(signals.observedPeople || 0)<5,hasSignals,rows,
    currentIds:current.map(p=>p.id),suggestedIds,originalIds:active.map(p=>p.id)};
}
