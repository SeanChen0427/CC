import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { emptyState, operate, upsertCustomer, orders, report } from '../cloud/core.mjs';
import { openStore } from '../server/store.mjs';
import { api } from '../server/api.mjs';
import { reportSheets } from '../server/reports.mjs';
import { unitCostTwd, costTotal, costSummary } from '../shared/costing.js';

const owner={role:'admin',subject:'owner'},customer={role:'customer',subject:'test-cost-customer'};
const product={code:'COST1',name:'進價測試',category:'測試分類',kind:'vest',tone:'#b9a38b',price:590,colors:'白',sizes:'S,M'};

for(const engine of ['cloud','sqlite']) {
  test(`${engine}: private costs, rate snapshots, sales snapshots and export totals`,async()=>{
    const state=engine==='cloud'?emptyState():null;
    const store=engine==='sqlite'?openStore(':memory:',{password:'fixture-only'}):null;
    const run=async(path,method='GET',body={},session=owner)=>engine==='cloud'
      ? operate(state,path,method,body,session)
      : api({store,req:{},role:session?.role||'admin',path:'/api/'+path,method,body,session});
    try {
      await assert.rejects(()=>run('admin/cost-settings','PUT',{exchangeRate:.024},null),e=>e.status===401);
      await assert.rejects(()=>run('admin/cost-settings','PUT',{exchangeRate:.024},customer));
      await run('admin/products','POST',product);
      const closesAt=new Date(Date.now()+86400000).toISOString();
      await run('admin/campaign','PUT',{name:'進銷測試',status:'open',closesAt});
      if(state)upsertCustomer(state,{id:customer.subject,display_name:'測試'});
      else store.run('INSERT INTO customers(id,display_name) VALUES(?,?)',customer.subject,'測試');
      const submit=async(variantId,quantity,expectedPrice)=>run('customer/preorders','POST',{
        requestId:crypto.randomUUID(),name:'測試',phone:'0912345678',items:[{variantId,quantity,expectedPrice}],
      },customer);
      await submit(1,2,590);
      await run('admin/products','POST',{...product,id:1,price:690});
      await submit(1,1,690); // Same specification with a second sales price snapshot.
      await submit(2,2,690); // Missing cost must remain missing in totals and export.
      const save=async(extra={})=>{
        const r=(await run('admin/state')).report[0];
        return run('admin/procurement/1','PUT',{version:r.version,bought:2,shortage:1,...extra});
      };
      await assert.rejects(()=>save({cost:{unitKrw:10000,exchangeRate:.024}}),e=>e.status===409);
      for(const rate of [0,-1,'',null,'NaN',Infinity,.0000001,10.1])await assert.rejects(()=>run('admin/cost-settings','PUT',{exchangeRate:rate}));
      await run('admin/cost-settings','PUT',{exchangeRate:'0.024'});
      await save({cost:{unitKrw:10001,exchangeRate:.024}});
      let admin=await run('admin/state'),row=admin.report[0];
      assert.deepEqual(row.cost,{unitKrw:10001,exchangeRate:.024});
      assert.equal(unitCostTwd(row.cost),240.02);
      assert.equal(costTotal(row.cost,3),720.06);
      assert.equal(row.priceMin,590);assert.equal(row.priceMax,690);assert.equal(row.salesTotal,1870);
      assert.deepEqual(costSummary(admin.report),{demandKrw:30003,demandTwd:720.06,boughtKrw:20002,boughtTwd:480.04,salesTotal:3250,missingDemand:2,missingBought:0});
      await run('admin/cost-settings','PUT',{exchangeRate:.03});
      await save(); // Old client omits cost and must not erase it.
      assert.deepEqual((await run('admin/state')).report[0].cost,row.cost);
      await save({cost:row.cost}); // Editing quantities keeps original rate.
      await assert.rejects(()=>save({cost:{unitKrw:1,exchangeRate:.028}}),e=>e.status===409);
      for(const unitKrw of [-1,1.5,NaN,100000001,'10',null])await assert.rejects(()=>save({cost:{unitKrw,exchangeRate:.03}}));
      await assert.rejects(()=>run('admin/procurement/1','PUT',{version:0,bought:2,shortage:1,cost:row.cost}),e=>e.status===409);
      admin=await run('admin/state');
      const sheets=reportSheets(admin.campaign,admin.orders,admin.report,admin.costSettings,'fixed');
      assert.equal(sheets.length,3);
      assert.deepEqual(sheets[0].rows[1].slice(15),[10001,.024,240.02,20002,480.04,'已記錄']);
      assert.equal(sheets[0].rows[2][9],690); // Snapshot, never current catalog price.
      assert.equal(sheets[0].rows[3][15],'');assert.equal(sheets[0].rows[3][20],'未填進價');
      assert.equal(sheets[2].rows.find(r=>r[0]==='未填進價需求件數')[1],2);
      assert.equal(sheets[2].rows.find(r=>r[0]==='需求進價已填小計（台幣）')[1],720.06);
      const workbook=engine==='sqlite'?(await run('admin/export.xlsx')).buffer:null;
      if(workbook){assert.ok(workbook.includes(Buffer.from('進銷總覽')));assert.ok(workbook.includes(Buffer.from('<v>720.06</v>')));}
      for(const path of ['catalog','customer/orders','me']) {
        const json=JSON.stringify(await run(path,'GET',{},customer));
        assert.doesNotMatch(json,/unitKrw|exchangeRate|costSettings|"cost"|240\.02/);
      }
      await save({cost:{unitKrw:0,exchangeRate:.03}});
      assert.equal((await run('admin/state')).report[0].cost.unitKrw,0);
      await save({cost:null});assert.equal((await run('admin/state')).report[0].cost,null);
      if(state)assert.ok(state.events.some(e=>e.kind==='procurement.update'&&e.detail.after.cost?.unitKrw===10001));
      else assert.ok(store.all("SELECT detail FROM events WHERE kind='procurement.update'").some(r=>JSON.parse(r.detail).after.cost?.unitKrw===10001));
    } finally {store?.db.close();}
  });
}

