import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID,createHash } from 'node:crypto';
import { mkdtemp,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { assignContactCode,planCustomerCare,orderNotice,planNotice,careDashboard } from '../domain/customer-care.mjs';
import { lineContactMessage,lineContactURL,validContactCode } from '../shared/line-contact.js';
import { layoutOrderCards,wrapCardText } from '../apps/admin-web/order-card.js';
import { emptyState,operate } from '../cloud/core.mjs';
import { startApp } from '../server/index.mjs';

const campaign={status:'open',closesAt:'2027-01-01T00:00:00Z'};
const order={id:1,customer_id:'anna',code:'TEST-001',name:'測試客戶',version:1,quantity:3,total:1800,items:[
  {id:1,variant_id:1,product_code:'P1',product_name:'測試針織',color:'白',size:'M',price:500,quantity:2,bought:0,shortage:0},
  {id:2,variant_id:2,product_code:'P2',product_name:'測試外套',color:'棕',size:'L',price:800,quantity:1,bought:0,shortage:0}
]};

test('member contact codes are stable, distinct and URL drafts exclude session and private identifiers',()=>{
  const a={id:'line:private-a'},b={id:'line:private-b'},customers=[a,b];
  const first=assignContactCode(a,customers);assert.ok(validContactCode(first.contactCode));
  const next=assignContactCode(a,customers);assert.equal(next.contactCode,first.contactCode);assert.equal(next.changed,false);
  const other=assignContactCode(b,customers);assert.notEqual(other.contactCode,first.contactCode);
  assert.throws(()=>assignContactCode({},[a],()=>a.contact_code.slice(3)),e=>e.status===503);
  const url=lineContactURL(first.contactCode,{product:{code:'P01',name:'尺寸 & 顏色？'}});
  assert.ok(url.startsWith('https://line.me/R/oaMessage/%40445yxcey/?'));
  assert.match(decodeURIComponent(url),/P01 尺寸 & 顏色？/);assert.doesNotMatch(url,/private-a|token|phone|customerId/);
  assert.match(lineContactMessage(first.contactCode,{order}),/TEST-001/);
  assert.throws(()=>lineContactURL('line:private-a'));
});

test('manual chat verification and follow-up validate versions, dates and allowed fields',()=>{
  const next=planCustomerCare({version:0,chatConfirmed:true,chatLabel:' 小安 ',followUpAt:'2026-11-10T10:00:00+08:00',followUpNote:'確認尺寸',phone:'secret'});
  assert.equal(next.version,1);assert.equal(next.chatLabel,'小安');assert.equal(next.followUpAt,'2026-11-10T02:00:00.000Z');assert.equal(next.phone,undefined);
  assert.throws(()=>planCustomerCare({version:0},next),e=>e.status===409);
  for(const body of [{version:0,chatConfirmed:'true'},{version:0,followUpAt:'bad'},{version:0,chatLabel:'a'.repeat(81)}])assert.throws(()=>planCustomerCare(body));
  const cleared=planCustomerCare({version:1,chatConfirmed:false,followUpAt:null},next);assert.equal(cleared.chatConfirmedAt,null);assert.equal(cleared.followUpAt,null);
});

test('purchase and payment notices depend on this customer allocation and actual arrival',()=>{
  assert.equal(orderNotice('thanks',order,campaign).eligible,true);
  assert.equal(orderNotice('purchased',order,campaign).eligible,false);
  assert.equal(orderNotice('payment',order,campaign).eligible,false);
  const partial=structuredClone(order);partial.items[0].bought=1;
  const progress=orderNotice('purchased',partial,campaign);assert.equal(progress.title,'採購進度通知');assert.match(progress.message,/已買到 1 件/);assert.doesNotMatch(progress.message,/已全部買到/);
  assert.equal(orderNotice('payment',partial,campaign).eligible,false);
  const payment=orderNotice('payment',partial,{status:'arrived'});assert.equal(payment.eligible,true);assert.equal(payment.progress.boughtTotal,500);assert.match(payment.message,/NT\$ 500/);assert.doesNotMatch(payment.message,/NT\$ 1,800/);
  const full=structuredClone(order);full.items.forEach(i=>i.bought=i.quantity);assert.equal(orderNotice('purchased',full,campaign).title,'已全部買到通知');
  const shortage=structuredClone(order);shortage.items.forEach(i=>i.shortage=i.quantity);assert.equal(orderNotice('purchased',shortage,campaign).title,'缺貨結果確認');assert.equal(orderNotice('payment',shortage,{status:'arrived'}).eligible,false);
});

test('notification marks require manual identity confirmation and become pending after relevant changes',()=>{
  const n=orderNotice('thanks',order,campaign),body={version:0,kind:'thanks',status:'sent',signature:n.signature};
  assert.throws(()=>planNotice(body,order,campaign,{}),e=>e.status===409);
  const record=planNotice(body,order,campaign,{chatConfirmed:true});assert.equal(orderNotice('thanks',order,campaign,record).done,true);
  assert.throws(()=>planNotice(body,order,campaign,{chatConfirmed:true},record),e=>e.status===409);
  const updated=structuredClone(order);updated.items[0].quantity++;
  assert.equal(orderNotice('thanks',updated,campaign,record).changed,true);
  assert.throws(()=>planNotice({...body,version:1},updated,campaign,{chatConfirmed:true},record),e=>e.status===409);
  assert.throws(()=>planNotice({...body,kind:'payment'},order,campaign,{chatConfirmed:true}),e=>e.status===409);
});

test('reminders prioritize due follow-ups, keep unopened chat separate, and exclude deleted orders',()=>{
  const customers=[{id:'anna',display_name:'小安'},{id:'mumu',display_name:'沐沐',contact_code:'CC-123456ABCDEF'}];
  const people=careDashboard(customers,[order,{...order,id:2,customer_id:'mumu',deleted_at:'2026-11-08'}],campaign,{anna:{chatConfirmed:true,followUpAt:'2026-11-01T00:00:00Z'}},{},Date.parse('2026-11-08'));
  assert.equal(people[0].next.key,'followup');assert.equal(people[1].next.key,'chat');assert.equal(people[1].orderCount,0);
  const confirmed=careDashboard(customers,[order],campaign,{anna:{chatConfirmed:true}});assert.equal(confirmed.find(p=>p.customerId==='anna').next.key,'thanks');
});

test('long Chinese product names and every item survive card pagination without cost or contact fields',()=>{
  const large={...order,items:Array.from({length:150},(_,i)=>({...order.items[0],id:i+1,product_code:'P'+i,product_name:'很長的商品名稱'.repeat(10),phone:'private',cost:{unitKrw:1234}}))};
  const n=orderNotice('thanks',large,campaign),layout=layoutOrderCards(large,n,(text,size)=>Array.from(text).length*size);
  assert.ok(layout.pages.length>1);const rows=layout.pages.flat();assert.equal(rows.length,150);
  assert.equal(rows[0].name.join(''),'P0 '+large.items[0].product_name);assert.doesNotMatch(JSON.stringify(layout),/private|unitKrw/);
  for(const page of layout.pages)assert.ok(layout.top+page.reduce((sum,r)=>sum+r.height,0)<=1230);
  assert.deepEqual(wrapCardText('尺寸\n材質',100,text=>text.length*20),['尺寸','材質']);
});

test('cloud contact/care stay role-isolated and private metadata never enters customer endpoints',()=>{
  const state=emptyState();state.customers=[{id:'anna',display_name:'小安'},{id:'mumu',display_name:'沐沐'}];state.campaign=campaign;
  const anna={role:'customer',subject:'anna'},admin={role:'admin',subject:'owner'};
  const first=operate(state,'customer/line-contact','POST',{customerId:'mumu'},anna);assert.ok(first.changed);assert.equal(state.customers[1].contact_code,undefined);
  const snapshot=JSON.stringify(state);assert.equal(operate(state,'customer/line-contact','POST',{},anna).changed,false);assert.equal(JSON.stringify(state),snapshot);
  assert.throws(()=>operate(state,'admin/customer-care','GET',{},anna),e=>e.status===401);
  assert.throws(()=>operate(state,'customer/line-contact','POST',{},admin),e=>e.status===401);
  operate(state,'admin/customer-care','PUT',{customerId:'anna',version:0,chatConfirmed:true,followUpNote:'店主私有備註'},admin);
  const me=operate(state,'me','GET',{},anna);assert.doesNotMatch(JSON.stringify(me),/店主私有備註|chatConfirmed|followUpAt/);
  const care=operate(state,'admin/customer-care','GET',{},admin);assert.equal(care.people[0].care.followUpNote,'店主私有備註');
});

test('local contact workflow persists and blocks stale, wrong-role, unallocated and early payment notices',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'ccbaby-care-test-')),password=randomUUID();
  let app=await startApp({directory,customerPort:0,adminPort:0,seed:true,password,quiet:true});
  const cookies={};
  const call=async(role,path,body,method=body?'POST':'GET',jar=role)=>{
    const base='http://127.0.0.1:'+app[role+'Port'];
    const r=await fetch(base+'/api/'+path,{method,headers:{Origin:base,'Content-Type':'application/json',...(cookies[jar]?{Cookie:cookies[jar]}:{})},body:body?JSON.stringify(body):undefined});
    if(r.headers.get('set-cookie'))cookies[jar]=r.headers.get('set-cookie').split(';')[0];return {status:r.status,data:await r.json()};
  };
  try{
    assert.equal((await call('admin','admin/customer-care')).status,401);
    assert.equal((await call('customer','customer/line-contact',{})).status,401);
    await call('admin','admin/login',{username:'hannah',password});await call('customer','customer/login',{profile:'demo-anna'});
    const snapshot=()=>createHash('sha256').update(JSON.stringify({orders:app.store.all('SELECT * FROM preorders'),items:app.store.all('SELECT * FROM items'),products:app.store.catalog(true),campaign:app.store.campaign()})).digest('hex');const business=snapshot();
    const contact=(await call('customer','customer/line-contact',{customerId:'demo-mumu'})).data;
    assert.ok(validContactCode(contact.contactCode));assert.equal((await call('customer','customer/line-contact',{})).data.changed,false);
    assert.equal(app.store.get('SELECT contact_code FROM customers WHERE id=?','demo-mumu').contact_code,null);
    assert.equal((await call('customer','admin/customer-care')).status,403);assert.equal((await call('admin','customer/line-contact',{})).status,403);
    const before=app.store.all('SELECT * FROM events');let data=(await call('admin','admin/customer-care')).data;
    assert.deepEqual(app.store.all('SELECT * FROM events'),before);let o=data.orders.find(o=>o.customer_id==='demo-anna'),n=o.notices[0];
    const mark={orderId:o.id,version:0,kind:'thanks',status:'sent',signature:n.signature};
    assert.equal((await call('admin','admin/order-notice',mark,'PUT')).status,409);
    assert.equal((await call('admin','admin/customer-care',{customerId:'demo-anna',version:0,chatConfirmed:true,followUpNote:'私有提醒',followUpAt:'2026-01-01T00:00:00Z'},'PUT')).status,200);
    assert.equal((await call('admin','admin/customer-care',{customerId:'demo-anna',version:0,chatConfirmed:true},'PUT')).status,409);
    assert.equal((await call('admin','admin/order-notice',mark,'PUT')).status,200);
    assert.equal((await call('admin','admin/order-notice',mark,'PUT')).status,409);
    assert.doesNotMatch(JSON.stringify((await call('customer','me')).data),/私有提醒|followUpAt|chatConfirmed/);
    assert.equal(snapshot(),business);
    const raw=app.store.orders().find(row=>row.id===o.id&&row.customer_id==='demo-anna'),item=raw.items[0],row=app.store.report().find(r=>r.variant_id===item.variant_id);
    assert.equal((await call('admin','admin/procurement/'+item.variant_id,{version:row.version,bought:1,shortage:0,note:''},'PUT')).status,200);
    data=(await call('admin','admin/customer-care')).data;o=data.orders.find(o=>o.customer_id==='demo-anna');assert.equal(o.notices.find(n=>n.kind==='purchased').eligible,false);
    assert.equal((await call('admin','admin/allocation',{itemId:item.id,bought:1,shortage:0})).status,200);
    data=(await call('admin','admin/customer-care')).data;o=data.orders.find(o=>o.customer_id==='demo-anna');assert.equal(o.notices.find(n=>n.kind==='purchased').eligible,true);assert.equal(o.notices.find(n=>n.kind==='payment').eligible,false);
    await call('admin','admin/campaign',{name:app.store.campaign().name,status:'arrived',closesAt:app.store.campaign().closesAt},'PUT');
    data=(await call('admin','admin/customer-care')).data;o=data.orders.find(o=>o.customer_id==='demo-anna');assert.equal(o.notices.find(n=>n.kind==='payment').progress.boughtTotal,item.price);
    const arrived=o.notices.find(n=>n.kind==='arrived');
    const sent=await call('admin','admin/line-notification',{orderId:o.id,kind:'arrived',version:o.noticeVersion,signature:arrived.signature,message:arrived.message,confirm:true});
    assert.equal(sent.status,200);assert.equal(sent.data.notification.reason,'not_configured');
    assert.equal(app.store.lineNotifications().length,1);
    await app.close();app=await startApp({directory,customerPort:0,adminPort:0,quiet:true});
    const restored=(await call('admin','admin/customer-care')).data;const p=restored.people.find(p=>p.customerId==='demo-anna');
    assert.equal(p.contactCode,contact.contactCode);assert.equal(p.care.chatConfirmed,true);assert.equal(p.next.key,'followup');assert.ok(restored.orders.find(o=>o.customer_id==='demo-anna').notices.find(n=>n.kind==='thanks').done);
    assert.equal(app.store.lineNotifications()[0].reason,'not_configured');
  }finally{await app.close();await rm(directory,{recursive:true,force:true});}
});
