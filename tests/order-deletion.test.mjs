import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { emptyState, operate, upsertCustomer } from '../cloud/core.mjs';
import { openStore } from '../server/store.mjs';
import { api } from '../server/api.mjs';
import { reportSheets } from '../server/reports.mjs';
import { costSummary } from '../shared/costing.js';

const owner={role:'admin',subject:'owner'},a={role:'customer',subject:'delete-test-a'},b={role:'customer',subject:'delete-test-b'};
const product={code:'DELETE1',name:'刪除測試選物',category:'測試',kind:'vest',tone:'#b9a38b',price:590,colors:'白',sizes:'S'};
async function fixture(engine){
  const state=engine==='cloud'?emptyState():null,store=engine==='sqlite'?openStore(':memory:',{password:'fixture-only'}):null;
  const run=async(path,method='GET',body={},session=owner)=>engine==='cloud'?operate(state,path,method,body,session)
    :api({store,req:{},role:session?.role||'admin',path:'/api/'+path,method,body,session});
  await run('admin/products','POST',product);
  await run('admin/campaign','PUT',{name:'刪除測試',status:'open',closesAt:new Date(Date.now()+86400000).toISOString()});
  for(const c of [a,b]){
    if(state)upsertCustomer(state,{id:c.subject,display_name:'測試'});
    else store.run('INSERT INTO customers(id,display_name) VALUES(?,?)',c.subject,'測試');
  }
  const submission={requestId:crypto.randomUUID(),name:'測試',phone:'0912345678',items:[{variantId:1,quantity:2,expectedPrice:590}]};
  const first=await run('customer/preorders','POST',submission,a);
  return {state,store,run,submission,first,close:()=>store?.db.close()};
}

for(const engine of ['cloud','sqlite']){
  test(`${engine}: delete confirmation, customer invisibility, reports, audit and replay protection`,async()=>{
    const f=await fixture(engine),{state,store,run,first,submission}=f;
    try{
      await run('customer/preorders','POST',{...submission,requestId:crypto.randomUUID(),items:[{...submission.items[0],quantity:3}]},b);
      await run('admin/cost-settings','PUT',{exchangeRate:.024});
      await run('admin/procurement/1','PUT',{version:0,bought:0,shortage:0,cost:{unitKrw:10000,exchangeRate:.024}});
      let admin=await run('admin/state'),order=admin.orders.find(o=>o.id===first.orderId);
      const originalItems=structuredClone(order.items),products=structuredClone(admin.products),customers=state?structuredClone(state.customers):store.all('SELECT * FROM customers');
      const body={confirmCode:order.code,reason:'客戶取消',version:order.version};
      const path='admin/orders/'+order.id+'/delete';
      for(const bad of [{...body,confirmCode:''},{...body,confirmCode:'OTHER'},{...body,reason:''},{...body,reason:'x'.repeat(301)},{...body,version:order.version+1}]){
        await assert.rejects(()=>run(path,'POST',bad));assert.deepEqual(await run('admin/state'),admin);
      }
      await assert.rejects(()=>run(path,'POST',body,null),e=>e.status===401);
      await assert.rejects(()=>run(path,'POST',body,a));
      await run(path,'POST',body);
      admin=await run('admin/state');
      assert.equal(admin.orders.length,1);assert.equal(admin.report[0].demand,3);assert.equal(admin.stats.quantity,3);assert.equal(admin.stats.total,1770);
      assert.deepEqual(costSummary(admin.report),{demandKrw:30000,demandTwd:720,boughtKrw:0,boughtTwd:0,salesTotal:1770,missingDemand:0,missingBought:0});
      assert.deepEqual(admin.report[0].cost,{unitKrw:10000,exchangeRate:.024});assert.equal(admin.report[0].version,2);
      const withoutCostVersions=ps=>ps.map(p=>({...p,variants:p.variants.map(({costVersion,...v})=>v)}));
      assert.deepEqual(withoutCostVersions(admin.products),withoutCostVersions(products));
      assert.deepEqual((await run('customer/orders','GET',{},a)).orders,[]);
      assert.equal((await run('customer/orders','GET',{},b)).orders[0].quantity,3);
      await assert.rejects(()=>run('customer/items/'+originalItems[0].id,'PATCH',{quantity:1},a),e=>e.status===404);
      await assert.rejects(()=>run('admin/allocation','POST',{itemId:originalItems[0].id,bought:0,shortage:0}),e=>e.status===404);
      await assert.rejects(()=>run('customer/preorders','POST',submission,a),e=>e.status===409);
      await assert.rejects(()=>run('admin/procurement/1','PUT',{version:1,bought:0,shortage:0}),e=>e.status===409);
      const sheets=reportSheets(admin.campaign,admin.orders,admin.report,admin.costSettings);
      assert.equal(sheets[0].rows.length,2);assert.ok(!JSON.stringify(sheets).includes(order.code));
      const fresh=await run('customer/preorders','POST',{...submission,requestId:crypto.randomUUID()},a);
      assert.notEqual(fresh.orderId,first.orderId);assert.notEqual(fresh.code,first.code);
      await run(path,'POST',body); // Retry only targets the already-deleted ID.
      assert.equal((await run('customer/orders','GET',{},a)).orders[0].id,fresh.orderId);
      assert.equal((await run('admin/state')).report[0].demand,5);
      if(state){
        const deleted=state.preorders.find(o=>o.id===first.orderId);assert.ok(deleted.deleted_at);assert.equal(deleted.delete_reason,'客戶取消');
        assert.deepEqual(state.items.filter(i=>i.order_id===first.orderId),originalItems);assert.deepEqual(state.customers,customers);
        assert.equal(state.events.filter(e=>e.kind==='preorder.delete').length,1);
      }else{
        const deleted=store.get('SELECT * FROM preorders WHERE id=?',first.orderId);assert.ok(deleted.deleted_at);assert.equal(deleted.delete_reason,'客戶取消');
        assert.deepEqual(structuredClone(store.all('SELECT * FROM items WHERE order_id=?',first.orderId)),originalItems);assert.deepEqual(store.all('SELECT * FROM customers'),customers);
        assert.equal(store.get("SELECT COUNT(*) AS n FROM events WHERE kind='preorder.delete'").n,1);
      }
    }finally{f.close();}
  });

  test(`${engine}: procurement or allocation results and stale orders block deletion`,async()=>{
    const f=await fixture(engine),{run,first,submission}=f;
    try{
      let order=(await run('admin/state')).orders[0];
      const path='admin/orders/'+first.orderId+'/delete',body={confirmCode:order.code,reason:'測試防呆',version:order.version};
      for(const result of [{bought:1,shortage:0},{bought:0,shortage:1}]){
        let row=(await run('admin/state')).report[0];await run('admin/procurement/1','PUT',{version:row.version,...result});
        const itemId=(await run('admin/state')).orders[0].items[0].id;
        if(result.bought)await run('admin/allocation','POST',{itemId,bought:1,shortage:0});
        const before=await run('admin/state');await assert.rejects(()=>run(path,'POST',body),e=>e.status===409);assert.deepEqual(await run('admin/state'),before);
        if(result.bought)await run('admin/allocation','POST',{itemId,bought:0,shortage:0});
        row=before.report[0];await run('admin/procurement/1','PUT',{version:row.version,bought:0,shortage:0});
      }
      await run('customer/preorders','POST',{...submission,requestId:crypto.randomUUID()},a);
      await assert.rejects(()=>run(path,'POST',body),e=>e.status===409);
      order=(await run('admin/state')).orders[0];
      await run(path,'POST',{...body,version:order.version});assert.deepEqual((await run('customer/orders','GET',{},a)).orders,[]);
      assert.equal((await run('admin/state')).report.length,0);
    }finally{f.close();}
  });
}