test('TWD rounding is exact at a half cent and totals multiply rounded unit cost',()=>{
  assert.equal(unitCostTwd({unitKrw:1,exchangeRate:.025}),.03);
  assert.equal(costTotal({unitKrw:1,exchangeRate:.025},10),.3);
  assert.equal(unitCostTwd({unitKrw:100000000,exchangeRate:.000001}),100);
  assert.equal(unitCostTwd(null),null);
});

test('SQLite upgrade and restart preserve procurement, settings, product and order snapshots',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'ccbaby-cost-migration-')),filename=join(directory,'test.sqlite');
  let store=openStore(filename,{seed:true,password:'fixture-only'});
  try {
    const before=store.orders(),products=store.catalog(true),count=store.get('SELECT COUNT(*) AS n FROM procurement').n;
    store.db.exec('ALTER TABLE procurement DROP COLUMN cost; DROP TABLE cost_settings;');store.db.close();
    store=openStore(filename);
    assert.deepEqual(store.orders(),before);assert.deepEqual(store.catalog(true),products);
    assert.equal(store.get('SELECT COUNT(*) AS n FROM procurement').n,count);
    store.run('INSERT INTO cost_settings VALUES(1,?)',.024);
    const variantId=store.report()[0].variant_id;
    store.run('INSERT INTO procurement(variant_id,cost) VALUES(?,?) ON CONFLICT(variant_id) DO UPDATE SET cost=excluded.cost',variantId,JSON.stringify({unitKrw:9000,exchangeRate:.024}));
    store.db.close();store=openStore(filename);
    assert.equal(store.costSettings().exchangeRate,.024);assert.equal(store.report().find(r=>r.variant_id===variantId).cost.unitKrw,9000);
  } finally {store.db.close();await rm(directory,{recursive:true,force:true});}
});
