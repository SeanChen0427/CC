import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createBrowsingTracker } from '../apps/customer-web/browsing.js';
import { validateBrowsing,browsingQuery,browsingPage } from '../domain/browsing.mjs';
import { startApp } from '../server/index.mjs';
const customer={role:'customer',subject:'alice'};
const product={id:1,code:'TEST',name:'測試',category:'衣著',variants:[{id:10,color:'白',size:'S'}]};
const event=(extra={})=>({id:randomUUID(),visitId:randomUUID(),at:new Date().toISOString(),type:'page_view',page:'product',productId:1,activeMs:0,...extra});

test('browsing assigns identity on server, strips arbitrary input and validates catalog references',()=>{
  const e=event({customerId:'bob',token:'secret',url:'?code=secret',phone:'0900000000',detail:{text:'private'},productName:'forged'});
  const [clean]=validateBrowsing({events:[e]},customer,[product]);
  assert.equal(clean.productName,'測試');
  for(const field of ['customerId','token','url','phone','detail'])assert.equal(clean[field],undefined);
  for(const session of [null,{role:'admin',subject:'owner'}])assert.throws(()=>validateBrowsing({events:[e]},session,[product]),e=>e.status===401);
  for(const extra of [{productId:2},{variantId:2},{type:'arbitrary'},{page:'https://example.test'},{activeMs:999999},{type:'action',action:'capture_input'},{at:new Date(Date.now()-2*86400000).toISOString()}])assert.throws(()=>validateBrowsing({events:[event(extra)]},customer,[product]));
  assert.throws(()=>validateBrowsing({events:Array.from({length:21},()=>event())},customer,[product]));
  assert.throws(()=>browsingQuery(new URLSearchParams({days:'999'})));
});

test('foreground timing excludes hidden and idle periods and starts a new visit after inactivity',async()=>{
  let clock=Date.now();const batches=[];
  const t=createBrowsingTracker({now:()=>clock,send:async b=>batches.push(structuredClone(b))});
  t.view('shop');clock+=10000;t.view('product',1);clock+=5000;t.visibility(false);
  clock+=120000;t.visibility(true);clock+=10000;await t.flush();
  const first=batches.flatMap(b=>b.events),productView=first.find(e=>e.page==='product');
  assert.equal(first.find(e=>e.page==='shop').activeMs,10000);assert.equal(productView.activeMs,15000);
  clock+=120000;t.sample();await t.flush();
  assert.equal(batches.at(-1).events.find(e=>e.id===productView.id).activeMs,65000);
  clock+=1800000;t.action('cart_add',{productId:1,variantId:10,quantity:1});await t.flush();
  assert.notEqual(batches.at(-1).events.find(e=>e.action==='cart_add').visitId,productView.visitId);
  assert.equal(batches.at(-1).events.find(e=>e.type==='page_view').activeMs,0);
});

test('failed delivery retries identical event IDs and concurrent updates remain pending',async()=>{
  let clock=Date.now(),fail=true,release;const batches=[];
  const t=createBrowsingTracker({now:()=>clock,send:async b=>{batches.push(structuredClone(b));if(fail)throw new Error('offline');if(release===undefined)await new Promise(r=>release=r);}});
  t.view('shop');await t.flush();clock+=1000;fail=false;
  const pending=t.flush();await Promise.resolve();clock+=1000;t.sample();release();await pending;await t.flush();
  assert.equal(batches[0].events[0].id,batches[1].events[0].id);assert.equal(batches.at(-1).events[0].activeMs,2000);
});

test('timeline keyset pagination does not skip identical timestamps',()=>{
  const rows=Array.from({length:205},()=>event()),a=browsingPage(rows,null);
  assert.equal(a.events.length,200);const [at,id]=a.nextCursor.split('|');const b=browsingPage(rows,{at,id});
  assert.equal(b.events.length,5);assert.equal(new Set([...a.events,...b.events].map(e=>e.id)).size,205);
});

test('private browsing API is durable, idempotent, isolated and does not mutate preorder data',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'ccbaby-browsing-test-')),password=randomUUID();
  let app=await startApp({directory,customerPort:0,adminPort:0,seed:true,password,quiet:true});
  const cookies={};
  const call=async(role,path,body,jar=role)=>{
    const base='http://127.0.0.1:'+app[role+'Port'];const r=await fetch(base+'/api/'+path,{method:body?'POST':'GET',headers:{'Content-Type':'application/json',Origin:base,...(cookies[jar]?{Cookie:cookies[jar]}:{})},body:body?JSON.stringify(body):undefined});
    if(r.headers.get('set-cookie'))cookies[jar]=r.headers.get('set-cookie').split(';')[0];
    return {status:r.status,data:await r.json()};
  };
  try{
    assert.equal((await call('customer','customer/browsing',{events:[event()]})).status,401);
    assert.equal((await call('admin','admin/browsing')).status,401);
    await call('admin','admin/login',{username:'hannah',password});
    await call('customer','customer/login',{profile:'demo-anna'},'anna');
    await call('customer','customer/login',{profile:'demo-mumu'},'mumu');
    assert.equal((await call('customer','admin/browsing',null,'anna')).status,403);
    assert.equal((await call('admin','customer/browsing',{events:[event()]})).status,403);
    const before=app.store.all('SELECT * FROM events'),orders=app.store.orders();
    const p=app.store.catalog()[0],row=event({productId:p.id,at:new Date(Date.now()-10000).toISOString(),activeMs:1000});
    const add=event({type:'action',action:'cart_add',productId:p.id,variantId:p.variants[0].id,quantity:2});
    for(const activeMs of [1000,2000,500])assert.equal((await call('customer','customer/browsing',{customerId:'demo-mumu',events:[{...row,activeMs},add]},'anna')).status,200);
    const list=(await call('admin','admin/browsing?days=30')).data.people;
    const anna=list.find(p=>p.customerId==='demo-anna');assert.equal(anna.productViews,1);assert.equal(anna.cartAdds,1);assert.equal(anna.activeMs,2000);
    assert.equal(list.find(p=>p.customerId==='demo-mumu').visits,0);
    const detail=(await call('admin','admin/browsing?customerId=demo-anna')).data;
    assert.equal(detail.events.length,2);assert.equal(detail.interests[0].views,1);assert.equal(detail.events[0].customerId,'demo-anna');
    assert.deepEqual(app.store.orders(),orders);assert.deepEqual(app.store.all('SELECT * FROM events'),before);
    await app.close();app=await startApp({directory,customerPort:0,adminPort:0,seed:true,quiet:true});
    assert.equal((await call('admin','admin/browsing?customerId=demo-anna')).data.events.length,2);
    const old={...row,id:randomUUID(),at:new Date(Date.now()-181*86400000).toISOString()};
    app.store.run('INSERT INTO browsing_events VALUES(?,?,?,?,?)','demo-anna',old.id,old.at,old.at,JSON.stringify(old));
    await call('customer','customer/browsing',{events:[event({productId:p.id})]},'anna');
    assert.equal(app.store.get('SELECT COUNT(*) n FROM browsing_events WHERE id=?',old.id).n,0);
  }finally{await app.close();await rm(directory,{recursive:true,force:true});}
});
