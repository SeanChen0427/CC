import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {emptyState,operate,upsertCustomer} from '../cloud/core.mjs';
import {openStore} from '../server/store.mjs';
import {api} from '../server/api.mjs';
import {productSourceUrl} from '../domain/validation.mjs';
import {productCsv,productSheets} from '../domain/product-transfer.mjs';
import {productWorkbook} from '../server/product-workbook.mjs';
import {reportSheets} from '../server/reports.mjs';

const owner={role:'admin',subject:'owner'},customer={role:'customer',subject:'source-customer'};
const sourceUrl='https://example.test/상품/123?color=white&option=%22L%22#detail';
const product={code:'SOURCE1',name:'連結記錄',category:'衣著',kind:'vest',price:590,colors:'米白,咖啡',sizes:'S,M'};
for(const engine of ['cloud','sqlite'])test(`${engine}: private source URLs persist, clear and round-trip through product exports without changing orders`,async()=>{
  const state=engine==='cloud'?emptyState():null,store=state?null:openStore(':memory:',{password:'fixture-only'});
  const run=async(path,method='GET',body={},session=owner)=>state?operate(state,path,method,body,session):api({store,req:{},role:session?.role||'admin',path:'/api/'+path,method,body,session});
  try{
    await run('admin/products','POST',{...product,sourceUrl});
    await run('admin/campaign','PUT',{name:'來源記錄測試',status:'open',closesAt:new Date(Date.now()+86400000).toISOString()});
    if(state)upsertCustomer(state,{id:customer.subject,display_name:'測試'});else store.run('INSERT INTO customers(id,display_name) VALUES(?,?)',customer.subject,'測試');
    await run('customer/preorders','POST',{requestId:crypto.randomUUID(),name:'測試',phone:'0912345678',items:[{variantId:1,quantity:2,expectedPrice:590}]},customer);
    let admin=await run('admin/state');
    const order=JSON.stringify(admin.orders[0]),variants=structuredClone(admin.products[0].variants);
    assert.equal(admin.products[0].sourceUrl,sourceUrl);
    assert.equal(admin.report[0].sourceUrl,sourceUrl);
    for(const path of ['catalog','customer/orders','me']){
      const data=JSON.stringify(await run(path,'GET',{},customer));assert.doesNotMatch(data,/sourceUrl|source_url|example\.test/);
    }
    await run('admin/products','POST',{...product,id:1,name:'僅改名稱'}); // Older clients omit the optional field.
    admin=await run('admin/state');assert.equal(admin.products[0].sourceUrl,sourceUrl);
    assert.equal(JSON.stringify(admin.orders[0]),order);assert.deepEqual(admin.products[0].variants,variants);
    const csv=productCsv(admin.products).replace('SOURCE1','SOURCECOPY');
    const preview=await run('admin/import','POST',{csv});assert.equal(preview.errors.length,0);assert.equal(preview.products[0].sourceUrl,sourceUrl);
    await run('admin/import','POST',{csv,commit:true});
    admin=await run('admin/state');assert.equal(admin.products.find(p=>p.code==='SOURCECOPY').sourceUrl,sourceUrl);
    const sheets=productSheets(admin.products);
    assert.equal(sheets[0].rows[0][12],'韓國商品連結');assert.equal(sheets[0].rows[1][12],sourceUrl);
    assert.equal(sheets[3].rows[1].at(-1),sourceUrl);
    assert.equal(reportSheets(admin.campaign,admin.orders,admin.report)[1].rows[1].at(-1),sourceUrl);
    const file=productWorkbook(admin.products);
    assert.ok(file.includes(Buffer.from('<hyperlink ref="M2"')));assert.ok(file.includes(Buffer.from(sourceUrl.replace('&','&amp;'))));assert.ok(!file.includes(Buffer.from('<f>')));
    for(const bad of ['javascript:alert(1)','data:text/plain,x','file:///private/test','https:example.test','/relative','https://user:pass@example.test/','https://example.test/a b',null]){
      const before=JSON.stringify(await run('admin/state'));
      await assert.rejects(()=>run('admin/products','POST',{...product,id:1,sourceUrl:bad}));
      assert.equal(JSON.stringify(await run('admin/state')),before);
    }
    await run('admin/products','POST',{...product,id:1,sourceUrl:''});
    assert.equal((await run('admin/state')).products[0].sourceUrl,'');
    assert.equal(JSON.stringify((await run('admin/state')).orders[0]),order);
  }finally{store?.db.close();}
});

test('source URL validation accepts blank and complete web links and rejects unsafe or malformed values',()=>{
  assert.equal(productSourceUrl(undefined),undefined);assert.equal(productSourceUrl('   '),'');
  assert.equal(productSourceUrl(' '+sourceUrl+' '),sourceUrl);assert.equal(productSourceUrl('http://example.test/item'),'http://example.test/item');
  for(const value of [123,{},'https://','https://example.test/\nitem','https://example.test/'+ 'a'.repeat(2048)])assert.throws(()=>productSourceUrl(value));
});

test('legacy SQLite adds source URL without changing products or variants and retains the link after restart',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'ccbaby-source-')),filename=join(directory,'data.sqlite');
  let store=openStore(filename,{password:'fixture-only'});
  const save=body=>api({store,req:{},role:'admin',path:'/api/admin/products',method:'POST',session:owner,body});
  try{
    await save(product);const before=store.catalog(true)[0];
    store.db.exec('ALTER TABLE products DROP COLUMN source_url');store.db.close();store=openStore(filename);
    assert.deepEqual(store.catalog(true)[0],before);
    await save({...product,id:1,sourceUrl});store.db.close();store=openStore(filename);
    assert.equal(store.catalog(true)[0].sourceUrl,sourceUrl);assert.deepEqual(store.catalog(true)[0].variants,before.variants);
    assert.ok(!JSON.stringify(store.catalog()).includes('example.test'));
  }finally{store.db.close();await rm(directory,{recursive:true,force:true});}
});
