import { AppError, text, integer, contact, assertOpen, validateProcurement, csvRows, validateImageBindings, validateSizeSurcharges } from '../domain/validation.mjs';

export function emptyState() {
  return { schemaVersion: 1, campaign: { id: 1, name: 'CCBABY 韓國預購', status: 'draft', closesAt: new Date().toISOString(), description: '韓國親自採買，到台後再通知付款。' }, seq: {}, products: [], variants: [], customers: [], preorders: [], items: [], procurement: [], submissions: [], events: [], closing_snapshots: [] };
}
const stamp = () => new Date().toISOString();
const next = (s, key) => s.seq[key] = (s.seq[key] || 0) + 1;
const event = (s, kind, subject, detail = {}) => s.events.push({ id: next(s, 'events'), kind, subject: String(subject), detail, created_at: stamp() });
function required(session, role) {
  if (!session || session.role !== role) throw new AppError('請先登入', 401);
}
export function catalog(s, all = false) {
  return s.products.filter(p => all || p.active).map(p => ({ ...p, variants: s.variants.filter(v => v.product_id === p.id && (all || v.active)) }));
}
export function orders(s, customerId) {
  return s.preorders.filter(o => !customerId || o.customer_id === customerId).map(o => {
    const items = s.items.filter(i => i.order_id === o.id && i.quantity > 0);
    return { ...o, customer: s.customers.find(c => c.id === o.customer_id), items, quantity: items.reduce((a, i) => a + i.quantity, 0), total: items.reduce((a, i) => a + i.quantity * i.price, 0) };
  }).sort((a, b) => b.updated_at.localeCompare(a.updated_at));
}
export function report(s) {
  return s.variants.flatMap(v => {
    const items = s.items.filter(i => i.variant_id === v.id && i.quantity > 0);
    if (!items.length) return [];
    const p = s.products.find(p => p.id === v.product_id), r = s.procurement.find(r => r.variant_id === v.id);
    const demand = items.reduce((a, i) => a + i.quantity, 0), bought = r?.bought || 0, shortage = r?.shortage || 0;
    const allocated_bought = items.reduce((a, i) => a + i.bought, 0), allocated_shortage = items.reduce((a, i) => a + i.shortage, 0);
    return [{ variant_id: v.id, code: p.code, name: p.name, category: p.category, kind: p.kind, tone: p.tone, color: v.color, size: v.size, demand, bought, shortage, allocated_bought, allocated_shortage, remaining: Math.max(demand - bought - shortage, 0), unallocated: bought - allocated_bought, note: r?.note || '', version: r?.version || 0 }];
  });
}
export function validateProduct(input, imagePrefix) {
  const code = text(input.code, '商品編號', 30);
  if (!/^[A-Za-z0-9_-]+$/.test(code)) throw new AppError('商品編號請用英文、數字、底線或連字號');
  const name = text(input.name, '商品名稱', 80), category = text(input.category, '商品分類', 30);
  const price = integer(Number(input.price), '售價', 1000000, 1);
  const colors = [...new Set(text(input.colors, '顏色', 200).split(/[,，]/).map(x => x.trim()).filter(Boolean))];
  const sizes = [...new Set(text(input.sizes, '規格', 200).split(/[,，]/).map(x => x.trim()).filter(Boolean))];
  if (colors.length > 12 || sizes.length > 12 || colors.some(x => x.length > 30) || sizes.some(x => x.length > 30)) throw new AppError('顏色及規格各最多 12 種，每種最多 30 字');
  if (!['vest','coat','bag','bowl','bed','toy','scarf'].includes(input.kind)) throw new AppError('請選擇有效的示意圖類型');
  const tone = /^#[a-fA-F0-9]{6}$/.test(input.tone) ? input.tone : '#b9a38b';
  const images = Array.isArray(input.images) ? input.images : [];
  if (images.length > 8 || images.some(x => typeof x !== 'string' || !imagePrefix || !x.startsWith(imagePrefix) || !/^[a-f0-9-]+\.(png|jpg|webp)$/.test(x.slice(imagePrefix.length)))) throw new AppError('商品圖片位置無效');
  const imageBindings = validateImageBindings(input.imageBindings, images, colors);
  const sizeSurcharges = validateSizeSurcharges(input, sizes, price);
  return { code, name, category, price, basePrice:price, sizeSurcharges, colors, sizes, kind: input.kind, tone, description: String(input.description || '').slice(0,3000), badge: String(input.badge || '').slice(0,20), active: input.active !== false && input.active !== 'false', images, imageBindings };
}
function saveProduct(s, input, imagePrefix) {
  const p = validateProduct(input, imagePrefix), id = input.id ? integer(Number(input.id), '商品識別', 1000000, 1) : next(s, 'products');
  if (s.products.some(x => x.code === p.code && x.id !== id)) throw new AppError('商品編號已存在', 409);
  const old = s.products.find(x => x.id === id);
  if (input.id && !old) throw new AppError('找不到商品', 404);
  const { colors, sizes, price, ...fields } = p;
  if (old) Object.assign(old, fields); else s.products.push({ ...fields, id, created_at: stamp() });
  s.variants.filter(v => v.product_id === id).forEach(v => { v.active = false; });
  for (const color of colors) for (const size of sizes) {
    const value = price + (p.sizeSurcharges.find(entry => entry.size === size)?.extra || 0);
    const v = s.variants.find(v => v.product_id === id && v.color === color && v.size === size);
    if (v) Object.assign(v, { price: value, active: true });
    else s.variants.push({ id: next(s,'variants'), product_id: id, color, size, price: value, active: true });
  }
  event(s, 'product.save', id, { code: p.code });
  return id;
}
export function upsertCustomer(s, identity) {
  let c = s.customers.find(c => c.id === identity.id);
  if (!c) { c = { id: identity.id, display_name: identity.display_name, name: '', phone: '', delivery: '' }; s.customers.push(c); }
  else c.display_name = identity.display_name;
  return c;
}

