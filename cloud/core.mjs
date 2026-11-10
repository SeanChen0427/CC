import { AppError, text, integer, contact, assertOpen, validateProcurement, validateImageBindings, validateSizeSurcharges, validateNewCategory, productSourceUrl, productVideoUrl, productVideoLayout } from '../domain/validation.mjs';
import { previewProductImport } from '../domain/product-transfer.mjs';
import { categoryNames } from '../shared/product-categories.js';
import { validateExchangeRate, validateCost } from '../domain/costing.mjs';
import { validateOrderDeletion } from '../domain/order-deletion.mjs';
import { planProductCosts, costForProductVariant } from '../domain/product-costing.mjs';
import { sameCost } from '../shared/product-costing.js';
import { orderedProducts, planProductOrder } from '../domain/merchandising.mjs';
import { assignContactCode,planCustomerCare,planNotice,careData } from '../domain/customer-care.mjs';
import { promotionSettings,publicPromotion,planPromotion } from '../domain/promotion.mjs';
import { queueNotification,notificationCareData,orderNoticeForSend,lineRecipient } from '../domain/line-notifications.mjs';

export function emptyState() {
  return { schemaVersion: 1, campaign: { id: 1, name: 'CCBABY 韓國預購', status: 'draft', closesAt: new Date().toISOString(), description: '韓國親自採買，下單後 24 小時內付款，確認付款後安排採購' }, seq: {}, categories: [], products: [], variants: [], customers: [], preorders: [], items: [], procurement: [], submissions: [], events: [], closing_snapshots: [] };
}
const stamp = () => new Date().toISOString();
const next = (s, key) => s.seq[key] = (s.seq[key] || 0) + 1;
const event = (s, kind, subject, detail = {}) => s.events.push({ id: next(s, 'events'), kind, subject: String(subject), detail, created_at: stamp() });
function required(session, role) {
  if (!session || session.role !== role) throw new AppError('請先登入', 401);
}
export function catalog(s, all = false) {
  return s.products.filter(p => all || p.active).map(p => {
    const {sourceUrl,...fields}=p;
    return { ...fields, videoUrl:p.videoUrl || '', videoLayout:p.videoLayout || 'vertical', ...(all ? {sourceUrl:sourceUrl || ''} : {}), variants: s.variants.filter(v => v.product_id === p.id && (all || v.active)).map(v => {
    if(!all)return v;
    const row=s.procurement.find(r=>r.variant_id===v.id);
    return {...v,cost:row?.cost || null,costVersion:row?.version || 0};
  }) }; });
}
export function orders(s, customerId) {
  return s.preorders.filter(o => !o.deleted_at && (!customerId || o.customer_id === customerId)).map(o => {
    const items = s.items.filter(i => i.order_id === o.id && i.quantity > 0);
    return { ...o, customer: s.customers.find(c => c.id === o.customer_id), items, quantity: items.reduce((a, i) => a + i.quantity, 0), total: items.reduce((a, i) => a + i.quantity * i.price, 0) };
  }).sort((a, b) => b.updated_at.localeCompare(a.updated_at));
}
export function report(s) {
  const activeOrders = new Set(s.preorders.filter(o => !o.deleted_at).map(o => o.id));
  return s.variants.flatMap(v => {
    const items = s.items.filter(i => activeOrders.has(i.order_id) && i.variant_id === v.id && i.quantity > 0);
    if (!items.length) return [];
    const p = s.products.find(p => p.id === v.product_id), r = s.procurement.find(r => r.variant_id === v.id);
    const demand = items.reduce((a, i) => a + i.quantity, 0), bought = r?.bought || 0, shortage = r?.shortage || 0;
    const allocated_bought = items.reduce((a, i) => a + i.bought, 0), allocated_shortage = items.reduce((a, i) => a + i.shortage, 0);
    return [{ variant_id: v.id, code: p.code, name: p.name, category: p.category, kind: p.kind, tone: p.tone, color: v.color, size: v.size, demand, bought, shortage, allocated_bought, allocated_shortage, remaining: Math.max(demand - bought - shortage, 0), unallocated: bought - allocated_bought, note: r?.note || '', version: r?.version || 0,
      cost:r?.cost || null, sourceUrl:p.sourceUrl || '', priceMin:Math.min(...items.map(i=>i.price)), priceMax:Math.max(...items.map(i=>i.price)), salesTotal:items.reduce((sum,i)=>sum+i.price*i.quantity,0) }];
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
  if (images.length > 8 || images.some(x => typeof x !== 'string' || !imagePrefix || !x.startsWith(imagePrefix) || !/^[a-f0-9-]+\.(png|jpg|webp|gif)$/.test(x.slice(imagePrefix.length)))) throw new AppError('商品圖片位置無效');
  const imageBindings = validateImageBindings(input.imageBindings, images, colors);
  const sizeSurcharges = validateSizeSurcharges(input, sizes, price);
  return { code, name, category, price, basePrice:price, sizeSurcharges, colors, sizes, sourceUrl:productSourceUrl(input.sourceUrl), videoUrl:productVideoUrl(input.videoUrl), videoLayout:productVideoLayout(input.videoLayout), kind: input.kind, tone, description: String(input.description || '').slice(0,3000), badge: String(input.badge || '').slice(0,20), active: input.active !== false && input.active !== 'false', images, imageBindings };
}
function saveProduct(s, input, imagePrefix) {
  const p = validateProduct(input, imagePrefix), id = input.id ? integer(Number(input.id), '商品識別', 1000000, 1) : next(s, 'products');
  if (s.products.some(x => x.code === p.code && x.id !== id)) throw new AppError('商品編號已存在', 409);
  const old = s.products.find(x => x.id === id);
  if (input.id && !old) throw new AppError('找不到商品', 404);
  p.sourceUrl ??= old?.sourceUrl || '';
  p.videoUrl ??= old?.videoUrl || '';
  p.videoLayout ??= old?.videoLayout || 'vertical';
  const previous=s.variants.filter(v=>v.product_id===id);
  const costs=planProductCosts(input.costUpdate,previous,s.procurement,s.costSettings,p.sizes);
  const { colors, sizes, price, ...fields } = p;
  if (old) Object.assign(old, fields); else s.products.push({ ...fields, id, created_at: stamp() });
  s.variants.filter(v => v.product_id === id).forEach(v => { v.active = false; });
  for (const color of colors) for (const size of sizes) {
    const value = price + (p.sizeSurcharges.find(entry => entry.size === size)?.extra || 0);
    const v = s.variants.find(v => v.product_id === id && v.color === color && v.size === size);
    let variant=v;
    if (v) Object.assign(v, { price: value, active: true });
    else {variant={ id: next(s,'variants'), product_id: id, color, size, price: value, active: true };s.variants.push(variant);}
    const cost=costForProductVariant(costs,size,!v);
    if(cost!==undefined) {
      let row=s.procurement.find(r=>r.variant_id===variant.id);
      if(!sameCost(row?.cost,cost)) {
        const before=row?.cost || null;
        if(!row){row={variant_id:variant.id,bought:0,shortage:0,note:'',version:0};s.procurement.push(row);}
        row.cost=cost;row.version++;
        event(s,'procurement.cost',variant.id,{before,after:cost,source:'product'});
      }
    }
  }
  if(costs.rate!==undefined){s.costSettings={exchangeRate:costs.rate};event(s,'cost.settings','1',s.costSettings);}
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
  if (path === 'customer/bootstrap' && method === 'GET') {
    required(session,'customer');
    const me = operate(s,'me','GET',{},session,imagePrefix);
    if (!me.user) throw new AppError('請先登入',401);
    return { me, catalog: operate(s,'catalog','GET',{},session,imagePrefix) };
  }
  if (path === 'catalog' && method === 'GET') {
    required(session,'customer');
    return { campaign: s.campaign, promotion:publicPromotion(s.promotion), categories: categoryNames(s.categories,s.products), products: orderedProducts(catalog(s),s.merchandising?.productIds), localOnly: false };
  }
  if (path === 'me' && method === 'GET') return { authenticated: Boolean(session), role: session?.role, localOnly: false, profiles: [], user: session?.role === 'customer' ? s.customers.find(c => c.id === session.subject) || null : null };
  const role = path.startsWith('admin/') ? 'admin' : 'customer'; required(session, role);
  if(path==='customer/line-contact'&&method==='POST'){
    const customer=s.customers.find(c=>c.id===session.subject);
    if(!customer)throw new AppError('請重新登入',401);
    if(lineRecipient(customer.id))return {contactCode:null,officialAccountId:'@445yxcey',identified:true,changed:false};
    const result=assignContactCode(customer,s.customers);
    if(result.changed)event(s,'customer.contact-code',customer.id);
    return result;
  }
  if(path==='admin/customer-care'&&method==='GET')return notificationCareData(careData(s.customers,orders(s),s.campaign,s.customerCare,s.orderNotices),s.lineNotifications||[]);
  if(path==='admin/line-notification'&&method==='POST'){
    const order=orders(s).find(o=>o.id===body.orderId&&o.quantity>0);
    if(!order)throw new AppError('找不到有效預購',404);
    const n=orderNoticeForSend(body,order,s.campaign,s.orderNotices?.[order.id]);
    const job=queueNotification(s.lineNotifications||=([]),body.kind,order,s.campaign,{message:body.message});
    if(job.firstPushAt&&body.message!==job.message)throw new AppError('此通知已嘗試發送，請重載原內容後再重試',409);
    if(!job.firstPushAt&&!['accepted','manual_done','sending'].includes(job.status))job.message=body.message.trim();
    return {ok:true,notificationId:job.id,signature:n.signature};
  }
  if(path==='admin/customer-care'&&method==='PUT'){
    const customer=s.customers.find(c=>c.id===body.customerId);
    if(!customer)throw new AppError('找不到客戶',404);
    const care=planCustomerCare(body,s.customerCare?.[customer.id]);
    s.customerCare={...s.customerCare,[customer.id]:care};event(s,'customer.care',customer.id,{version:care.version});return {ok:true,care};
  }
  if(path==='admin/order-notice'&&method==='PUT'){
    const order=orders(s).find(o=>o.id===body.orderId&&o.quantity>0);
    if(!order)throw new AppError('找不到有效預購',404);
    const record=planNotice(body,order,s.campaign,s.customerCare?.[order.customer_id],s.orderNotices?.[order.id]);
    for(const job of s.lineNotifications||[])if(job.orderId===order.id&&job.kind===body.kind&&job.signature===body.signature){
      if(job.status==='sending'&&Date.parse(job.leaseUntil)>Date.now())throw new AppError('通知正在發送，請稍後重新載入',409);
      if(body.status==='sent')job.status='manual_done';
    }
    s.orderNotices={...s.orderNotices,[order.id]:record};event(s,'order.notice',order.id,{kind:body.kind,status:body.status,version:record.version});return {ok:true,record};
  }
  if (path === 'customer/orders' && method === 'GET') return { campaign: s.campaign, orders: orders(s, session.subject) };
  if (path === 'customer/profile' && method === 'PATCH') {
    const c = s.customers.find(c => c.id === session.subject); if (!c) throw new AppError('請重新登入',401);
    Object.assign(c, contact(body), { delivery: String(body.delivery || '').slice(0,500) });
    event(s,'customer.profile',c.id); return { ok:true };
  }
  if (path === 'customer/preorders' && method === 'POST') {
    const requestId = text(body.requestId,'送出識別',100), signature = JSON.stringify(body);
    const saved = s.submissions.find(x => x.customer_id === session.subject && x.request_id === requestId);
    if (saved) {
      if (saved.signature !== signature) throw new AppError('同一送出識別不能用於不同內容',409);
      if (s.preorders.find(o => o.id === saved.result.orderId)?.deleted_at) throw new AppError('這次送出的預購已由店主刪除，請重新整理後再送出',409);
      return saved.result;
    }
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
    let o = s.preorders.find(o => !o.deleted_at && o.customer_id === session.subject);
    if (!o) { const id=next(s,'preorders'); o={ id, customer_id:session.subject, code:`CC${new Date().getFullYear()}-${String(id).padStart(4,'0')}`, created_at:stamp(), version:0 }; s.preorders.push(o); }
    for (const {v,p,quantity} of combined.values()) {
      const old=s.items.find(i => i.order_id===o.id && i.variant_id===v.id && i.price===v.price);
      if (old) old.quantity=integer(old.quantity+quantity,'累計數量',999,1);
      else s.items.push({id:next(s,'items'),order_id:o.id,variant_id:v.id,product_code:p.code,product_name:p.name,color:v.color,size:v.size,price:v.price,quantity,bought:0,shortage:0});
    }
    Object.assign(o,details,{updated_at:stamp(),version:o.version+1});
    const c=s.customers.find(c => c.id===session.subject); if (!c) throw new AppError('請重新登入',401); Object.assign(c,details);
    const result={ok:true,orderId:o.id,code:o.code,added:[...combined.values()].reduce((a,i)=>a+i.quantity,0)};
    result.notificationId=queueNotification(s.lineNotifications||=([]),'thanks',orders(s,session.subject).find(x=>x.id===o.id),s.campaign,{automatic:true}).id;
    s.submissions.push({customer_id:session.subject,request_id:requestId,signature,result}); event(s,'preorder.submit',o.id,{added:result.added});return result;
  }
  const itemMatch=path.match(/^customer\/items\/(\d+)$/);
  if (itemMatch && method==='PATCH') {
    assertOpen(s.campaign);const i=s.items.find(i=>i.id===Number(itemMatch[1])&&s.preorders.some(o=>!o.deleted_at&&o.id===i.order_id&&o.customer_id===session.subject));
    if(!i)throw new AppError('找不到這筆預購',404);
    const r=s.procurement.find(r=>r.variant_id===i.variant_id);
    if(i.bought||i.shortage||r?.bought||r?.shortage)throw new AppError('已有採購紀錄，請聯絡店主',409);
    i.quantity=integer(body.quantity,'數量',999); const o=s.preorders.find(o=>o.id===i.order_id);o.version++;o.updated_at=stamp();event(s,'preorder.modify',i.id);return{ok:true};
  }
  if (path==='admin/state'&&method==='GET') {
    const os=orders(s), rs=report(s), active=os.filter(o=>o.quantity>0);
    return {campaign:s.campaign,promotion:promotionSettings(s.promotion),costSettings:s.costSettings || {exchangeRate:null},categories:categoryNames(s.categories,s.products),products:catalog(s,true),orders:os,report:rs,stats:{customers:active.length,quantity:active.reduce((a,o)=>a+o.quantity,0),total:active.reduce((a,o)=>a+o.total,0),products:s.products.filter(p=>p.active).length,...Object.fromEntries(['bought','shortage','remaining'].map(k=>[k,rs.reduce((a,r)=>a+r[k],0)]))},events:s.events.slice(-12).reverse().map(({detail,...e})=>e)};
  }
  if(path==='admin/promotion'&&method==='PUT') {
    s.promotion=planPromotion(body,s.promotion);
    event(s,'promotion.update','1',{enabled:s.promotion.enabled,version:s.promotion.version});
    return {ok:true,promotion:s.promotion};
  }
  if(path==='admin/cost-settings'&&method==='PUT') {
    s.costSettings={exchangeRate:validateExchangeRate(body.exchangeRate)};
    event(s,'cost.settings','1',s.costSettings);return {ok:true};
  }
  if(path==='admin/product-order'&&method==='PUT') {
    s.merchandising=planProductOrder(body,catalog(s,true),s.merchandising);
    event(s,'product.order','campaign',{version:s.merchandising.version,productIds:s.merchandising.productIds});
    return {ok:true,settings:s.merchandising};
  }
  const deletion=path.match(/^admin\/orders\/(\d+)\/delete$/);
  if(deletion&&method==='POST') {
    const order=s.preorders.find(o=>o.id===Number(deletion[1]));
    const items=s.items.filter(i=>i.order_id===order?.id);
    const reason=validateOrderDeletion(order,items,s.procurement,body);
    if(order.deleted_at)return {ok:true};
    const before=structuredClone(order);
    Object.assign(order,{deleted_at:stamp(),delete_reason:reason,updated_at:stamp(),version:order.version+1});
    for(const variantId of new Set(items.filter(i=>i.quantity>0).map(i=>i.variant_id))) {
      let row=s.procurement.find(r=>r.variant_id===variantId);
      if(!row){row={variant_id:variantId,bought:0,shortage:0,note:'',version:0};s.procurement.push(row);}
      row.version++;
    }
    event(s,'preorder.delete',order.id,{before,reason,quantity:items.reduce((n,i)=>n+i.quantity,0)});
    return {ok:true};
  }
  if(path==='admin/categories'&&method==='POST') {
    const existing=categoryNames(s.categories,s.products),name=validateNewCategory(body.name,existing);
    s.categories=[...existing,name];event(s,'category.create',name);
    return {ok:true,categories:s.categories};
  }
  if(path==='admin/products'&&method==='POST')return{ok:true,id:saveProduct(s,body,imagePrefix)};
  if(path==='admin/import'&&method==='POST') {
    const {products,errors,count}=previewProductImport(body.csv,p=>validateProduct(p,imagePrefix),code=>s.products.some(p=>p.code===code));
    if(body.commit){if(errors.length)throw new AppError('請先修正所有匯入錯誤');for(const p of products)saveProduct(s,p,imagePrefix);event(s,'products.import','campaign',{count:products.length});}
    return{ok:true,products,errors,count};
  }
  const procurement=path.match(/^admin\/procurement\/(\d+)$/);
  if(procurement&&method==='PUT') {
    const r=report(s).find(r=>r.variant_id===Number(procurement[1]));if(!r)throw new AppError('找不到採買需求',404);
    if(r.version!==body.version)throw new AppError('資料已在另一個畫面更新，請重新整理',409);
    validateProcurement({demand:r.demand,bought:body.bought,shortage:body.shortage,allocatedBought:r.allocated_bought,allocatedShortage:r.allocated_shortage});
    const cost=validateCost(body.cost,r.cost,s.costSettings);
    let row=s.procurement.find(x=>x.variant_id===r.variant_id);if(!row){row={variant_id:r.variant_id};s.procurement.push(row);}
    const before=structuredClone(row);
    Object.assign(row,{bought:body.bought,shortage:body.shortage,note:String(body.note||'').slice(0,500),cost,version:r.version+1});event(s,'procurement.update',r.variant_id,{before,after:structuredClone(row)});return{ok:true};
  }
  if(path==='admin/allocation'&&method==='POST') {
    const i=s.items.find(i=>i.id===body.itemId&&i.quantity>0&&s.preorders.some(o=>o.id===i.order_id&&!o.deleted_at));if(!i)throw new AppError('找不到有效明細',404);
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
