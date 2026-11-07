import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { analyzeJourney,prioritizeJourneys } from '../apps/admin-web/browsing-insights.js';
import { merchandising,productSignals,planProductOrder,orderedProducts } from '../domain/merchandising.mjs';
import { emptyState,operate } from '../cloud/core.mjs';
import { startApp } from '../server/index.mjs';

const now=Date.parse('2026-11-08T00:00:00Z');
const at=offset=>new Date(now+offset).toISOString();
const campaign={status:'open',closesAt:at(86400000)};
const person={customerId:'anna',visits:2,productViews:4,cartAdds:1,lastSeen:at(-10000),hasPreorder:false};
const analyze=extra=>analyzeJourney({person,campaign,orders:[],now,...extra});

test('guidance separates missing data, recent carts, stale activity and closed campaigns',()=>{
  assert.equal(analyze({person:{...person,visits:0,lastSeen:null}}).key,'no_data');
  assert.equal(analyze({}).key,'cart_help');
  assert.equal(analyze({person:{...person,lastSeen:at(-8*86400000)}}).key,'stale');
  assert.equal(analyze({campaign:{status:'closed'}}).key,'not_open');
  assert.equal(analyze({person:{...person,cartAdds:0}}).key,'returning');
  const partial=analyze({partial:true});assert.match(partial.limit,/最近 200/);
  assert.doesNotMatch(partial.draft,/我看到你|你購物車還有|保證|折扣/);
});

test('current formal orders and resolved failures suppress inappropriate order reminders',()=>{
  const failure={action:'submit_failure',at:at(-1000)};
  assert.equal(analyze({events:[failure]}).key,'submit_check');
  assert.equal(analyze({events:[failure,{action:'submit_success',at:at(0)}]}).key,'cart_help');
  const order={id:1,customer_id:'anna',quantity:1,updated_at:at(0),items:[{shortage:0}]};
  const ordered=analyze({events:[failure],orders:[order]});
  assert.equal(ordered.key,'ordered');assert.equal(ordered.draft,'');
  assert.equal(analyze({events:[failure],orders:[{...order,updated_at:at(-2000)}]}).key,'addition_check');
  assert.equal(analyze({orders:[{...order,items:[{shortage:1}]}]}).key,'shortage');
  const ranked=prioritizeJourneys([person,{...person,customerId:'other',cartAdds:0}],{campaign,orders:[],now});
  assert.equal(ranked[0].person.customerId,'anna');
});

const products=Array.from({length:8},(_,i)=>({id:i+1,code:'P'+(i+1),name:'商品'+(i+1),category:'衣著',active:true,images:[],variants:[{id:100+i}]}));
test('product signals count unique customers instead of refreshes and cart clicks',()=>{
  const events=Array.from({length:40},()=>({customerId:'anna',type:'page_view',page:'product',productId:1}));
  events.push(...Array.from({length:10},()=>({customerId:'anna',action:'cart_add',productId:1})));
  events.push({customerId:'mumu',type:'page_view',page:'product',productId:1});
  const signals=productSignals(events);
  assert.equal(signals.observedPeople,2);assert.deepEqual(signals.products,[{productId:1,viewers:2,cartPeople:1}]);
});

test('ranking preserves all active products, reserves exploration and excludes deleted demand',()=>{
  const orders=[{customer_id:'anna',items:[{variant_id:105,quantity:2}]},{customer_id:'deleted',deleted_at:at(0),items:[{variant_id:100,quantity:99}]}];
  const signals={observedPeople:6,products:products.slice(0,6).map(p=>({productId:p.id,viewers:3,cartPeople:1}))};
  const result=merchandising([...products,{...products[0],id:99,active:false}],orders,signals);
  assert.equal(result.suggestedIds[0],6);assert.equal(result.suggestedIds[4],7);
  assert.equal(new Set(result.suggestedIds).size,8);assert.equal(result.rows.find(r=>r.productId===1).buyers,0);
  assert.deepEqual(merchandising(products,[],{}, {productIds:[8,7]}).suggestedIds,[8,7,1,2,3,4,5,6]);
});