// All mutations run on a private copy. The caller commits via an atomic revision check.
export function operate(s, path, method, body, session, imagePrefix) {
  if (path === 'catalog' && method === 'GET') {
    required(session,'customer');
    return { campaign: s.campaign, products: catalog(s), localOnly: false };
  }
  if (path === 'me' && method === 'GET') return { authenticated: Boolean(session), role: session?.role, localOnly: false, profiles: [], user: session?.role === 'customer' ? s.customers.find(c => c.id === session.subject) || null : null };
  const role = path.startsWith('admin/') ? 'admin' : 'customer'; required(session, role);
  if (path === 'customer/orders' && method === 'GET') return { campaign: s.campaign, orders: orders(s, session.subject) };
  if (path === 'customer/profile' && method === 'PATCH') {
    const c = s.customers.find(c => c.id === session.subject); if (!c) throw new AppError('請重新登入',401);
    Object.assign(c, contact(body), { delivery: String(body.delivery || '').slice(0,500) });
    event(s,'customer.profile',c.id); return { ok:true };
  }
  if (path === 'customer/preorders' && method === 'POST') {
    const requestId = text(body.requestId,'送出識別',100), signature = JSON.stringify(body);
    const saved = s.submissions.find(x => x.customer_id === session.subject && x.request_id === requestId);
    if (saved) { if (saved.signature !== signature) throw new AppError('同一送出識別不能用於不同內容',409); return saved.result; }
    assertOpen(s.campaign); const details = contact(body);
    if (!Array.isArray(body.items) || !body.items.length || body.items.length > 150) throw new AppError('請先將商品加入購物車');
    const combined = new Map();
    for (const i of body.items) {
      integer(i.variantId,'規格識別',1000000,1); integer(i.quantity,'數量',99,1);
      const v = s.variants.find(v => v.id === i.variantId), p = s.products.find(p => p.id === v?.product_id);
      if (!v?.active || !p?.active) throw new AppError('部分商品已停止預購',409);
      if (i.expectedPrice !== v.price) throw new AppError('商品價格已更新，請移除並重新選購',409);
      const quantity = integer((combined.get(v.id)?.quantity || 0)+i.quantity,'同規格數量',99,1);
      combined.set(v.id,{ v, p, quantity });
    }
    let o = s.preorders.find(o => o.customer_id === session.subject);
    if (!o) { const id=next(s,'preorders'); o={ id, customer_id:session.subject, code:`CC${new Date().getFullYear()}-${String(id).padStart(4,'0')}`, created_at:stamp(), version:0 }; s.preorders.push(o); }
    for (const {v,p,quantity} of combined.values()) {
      const old=s.items.find(i => i.order_id===o.id && i.variant_id===v.id && i.price===v.price);
      if (old) old.quantity=integer(old.quantity+quantity,'累計數量',999,1);
      else s.items.push({id:next(s,'items'),order_id:o.id,variant_id:v.id,product_code:p.code,product_name:p.name,color:v.color,size:v.size,price:v.price,quantity,bought:0,shortage:0});
    }
    Object.assign(o,details,{updated_at:stamp(),version:o.version+1});
    const c=s.customers.find(c => c.id===session.subject); if (!c) throw new AppError('請重新登入',401); Object.assign(c,details);
    const result={ok:true,orderId:o.id,code:o.code,added:[...combined.values()].reduce((a,i)=>a+i.quantity,0)};
    s.submissions.push({customer_id:session.subject,request_id:requestId,signature,result}); event(s,'preorder.submit',o.id,{added:result.added});return result;
  }
  const itemMatch=path.match(/^customer\/items\/(\d+)$/);
  if (itemMatch && method==='PATCH') {
    assertOpen(s.campaign);const i=s.items.find(i=>i.id===Number(itemMatch[1])&&s.preorders.some(o=>o.id===i.order_id&&o.customer_id===session.subject));
    if(!i)throw new AppError('找不到這筆預購',404);
    const r=s.procurement.find(r=>r.variant_id===i.variant_id);
    if(i.bought||i.shortage||r?.bought||r?.shortage)throw new AppError('已有採購紀錄，請聯絡店主',409);
    i.quantity=integer(body.quantity,'數量',999); const o=s.preorders.find(o=>o.id===i.order_id);o.version++;o.updated_at=stamp();event(s,'preorder.modify',i.id);return{ok:true};
  }
  if (path==='admin/state'&&method==='GET') {
    const os=orders(s), rs=report(s), active=os.filter(o=>o.quantity>0);
    return {campaign:s.campaign,products:catalog(s,true),orders:os,report:rs,stats:{customers:active.length,quantity:active.reduce((a,o)=>a+o.quantity,0),total:active.reduce((a,o)=>a+o.total,0),products:s.products.filter(p=>p.active).length,...Object.fromEntries(['bought','shortage','remaining'].map(k=>[k,rs.reduce((a,r)=>a+r[k],0)]))},events:s.events.slice(-12).reverse().map(({detail,...e})=>e)};
  }
  if(path==='admin/products'&&method==='POST')return{ok:true,id:saveProduct(s,body,imagePrefix)};
  if(path==='admin/import'&&method==='POST') {
    const rows=csvRows(text(body.csv,'CSV 內容',1000000)),headers=rows.shift().map(x=>x.trim()),errors=[],products=[],seen=new Set();
    if(['code','name','category','price','colors','sizes'].some(k=>!headers.includes(k)))throw new AppError('CSV 欄位需包含 code,name,category,price,colors,sizes');
    rows.forEach((cells,index)=>{try{const p=Object.fromEntries(headers.map((k,i)=>[k,cells[i]||'']));p.kind||='vest';p.tone||='#b9a38b';validateProduct(p,imagePrefix);if(seen.has(p.code)||s.products.some(x=>x.code===p.code))throw new AppError('商品編號重複：'+p.code);seen.add(p.code);products.push({...p,line:index+2});}catch(e){errors.push({line:index+2,message:e.message});}});
    if(body.commit){if(errors.length)throw new AppError('請先修正所有匯入錯誤');for(const p of products)saveProduct(s,p,imagePrefix);event(s,'products.import','campaign',{count:products.length});}
    return{ok:true,products,errors,count:rows.length};
  }
  const procurement=path.match(/^admin\/procurement\/(\d+)$/);
  if(procurement&&method==='PUT') {
    const r=report(s).find(r=>r.variant_id===Number(procurement[1]));if(!r)throw new AppError('找不到採買需求',404);
    if(r.version!==body.version)throw new AppError('資料已在另一個畫面更新，請重新整理',409);
    validateProcurement({demand:r.demand,bought:body.bought,shortage:body.shortage,allocatedBought:r.allocated_bought,allocatedShortage:r.allocated_shortage});
    let row=s.procurement.find(x=>x.variant_id===r.variant_id);if(!row){row={variant_id:r.variant_id};s.procurement.push(row);}
    Object.assign(row,{bought:body.bought,shortage:body.shortage,note:String(body.note||'').slice(0,500),version:r.version+1});event(s,'procurement.update',r.variant_id);return{ok:true};
  }
  if(path==='admin/allocation'&&method==='POST') {
    const i=s.items.find(i=>i.id===body.itemId&&i.quantity>0);if(!i)throw new AppError('找不到有效明細',404);
    const r=report(s).find(r=>r.variant_id===i.variant_id),bought=integer(body.bought,'分配買到數',i.quantity),shortage=integer(body.shortage,'分配缺貨數',i.quantity);
    if(bought+shortage>i.quantity)throw new AppError('分配合計不能超過預購數');
    if(r.allocated_bought-i.bought+bought>r.bought||r.allocated_shortage-i.shortage+shortage>r.shortage)throw new AppError('分配不能超過採購紀錄');
    Object.assign(i,{bought,shortage});event(s,'allocation.update',i.id);return{ok:true};
  }
  if(path==='admin/campaign'&&method==='PUT') {
    const name=text(body.name,'活動名稱',80),status=body.status,close=new Date(body.closesAt);
    if(!['draft','open','closed','purchasing','arrived','archived'].includes(status)||Number.isNaN(close.getTime()))throw new AppError('請確認活動階段與截止時間');
    if(status==='open'&&close<=new Date())throw new AppError('開放預購的截止時間需晚於現在');
    if(s.campaign.status==='open'&&status!=='open')s.closing_snapshots.push({id:next(s,'closing_snapshots'),created_at:stamp(),data:{campaign:s.campaign,orders:orders(s),report:report(s)}});
    s.campaign={...s.campaign,name,status,closesAt:close.toISOString()};event(s,'campaign.update','1',{status});return{ok:true};
  }
  throw new AppError('找不到此功能',404);
}
