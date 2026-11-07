import { AppError } from './validation.mjs';

export const BROWSING_DAYS = 180;
export const browsingPages = ['shop','product','cart','orders'];
export const browsingActions = ['category','search','more','photo','zoom','select_color','select_size','detail_quantity','cart_add','cart_quantity','cart_remove','submit_attempt','submit_success','submit_failure','order_quantity','profile_saved','about','account','size_guide','logout'];
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function requireBrowsingRole(session, role) {
  if (!session || session.role !== role) throw new AppError('請先登入',401);
}
export function browsingQuery(params) {
  const days=Number(params.get('days') || 30), customerId=params.get('customerId') || '';
  if(![7,30,180].includes(days) || customerId.length>160)throw new AppError('瀏覽查詢條件無效');
  const cursor=params.get('before') || '';
  let before=null;
  if(cursor){
    const [at,id,...rest]=cursor.split('|');
    if(rest.length || !uuid.test(id) || !Number.isFinite(Date.parse(at)))throw new AppError('瀏覽分頁識別無效');
    before={at:new Date(at).toISOString(),id};
  }
  return {days,customerId,before};
}
export function validateBrowsing(body, session, products, now=Date.now()) {
  requireBrowsingRole(session,'customer');
  if(!Array.isArray(body.events)||!body.events.length||body.events.length>20)throw new AppError('每次最多回報 20 筆瀏覽紀錄');
  const ids=new Set();
  return body.events.map(e=>{
    if(!e||!uuid.test(e.id)||!uuid.test(e.visitId)||ids.has(e.id))throw new AppError('瀏覽識別無效');
    ids.add(e.id);
    if(!['page_view','action'].includes(e.type)||!browsingPages.includes(e.page))throw new AppError('瀏覽事件無效');
    if(e.type==='action'&&!browsingActions.includes(e.action))throw new AppError('瀏覽操作無效');
    const at=Date.parse(e.at), activeMs=e.activeMs ?? 0;
    if(!Number.isFinite(at)||at<now-86400000||at>now+300000)throw new AppError('瀏覽時間無效');
    if(!Number.isSafeInteger(activeMs)||activeMs<0||activeMs>43200000||activeMs>Math.max(0,now-at)+5000||(e.type==='action'&&activeMs!==0))throw new AppError('停留時間無效');
    const row={id:e.id,visitId:e.visitId,at:new Date(at).toISOString(),type:e.type,page:e.page,activeMs};
    if(e.type==='action')row.action=e.action;
    if(e.productId!=null){
      const p=products.find(p=>p.id===e.productId);
      if(!p)throw new AppError('瀏覽商品無效');
      Object.assign(row,{productId:p.id,productCode:p.code,productName:p.name});
      if(e.variantId!=null){
        const v=p.variants.find(v=>v.id===e.variantId);
        if(!v)throw new AppError('瀏覽規格無效');
        Object.assign(row,{variantId:v.id,color:v.color,size:v.size});
      }
    }
    if(e.page==='product'&&!row.productId)throw new AppError('瀏覽商品無效');
    if(e.quantity!=null){if(!Number.isSafeInteger(e.quantity)||e.quantity<0||e.quantity>999)throw new AppError('瀏覽數量無效');row.quantity=e.quantity;}
    // Only known catalog values; never persist arbitrary input, URLs, tokens or form fields.
    if(e.category!=null&&(['全部選物',...products.map(p=>p.category)].includes(e.category)))row.category=e.category;
    if(e.results!=null&&Number.isSafeInteger(e.results)&&e.results>=0&&e.results<=10000)row.results=e.results;
    if(e.option!=null&&row.productId){
      const field=e.action==='select_color'?'color':e.action==='select_size'?'size':null;
      if(field&&products.find(p=>p.id===row.productId).variants.some(v=>v[field]===e.option))row.option=e.option;
    }
    return row;
  });
}
export function summarizeBrowsing(events) {
  const grouped=new Map();
  for(const e of events){
    if(!grouped.has(e.customerId))grouped.set(e.customerId,{customerId:e.customerId,visits:new Set(),pageViews:0,productViews:0,activeMs:0,cartAdds:0,submits:0,lastSeen:e.at});
    const p=grouped.get(e.customerId);p.visits.add(e.visitId);p.lastSeen=[p.lastSeen,e.receivedAt||e.at].sort().at(-1);
    if(e.type==='page_view'){p.pageViews++;p.activeMs+=e.activeMs;if(e.page==='product')p.productViews++;}
    if(e.action==='cart_add')p.cartAdds++;
    if(e.action==='submit_success')p.submits++;
  }
  return [...grouped.values()].map(p=>({...p,visits:p.visits.size}));
}
export function browsingPeople(metrics,customers,orders) {
  return customers.map(c=>{
    const m=metrics.find(p=>p.customerId===c.id);
    return {customerId:c.id,displayName:c.display_name,name:c.name||'',visits:0,pageViews:0,productViews:0,activeMs:0,cartAdds:0,submits:0,lastSeen:null,...m,hasPreorder:orders.some(o=>o.customer_id===c.id&&o.quantity>0)};
  }).sort((a,b)=>(b.lastSeen||'').localeCompare(a.lastSeen||''));
}
export function browsingInterests(events) {
  const map=new Map();
  for(const e of events.filter(e=>e.productId)){
    if(!map.has(e.productId))map.set(e.productId,{productId:e.productId,productCode:e.productCode,productName:e.productName,views:0,activeMs:0,cartAdds:0});
    const p=map.get(e.productId);
    if(e.type==='page_view'){p.views++;p.activeMs+=e.activeMs;}
    if(e.action==='cart_add')p.cartAdds++;
  }
  return [...map.values()].sort((a,b)=>b.views-a.views||b.activeMs-a.activeMs);
}
export function browsingPage(events,before) {
  const sorted=events.filter(e=>!before||e.at<before.at||(e.at===before.at&&e.id<before.id)).sort((a,b)=>b.at.localeCompare(a.at)||b.id.localeCompare(a.id));
  const page=sorted.slice(0,200),last=page.at(-1);
  return {events:page,nextCursor:sorted.length>200?last.at+'|'+last.id:null};
}
