import test,{after,beforeEach} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {emptyState,operate,orders} from '../cloud/core.mjs';
import {queueNotification,claimNotification,notificationMessage,lineRecipient,publicNotification} from '../domain/line-notifications.mjs';
import {orderNotice} from '../domain/customer-care.mjs';
import {dispatchLineNotification} from '../server/line-delivery.mjs';
import {createLineMessaging} from '../server/line-messaging.mjs';
import {lineContactMessage,lineContactURL} from '../shared/line-contact.js';

const member='line:U'+'a'.repeat(32),other='line:U'+'b'.repeat(32),owner={role:'admin',subject:'owner'},customer={role:'customer',subject:member};
const campaign={status:'open',closesAt:'2099-01-01T00:00:00Z'};
const order={id:1,customer_id:member,code:'TEST-001',name:'測試會員',version:1,quantity:2,total:1000,items:[{id:1,product_code:'P1',product_name:'測試商品',color:'白',size:'M',price:500,quantity:2,bought:0,shortage:0,cost:'private-cost'}]};
const payload={requestId:'test-submit',name:'測試會員',phone:'0912345678',items:[{variantId:1,quantity:2,expectedPrice:500}]};
function fixture(){const s=emptyState();s.campaign={...campaign};s.customers=[{id:member,display_name:'測試會員'},{id:other,display_name:'另一會員'}];s.products=[{id:1,active:true,code:'P1',name:'測試商品',category:'衣著'}];s.variants=[{id:1,active:true,product_id:1,color:'白',size:'M',price:500}];return s;}
function memory(){const ctx={jobs:[],orders:[structuredClone(order)],campaign:{...campaign},notices:{},session:owner};const job=queueNotification(ctx.jobs,'thanks',ctx.orders[0],ctx.campaign);return {ctx,job,transact:fn=>fn(ctx)};}
function fakeLine({used=0,status=200,wrongAccount=false,failQuota=false}={}){
  const requests=[];
  const fetcher=async(url,options={})=>{
    const path=new URL(url).pathname;requests.push({path,options});
    if(path==='/v2/bot/info')return Response.json({basicId:wrongAccount?'@other':'@445yxcey'});
    if(path==='/v2/bot/message/quota')return failQuota?new Response('',{status:503}):Response.json({type:'limited',value:200});
    if(path==='/v2/bot/message/quota/consumption')return Response.json({totalUsage:used});
    if(path.startsWith('/v2/bot/profile/'))return Response.json({userId:member.slice(5)});
    if(path==='/v2/bot/message/push')return new Response('{}',{status,headers:status===409?{'x-line-accepted-request-id':'accepted-request'}:{'x-line-request-id':'request'}});
    throw new Error('Unexpected test path '+path);
  };
  return {requests,messaging:createLineMessaging({token:'test-only-token',enabled:true,fetcher})};
}

