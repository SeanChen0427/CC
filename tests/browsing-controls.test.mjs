import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startApp } from '../server/index.mjs';
import { browsingControlInput, acceptsBrowsing } from '../domain/browsing-controls.mjs';
import { browsingPeople } from '../domain/browsing.mjs';

test('browsing controls require a specific customer, version and explicit destructive confirmation',()=>{
  const valid={customerId:'line:fixture',version:0,action:'clear',confirm:true};
  assert.equal(browsingControlInput({...valid,orderId:99}).customerId,'line:fixture');
  for(const bad of [{customerId:''},{version:-1},{version:'0'},{action:'all'},{confirm:false},{confirm:'true'}])assert.throws(()=>browsingControlInput({...valid,...bad}));
  assert.throws(()=>browsingControlInput({...valid,action:'exclusion',excluded:'true'}));
  assert.equal(acceptsBrowsing({at:'2026-11-10T00:00:00Z'},{accept_after:'2026-11-10T00:00:00Z'}),false);
  assert.equal(acceptsBrowsing({at:'2026-11-10T00:00:01Z'},{accept_after:'2026-11-10T00:00:00Z'}),true);
  assert.equal(acceptsBrowsing({at:'2026-11-10T00:00:01Z'},{excluded:1}),false);
  const [p]=browsingPeople([],[{id:'fixture',display_name:'測試'}],[],[{customerId:'fixture',excluded:true,version:2,recordCount:4}]);
  assert.equal(p.browsingExcluded,true);assert.equal(p.browsingVersion,2);assert.equal(p.browsingRecordCount,4);
});

test('owner can clear or exclude one account without affecting peers, orders or queued-event replay protection',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'ccbaby-browsing-controls-')),password=randomUUID();
  let app=await startApp({directory,customerPort:0,adminPort:0,seed:true,password,quiet:true});
  const cookies={};
  const call=async(role,path,body,jar=role)=>{
    const base='http://127.0.0.1:'+app[role+'Port'];
    const r=await fetch(base+'/api/'+path,{method:body?'POST':'GET',headers:{Origin:base,'Content-Type':'application/json',...(cookies[jar]?{Cookie:cookies[jar]}:{})},body:body?JSON.stringify(body):undefined});
    if(r.headers.get('set-cookie'))cookies[jar]=r.headers.get('set-cookie').split(';')[0];
    return {status:r.status,data:await r.json()};
  };
  try{
    const clear={customerId:'demo-anna',version:0,action:'clear',confirm:true};
    assert.equal((await call('admin','admin/browsing/control',clear)).status,401);
    await call('admin','admin/login',{username:'hannah',password});
    await call('customer','customer/login',{profile:'demo-anna'},'anna');
    await call('customer','customer/login',{profile:'demo-mumu'},'mumu');
    assert.equal((await call('customer','admin/browsing/control',clear,'anna')).status,403);
    const product=app.store.catalog()[0];
    const event=extra=>({id:randomUUID(),visitId:randomUUID(),at:new Date(Date.now()-10000).toISOString(),type:'page_view',page:'product',productId:product.id,activeMs:1000,...extra});
    const old=event(),other=event();
    await call('customer','customer/browsing',{events:[old]},'anna');await call('customer','customer/browsing',{events:[other]},'mumu');
    const original={orders:app.store.orders(),customers:app.store.all('SELECT * FROM customers'),events:app.store.all('SELECT * FROM events'),products:app.store.catalog(true)};
    const initial=(await call('admin','admin/browsing?customerId=demo-anna')).data.person;
    assert.equal(initial.browsingRecordCount,1);assert.equal(initial.browsingVersion,0);
    for(const bad of [{...clear,confirm:false},{...clear,customerId:'*'}])assert.ok((await call('admin','admin/browsing/control',bad)).status>=400);
    assert.equal((await call('admin','admin/browsing/control',{...clear,version:1})).status,409);
    let r=await call('admin','admin/browsing/control',{...clear,action:'exclusion',excluded:true});assert.equal(r.status,200);
    let people=(await call('admin','admin/browsing')).data.people;
    assert.equal(people.find(p=>p.customerId==='demo-anna').browsingExcluded,true);
    await call('customer','customer/browsing',{events:[event()]},'anna');
    assert.equal(app.store.get('SELECT COUNT(*) AS n FROM browsing_events WHERE customer_id=?','demo-anna').n,1);
    const ranking=(await call('admin','admin/merchandising')).data;
    const rankText=JSON.stringify(ranking);assert.ok(rankText.length>0);
    // Compare against the exact signals remaining after excluding the test account.
    const {productSignals,merchandising}=await import('../domain/merchandising.mjs');
    const expected=merchandising(app.store.catalog(true),app.store.orders(),productSignals([{...other,customerId:'demo-mumu'}]),app.store.merchandisingSettings(),30);
    assert.deepEqual(ranking,expected);
    r=await call('admin','admin/browsing/control',{...clear,version:1});assert.equal(r.data.deleted,1);
    await call('customer','customer/browsing',{events:[old]},'anna');
    assert.equal(app.store.get('SELECT COUNT(*) AS n FROM browsing_events WHERE customer_id=?','demo-anna').n,0);
    assert.equal(app.store.get('SELECT COUNT(*) AS n FROM browsing_events WHERE customer_id=?','demo-mumu').n,1);
    assert.equal((await call('admin','admin/browsing/control',{...clear,version:1})).status,409);
    await call('admin','admin/browsing/control',{...clear,action:'exclusion',excluded:false,version:2});
    await call('customer','customer/browsing',{events:[old]},'anna');
    assert.equal((await call('admin','admin/browsing?customerId=demo-anna')).data.events.length,0);
    const fresh=event({at:new Date(Date.now()+10).toISOString(),activeMs:0});
    await call('customer','customer/browsing',{events:[fresh]},'anna');
    assert.equal((await call('admin','admin/browsing?customerId=demo-anna')).data.events.length,1);
    assert.deepEqual({orders:app.store.orders(),customers:app.store.all('SELECT * FROM customers'),events:app.store.all('SELECT * FROM events'),products:app.store.catalog(true)},original);
    await app.close();app=await startApp({directory,customerPort:0,adminPort:0,seed:true,quiet:true});
    people=(await call('admin','admin/browsing')).data.people;assert.equal(people.find(p=>p.customerId==='demo-anna').browsingVersion,3);
  }finally{await app.close();await rm(directory,{recursive:true,force:true});}
});