test('legacy SQLite order uniqueness upgrades without losing snapshots or foreign keys',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'ccbaby-delete-migration-')),filename=join(directory,'test.sqlite');
  let store=openStore(filename,{seed:true,password:'fixture-only'});
  try{
    const orders=store.orders(),items=store.all('SELECT * FROM items'),procurement=store.all('SELECT * FROM procurement');
    store.db.exec(`PRAGMA foreign_keys=OFF;BEGIN IMMEDIATE;
      CREATE TABLE old_preorders(id INTEGER PRIMARY KEY,customer_id TEXT UNIQUE NOT NULL REFERENCES customers(id),code TEXT UNIQUE,name TEXT NOT NULL,phone TEXT NOT NULL,created_at TEXT NOT NULL,updated_at TEXT NOT NULL,version INTEGER NOT NULL DEFAULT 1);
      INSERT INTO old_preorders SELECT id,customer_id,code,name,phone,created_at,updated_at,version FROM preorders;
      DROP TABLE preorders;ALTER TABLE old_preorders RENAME TO preorders;COMMIT;PRAGMA foreign_keys=ON;`);
    store.db.close();store=openStore(filename);
    assert.deepEqual(store.orders(),orders);assert.deepEqual(store.all('SELECT * FROM items'),items);assert.deepEqual(store.all('SELECT * FROM procurement'),procurement);
    assert.deepEqual(store.all('PRAGMA foreign_key_check'),[]);assert.equal(store.get('PRAGMA foreign_keys').foreign_keys,1);
    const order=orders[0];store.run('UPDATE preorders SET deleted_at=? WHERE id=?',new Date().toISOString(),order.id);
    store.run('INSERT INTO preorders(customer_id,code,name,phone,created_at,updated_at) VALUES(?,?,?,?,?,?)',order.customer_id,'FRESH-ORDER',order.name,order.phone,new Date().toISOString(),new Date().toISOString());
    store.db.close();store=openStore(filename);
    assert.ok(!store.orders().some(o=>o.id===order.id));assert.ok(store.orders().some(o=>o.code==='FRESH-ORDER'));
    assert.deepEqual(store.all('SELECT * FROM items'),items);assert.deepEqual(store.all('PRAGMA foreign_key_check'),[]);
  }finally{store.db.close();await rm(directory,{recursive:true,force:true});}
});