test('manual approval validates a complete permutation and version, keeps an undo snapshot',()=>{
  const current={version:2,productIds:[2,1]};
  for(const body of [{version:1,productIds:[1,2]},{version:2,productIds:[1,1]},{version:2,productIds:[1]},{version:2,productIds:[1,99]}]){
    assert.throws(()=>planProductOrder(body,products.slice(0,2),current),error=>error.status===409);
  }
  const next=planProductOrder({version:2,productIds:[1,2]},products.slice(0,2),current,now);
  assert.deepEqual(next.previousIds,[2,1]);assert.equal(next.version,3);assert.deepEqual(current,{version:2,productIds:[2,1]});
  assert.deepEqual(orderedProducts(products,[2,1]).map(p=>p.id),[2,1,3,4,5,6,7,8]);
});

test('cloud catalog changes only after owner approval and reveals no ranking evidence',()=>{
  const s=emptyState();s.products=products.map(({variants,...p})=>p);s.variants=products.flatMap(p=>p.variants.map(v=>({...v,product_id:p.id,active:true})));
  const customer={role:'customer',subject:'anna'},admin={role:'admin',subject:'owner'};
  const snapshot=JSON.stringify(s);
  assert.throws(()=>operate(s,'admin/product-order','PUT',{version:0,productIds:[8,7,6,5,4,3,2,1]},customer),e=>e.status===401);
  assert.equal(JSON.stringify(s),snapshot);
  operate(s,'admin/product-order','PUT',{version:0,productIds:[8,7,6,5,4,3,2,1]},admin);
  const catalog=operate(s,'catalog','GET',{},customer);
  assert.deepEqual(catalog.products.map(p=>p.id),[8,7,6,5,4,3,2,1]);
  assert.equal(catalog.merchandising,undefined);assert.equal(catalog.products[0].score,undefined);
});

test('local suggestions are read-only; approved order persists and anonymous/customer writes fail',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'ccbaby-sales-test-')),password=randomUUID();
  let app=await startApp({directory,customerPort:0,adminPort:0,seed:true,password,quiet:true});
  const cookies={};
  const call=async(role,path,body,method=body?'POST':'GET')=>{
    const base='http://127.0.0.1:'+app[role+'Port'];
    const r=await fetch(base+'/api/'+path,{method,headers:{'Content-Type':'application/json',Origin:base,...(cookies[role]?{Cookie:cookies[role]}:{})},body:body?JSON.stringify(body):undefined});
    if(r.headers.get('set-cookie'))cookies[role]=r.headers.get('set-cookie').split(';')[0];
    return {status:r.status,data:await r.json()};
  };
  try{
    assert.equal((await call('admin','admin/merchandising')).status,401);
    await call('admin','admin/login',{username:'hannah',password});
    await call('customer','customer/login',{profile:'demo-anna'});
    const before=JSON.stringify({orders:app.store.orders(),products:app.store.catalog(true),events:app.store.all('SELECT * FROM events')});
    const preview=(await call('admin','admin/merchandising')).data;
    assert.equal(JSON.stringify({orders:app.store.orders(),products:app.store.catalog(true),events:app.store.all('SELECT * FROM events')}),before);
    const ids=[...preview.currentIds].reverse();
    assert.equal((await call('customer','admin/product-order',{version:0,productIds:ids},'PUT')).status,403);
    assert.equal((await call('admin','admin/product-order',{version:0,productIds:ids},'PUT')).status,200);
    assert.equal((await call('admin','admin/product-order',{version:0,productIds:ids},'PUT')).status,409);
    assert.deepEqual((await call('customer','catalog')).data.products.map(p=>p.id),ids);
    const journey=(await call('admin','admin/browsing')).data;
    assert.ok(journey.context);assert.equal(journey.context.orders[0]?.phone,undefined);
    await app.close();app=await startApp({directory,customerPort:0,adminPort:0,quiet:true});
    const saved=(await call('admin','admin/merchandising')).data;
    assert.equal(saved.settings.version,1);assert.deepEqual(saved.currentIds,ids);
    assert.deepEqual(JSON.parse(JSON.stringify(app.store.orders())),JSON.parse(before).orders);
  }finally{await app.close();await rm(directory,{recursive:true,force:true});}
});