test('preorder and durable notification commit together, duplicate submit reuses the same job',()=>{
  const s=fixture(),first=operate(s,'customer/preorders','POST',payload,customer);
  assert.equal(s.lineNotifications.length,1);assert.equal(s.lineNotifications[0].automatic,true);
  assert.deepEqual(operate(s,'customer/preorders','POST',payload,customer),first);assert.equal(s.lineNotifications.length,1);
  assert.throws(()=>operate(s,'customer/preorders','POST',{...payload,items:[{...payload.items[0],expectedPrice:1}]},customer));
  assert.equal(s.lineNotifications.length,1);
  operate(s,'customer/preorders','POST',{...payload,requestId:'append'},customer);assert.equal(s.lineNotifications.length,2);
  assert.equal(s.lineNotifications[1].orderId,first.orderId);assert.notEqual(s.lineNotifications[0].signature,s.lineNotifications[1].signature);
});
test('recipient uses verified LINE identity and customer contact requires no code',()=>{
  assert.equal(lineRecipient(member),member.slice(5));assert.equal(lineRecipient('line:fake'),null);
  const s=fixture(),before=JSON.stringify(s);
  const contact=operate(s,'customer/line-contact','POST',{},customer);
  assert.equal(contact.contactCode,null);assert.equal(contact.changed,false);assert.equal(JSON.stringify(s),before);
  assert.doesNotMatch(lineContactMessage(null,{order}),/聯繫碼|Uaaaa/);
  assert.match(lineContactURL(null,{order}),/TEST-001/);
});
test('notifications include the order snapshot and protected link, never cost, phone or notes',()=>{
  const msg=notificationMessage('thanks',{...order,phone:'private-phone',note:'private-note'},campaign);
  assert.match(msg,/P1 測試商品｜白／M × 2/);assert.match(msg,/#orders/);assert.doesNotMatch(msg,/private/);
  assert.match(msg,/24 小時內完成付款/);assert.match(msg,/確認付款後才安排採購/);assert.match(msg,/依付款順序寄出/);assert.doesNotMatch(msg,/不用付款|到台後再通知付款/);
  assert.throws(()=>notificationMessage('arrived',order,campaign));
  assert.throws(()=>notificationMessage('arrived',order,{status:'arrived'}));
  const arrived=notificationMessage('arrived',{...order,items:[{...order.items[0],bought:1,shortage:1}]},{status:'arrived'});
  assert.match(arrived,/NT\$ 500/);assert.match(arrived,/確認缺貨 1/);
  assert.match(arrived,/退款或更換/);assert.doesNotMatch(arrived,/再付款|付款及交付/);
  const long=notificationMessage('thanks',{...order,items:Array.from({length:150},()=>({...order.items[0],product_name:'長商品名'.repeat(20)}))},campaign);
  assert.ok(long.length<=3000);assert.match(long,/完整明細/);assert.doesNotMatch(long,/長商品名/);
});
test('arrival send needs owner role, explicit per-order confirmation, current version and allocation',()=>{
  const s=fixture();operate(s,'customer/preorders','POST',payload,customer);
  const o=orders(s)[0],n=orderNotice('arrived',o,s.campaign);
  const body={orderId:o.id,kind:'arrived',version:0,signature:n.signature,message:'到台通知',confirm:true};
  assert.throws(()=>operate(s,'admin/line-notification','POST',body,customer),e=>e.status===401);
  assert.throws(()=>operate(s,'admin/line-notification','POST',body,owner),e=>e.status===409);
  s.campaign.status='arrived';s.items[0].bought=1;
  body.signature=orderNotice('arrived',orders(s)[0],s.campaign).signature;
  assert.throws(()=>operate(s,'admin/line-notification','POST',{...body,confirm:false},owner));
  assert.throws(()=>operate(s,'admin/line-notification','POST',{...body,version:99},owner),e=>e.status===409);
  const result=operate(s,'admin/line-notification','POST',{...body,customerId:other},owner);
  assert.equal(s.lineNotifications.find(j=>j.id===result.notificationId).customerId,member);
  assert.equal(s.lineNotifications.find(j=>j.id===result.notificationId).automatic,false);
});
test('accepted push records API acceptance once; repeated or simultaneous sends do not duplicate',async()=>{
  const m=memory(),line=fakeLine();
  const results=await Promise.all([dispatchLineNotification(m.job.id,{...m,...line}),dispatchLineNotification(m.job.id,{...m,...line})]);
  assert.ok(results.some(r=>r.status==='accepted'));
  assert.equal(line.requests.filter(r=>r.path.endsWith('/push')).length,1);
  const push=line.requests.find(r=>r.path.endsWith('/push'));
  assert.equal(push.options.headers['X-Line-Retry-Key'],m.job.id);
  assert.equal(JSON.parse(push.options.body).to,member.slice(5));
  assert.equal(m.ctx.notices[1].notices.thanks.method,'line-api');
  await dispatchLineNotification(m.job.id,{...m,...line});assert.equal(line.requests.filter(r=>r.path.endsWith('/push')).length,1);
});
test('quota exhaustion, wrong OA, unconfigured mode and quota errors preserve manual fallback without a push',async()=>{
  for(const options of [{used:200},{wrongAccount:true},{failQuota:true}]){
    const m=memory(),line=fakeLine(options),result=await dispatchLineNotification(m.job.id,{...m,...line});
    assert.equal(result.status,'manual');assert.ok(result.message.includes('TEST-001'));
    assert.equal(line.requests.filter(r=>r.path.endsWith('/push')).length,0);
  }
  const m=memory();const result=await dispatchLineNotification(m.job.id,{...m,messaging:createLineMessaging()});
  assert.equal(result.reason,'not_configured');assert.equal(m.ctx.notices[1],undefined);
});
test('uncertain push retries exactly the same payload/key and reconciles accepted 409',async()=>{
  const m=memory(),line=fakeLine({status:503});
  const failed=await dispatchLineNotification(m.job.id,{...m,...line});assert.equal(failed.reason,'uncertain');assert.equal(m.job.mayHaveSent,true);
  const retry=fakeLine({status:409}),result=await dispatchLineNotification(m.job.id,{...m,...retry});
  assert.equal(result.status,'accepted');
  const first=line.requests.find(r=>r.path.endsWith('/push')),second=retry.requests.find(r=>r.path.endsWith('/push'));
  assert.equal(first.options.body,second.options.body);assert.equal(first.options.headers['X-Line-Retry-Key'],second.options.headers['X-Line-Retry-Key']);
});
test('manual completion, stale order, other customer and expired uncertain requests cannot send',async()=>{
  for(const mode of ['manual','stale','expired']){
    const m=memory(),line=fakeLine();
    if(mode==='manual')m.job.status='manual_done';
    if(mode==='stale')m.ctx.orders[0].version++;
    if(mode==='expired'){m.job.mayHaveSent=true;m.job.firstPushAt=new Date(Date.now()-24*3600000).toISOString();}
    const result=await dispatchLineNotification(m.job.id,{...m,...line});
    assert.equal(line.requests.length,0);assert.ok(['manual_done','superseded','manual'].includes(result.status));
  }
  const m=memory();m.ctx.session={role:'customer',subject:other};
  await assert.rejects(dispatchLineNotification(m.job.id,{...m,...fakeLine()}),e=>e.status===401);
});
test('an interrupted worker lease becomes retryable while keeping the original request key',async()=>{
  const m=memory(),line=fakeLine({status:409});
  Object.assign(m.job,{status:'sending',leaseUntil:new Date(Date.now()-1000).toISOString(),firstPushAt:new Date().toISOString(),mayHaveSent:true});
  assert.equal(publicNotification(m.job).inProgress,false);
  const result=await dispatchLineNotification(m.job.id,{...m,...line});
  assert.equal(result.status,'accepted');assert.equal(line.requests.find(r=>r.path.endsWith('/push')).options.headers['X-Line-Retry-Key'],m.job.id);
});
test('manual completion suppresses a persisted automatic job, including submit replay',()=>{
  const s=fixture(),result=operate(s,'customer/preorders','POST',payload,customer),o=orders(s)[0],n=orderNotice('thanks',o,s.campaign);
  operate(s,'admin/customer-care','PUT',{customerId:member,version:0,chatConfirmed:true},owner);
  operate(s,'admin/order-notice','PUT',{orderId:o.id,kind:'thanks',version:0,status:'sent',signature:n.signature},owner);
  assert.equal(s.lineNotifications[0].status,'manual_done');
  assert.equal(operate(s,'customer/preorders','POST',payload,customer).notificationId,result.notificationId);
  assert.equal(claimNotification(s.lineNotifications[0],o,s.campaign),false);
});
test('order mutation during preflight prevents obsolete push and hides private delivery data from customers',async()=>{
  const m=memory(),line=fakeLine(),quota=line.messaging.quota;
  line.messaging.quota=async()=>{const result=await quota();m.ctx.orders[0].version++;return result;};
  await dispatchLineNotification(m.job.id,{...m,...line});assert.equal(line.requests.filter(r=>r.path.endsWith('/push')).length,0);
  const s=fixture();operate(s,'customer/preorders','POST',payload,customer);
  const visible=JSON.stringify(operate(s,'customer/orders','GET',{},customer));assert.doesNotMatch(visible,/lineNotifications|notificationId|firstPushAt/);
});

// Actual Edge entry with isolated PostgREST and LINE stubs. No external network
// request, production session, real order, or real message is made.
const originalFetch=globalThis.fetch,originalDeno=globalThis.Deno;
let handler,state,revision,apiPushStatus,commitConflict,requests;
const hash=s=>createHash('sha256').update(s).digest('hex');
const env={SUPABASE_URL:'https://backend.test',SUPABASE_SERVICE_ROLE_KEY:'test-only',LINE_CHANNEL_ID:'login-test',LINE_CHANNEL_SECRET:'test-secret',LINE_MESSAGING_ACCESS_TOKEN:'test-only',LINE_NOTIFICATIONS_ENABLED:'true'};
globalThis.Deno={env:{get:key=>env[key]},serve:fn=>{handler=fn;}};
globalThis.fetch=async(url,options={})=>{
  const path=new URL(url).pathname,body=options.body?JSON.parse(options.body):{};requests.push(path);
  if(path==='/rest/v1/rpc/ccbaby_load')return Response.json({data:state,revision,session:body.p_hash===hash('owner')?owner:body.p_hash===hash('customer')?customer:null});
  if(path==='/rest/v1/rpc/ccbaby_commit'){
    if(commitConflict){commitConflict=false;revision++;state.campaign.description='concurrent change';return Response.json(false);}
    if(body.p_revision!==revision)return Response.json(false);
    state=body.p_data;revision++;return Response.json(true);
  }
  if(path==='/v2/bot/info')return Response.json({basicId:'@445yxcey'});
  if(path==='/v2/bot/message/quota')return Response.json({type:'limited',value:200});
  if(path==='/v2/bot/message/quota/consumption')return Response.json({totalUsage:0});
  if(path.startsWith('/v2/bot/profile/'))return Response.json({userId:member.slice(5)});
  if(path==='/v2/bot/message/push')return new Response('{}',{status:apiPushStatus});
  throw new Error('Unexpected test path '+path);
};
await import('../cloud/index.ts');
after(()=>{globalThis.fetch=originalFetch;if(originalDeno===undefined)delete globalThis.Deno;else globalThis.Deno=originalDeno;});
beforeEach(()=>{state=fixture();revision=1;apiPushStatus=200;commitConflict=false;requests=[];});
const invoke=(path,{body,token='customer',role='customer',method=body?'POST':'GET'}={})=>handler(new Request('https://backend.test/functions/v1/ccbaby-api/'+path,{method,headers:{Origin:'https://ccbaby.beecharge.live','Content-Type':'application/json','x-ccbaby-role':role,Authorization:'Bearer '+token},body:body?JSON.stringify(body):undefined}));
test('actual Edge commits preorder before automatic push, preserves concurrent changes and sends once',async()=>{
  commitConflict=true;
  const response=await invoke('customer/preorders',{body:payload});assert.equal(response.status,200);
  assert.equal(state.preorders.length,1);assert.equal(state.lineNotifications.length,1);assert.equal(state.lineNotifications[0].status,'accepted');
  assert.equal(state.campaign.description,'concurrent change');
  assert.ok(requests.indexOf('/rest/v1/rpc/ccbaby_commit')<requests.indexOf('/v2/bot/message/push'));
  assert.equal((await invoke('customer/preorders',{body:payload})).status,200);assert.equal(requests.filter(x=>x==='/v2/bot/message/push').length,1);
});
test('actual Edge notification failure never rejects a successfully saved preorder',async()=>{
  apiPushStatus=503;
  const response=await invoke('customer/preorders',{body:payload});assert.equal(response.status,200);
  const result=await response.json();assert.ok(result.orderId);assert.equal(state.preorders.length,1);assert.equal(state.lineNotifications[0].reason,'uncertain');
});
test('actual Edge manual endpoint rejects anonymous/wrong role and enforces arrival confirmation',async()=>{
  for(const options of [{token:'invalid',role:'admin'},{token:'customer',role:'customer'}])assert.ok([401,403].includes((await invoke('admin/line-notification',{...options,body:{}})).status));
  await invoke('customer/preorders',{body:payload});state.campaign.status='arrived';state.items[0].bought=1;
  const o=orders(state)[0],n=orderNotice('arrived',o,state.campaign,state.orderNotices[o.id]);
  const body={orderId:o.id,kind:'arrived',version:state.orderNotices[o.id].version,signature:n.signature,message:notificationMessage('arrived',o,state.campaign),confirm:true};
  assert.equal((await invoke('admin/line-notification',{token:'owner',role:'admin',body:{...body,confirm:false}})).status,400);
  const response=await invoke('admin/line-notification',{token:'owner',role:'admin',body});assert.equal(response.status,200);assert.equal((await response.json()).notification.status,'accepted');
});
