import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyState, operate, upsertCustomer } from '../cloud/core.mjs';
import { openStore } from '../server/store.mjs';
import { api } from '../server/api.mjs';
import { productCostState } from '../shared/product-costing.js';
import { reportSheets } from '../server/reports.mjs';

const owner={role:'admin',subject:'owner'},customer={role:'customer',subject:'product-cost-customer'};
const product={code:'PCOST1',name:'商品進價',category:'測試',kind:'vest',tone:'#b9a38b',price:590,colors:'白',sizes:'S,M'};
for(const engine of ['cloud','sqlite'])test(`${engine}: optional product costs and procurement share prices, versions and private exports`,async()=>{
  const state=engine==='cloud'?emptyState():null,store=engine==='sqlite'?openStore(':memory:',{password:'fixture-only'}):null;
  const run=async(path,method='GET',body={},session=owner)=>state?operate(state,path,method,body,session):api({store,req:{},role:session?.role||'admin',path:'/api/'+path,method,body,session});
  const edit=async(costUpdate,extra={})=>run('admin/products','POST',{...product,id:1,...extra,...(costUpdate?{costUpdate}:{})});
  try{
    await run('admin/products','POST',product); // Blank cost never requires a rate.
    let admin=await run('admin/state'),p=admin.products[0];
    assert.equal(admin.costSettings.exchangeRate,null);assert.ok(p.variants.every(v=>v.cost===null));
    assert.equal(admin.report.length,0);
    const cost={unitKrw:10000,exchangeRate:.024};
    await edit({cost,defaultExchangeRate:.024,versions:productCostState(p.variants).versions});
    admin=await run('admin/state');p=admin.products[0];
    assert.equal(admin.costSettings.exchangeRate,.024);assert.ok(p.variants.every(v=>v.cost.unitKrw===10000));
    assert.equal(admin.report.length,0); // Cost recording does not create demand or purchases.
    await run('admin/campaign','PUT',{name:'商品成本測試',status:'open',closesAt:new Date(Date.now()+86400000).toISOString()});
    if(state)upsertCustomer(state,{id:customer.subject,display_name:'測試'});else store.run('INSERT INTO customers(id,display_name) VALUES(?,?)',customer.subject,'測試');
    await run('customer/preorders','POST',{requestId:crypto.randomUUID(),name:'測試',phone:'0912345678',items:[{variantId:1,quantity:2,expectedPrice:590}]},customer);
    admin=await run('admin/state');assert.deepEqual(admin.report[0].cost,cost);
    let row=admin.report[0];
    const stale=productCostState(admin.products[0].variants).versions;
    await run('admin/procurement/1','PUT',{bought:1,shortage:0,note:'採買備註',cost:{unitKrw:13000,exchangeRate:.024},version:row.version});
    admin=await run('admin/state');assert.equal(admin.products[0].variants[0].cost.unitKrw,13000);
    assert.equal(productCostState(admin.products[0].variants).mixed,true);
    const unchanged=structuredClone(admin.products[0].variants);
    await edit(undefined,{name:'只改商品名稱'});
    assert.deepEqual((await run('admin/state')).products[0].variants,unchanged);
    const before=await run('admin/state');
    await assert.rejects(()=>edit({cost:{unitKrw:999,exchangeRate:.03},defaultExchangeRate:.03,versions:stale}),e=>e.status===409);
    assert.deepEqual(await run('admin/state'),before);
    for(const invalid of [{unitKrw:-1,exchangeRate:.024},{unitKrw:1.5,exchangeRate:.024},{unitKrw:100,exchangeRate:0}]){
      await assert.rejects(()=>edit({cost:invalid,versions:productCostState(before.products[0].variants).versions}));
      assert.deepEqual(await run('admin/state'),before);
    }
    await edit({cost:{unitKrw:20000,exchangeRate:.03},defaultExchangeRate:.03,versions:productCostState(before.products[0].variants).versions});
    admin=await run('admin/state');row=admin.report[0];
    assert.equal(row.bought,1);assert.equal(row.shortage,0);assert.equal(row.note,'採買備註');
    assert.equal(row.cost.unitKrw,20000);assert.equal(admin.costSettings.exchangeRate,.03);
    assert.equal(admin.orders[0].items[0].price,590);assert.equal(row.salesTotal,1180);
    const sheets=reportSheets(admin.campaign,admin.orders,admin.report,admin.costSettings);
    assert.deepEqual(sheets[0].rows[1].slice(15),[20000,.03,600,40000,1200,'已記錄']);
    const versions=productCostState(admin.products[0].variants).versions;
    await edit(undefined,{sizes:'S,M,L'});
    p=(await run('admin/state')).products[0];
    assert.equal(p.variants.find(v=>v.size==='L').cost.unitKrw,20000);
    assert.deepEqual(productCostState(p.variants).versions.slice(0,2),versions);
    for(const path of ['catalog','customer/orders','me']){
      const result=JSON.stringify(await run(path,'GET',{},customer));
      assert.doesNotMatch(result,/"cost"|"costVersion"|"costSettings"|"costUpdate"|"unitKrw"|"exchangeRate"/);
    }
    await assert.rejects(()=>run('admin/products','POST',{...product,id:1,costUpdate:{cost:null,versions:[]}},customer));
    await edit({cost:null,versions:productCostState(p.variants).versions},{sizes:'S,M,L'});
    admin=await run('admin/state');assert.ok(admin.products[0].variants.every(v=>v.cost===null));
    await edit({cost:{unitKrw:0,exchangeRate:.03},versions:productCostState(admin.products[0].variants).versions},{sizes:'S,M,L'});
    admin=await run('admin/state');assert.equal(admin.report[0].cost.unitKrw,0);
    assert.equal(productCostState(admin.products[0].variants).mixed,false);
    // The customer can still only see sales prices after every cost operation.
    assert.equal((await run('catalog','GET',{},customer)).products[0].variants[0].price,590);
    const created=await run('admin/products','POST',{...product,code:'PCOST2',costUpdate:{cost:{unitKrw:11000,exchangeRate:.03},versions:[]}});
    assert.ok((await run('admin/state')).products.find(p=>p.id===created.id).variants.every(v=>v.cost.unitKrw===11000));
  }finally{store?.db.close();}
});
