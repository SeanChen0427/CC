import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { startApp } from '../server/index.mjs';
import { csvRows, validateProcurement } from '../domain/rules.mjs';

test('CSV quoted cells and procurement constraints', () => {
  assert.deepEqual(csvRows('code,name\nA,"a,b"\n'), [['code','name'],['A','a,b']]);
  assert.throws(() => csvRows('code,name\nA,"broken'), /引號/);
  assert.throws(() => validateProcurement({demand:3,bought:2,shortage:2}), /缺貨/);
  assert.throws(() => validateProcurement({demand:3,bought:0,shortage:0,allocatedBought:1}), /分配/);
});

test('two local applications, durable preorders and buying reports', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'seoul-preorder-test-'));
  const password = randomUUID() + '-fixture-only';
  let app = await startApp({ directory, customerPort:0, adminPort:0, password, quiet:true,seed:true });
  const bases = () => ({
    customer: `http://127.0.0.1:${app.customerPort}`,
    admin: `http://127.0.0.1:${app.adminPort}`,
  });
  const jars = {};
  async function request(role, path, { method='GET', body, jar=role, headers={} }={}) {
    const base = bases()[role];
    const response = await fetch(base + '/api/' + path, {
      method,
      headers:{'Content-Type':'application/json',Origin:base,...(jars[jar]?{Cookie:jars[jar]}:{}),...headers},
      body:body?JSON.stringify(body):undefined,
    });
    const cookie = response.headers.get('set-cookie');
    if(cookie) jars[jar]=cookie.split(';')[0];
    const binary = path.endsWith('.xlsx') || path.endsWith('backup');
    const data = binary && response.ok ? Buffer.from(await response.arrayBuffer()) : await response.json();
    return {status:response.status,data};
  }
  try {
    let catalog, visitorOrder, newItem;
    await t.test('catalog contains 120 products; private API rejects anonymous access', async () => {
      const result = await request('customer','catalog');
      assert.equal(result.status,200);catalog=result.data.products;assert.equal(catalog.length,120);
      assert.equal((await request('customer','customer/orders')).status,401);
      assert.equal((await request('admin','admin/state')).status,401);
      assert.equal((await request('customer','admin/state')).status,403);
      assert.equal((await request('admin','customer/login',{method:'POST',body:{profile:'demo-visitor'}})).status,403);
    });
    await t.test('independent admin password login and customer test session', async () => {
      assert.equal((await request('admin','admin/login',{method:'POST',body:{username:'hannah',password:'wrong'}})).status,401);
      assert.equal((await request('admin','admin/login',{method:'POST',body:{username:'hannah',password}})).status,200);
      assert.equal((await request('customer','customer/login',{method:'POST',body:{profile:'demo-visitor'}})).status,200);
      assert.equal((await request('admin','admin/state',{jar:'customer'})).status,401);
      assert.equal((await request('customer','customer/orders',{jar:'admin'})).status,401);
    });
    await t.test('cross-origin write and static path disclosure are rejected', async () => {
      assert.equal((await request('customer','customer/login',{method:'POST',body:{profile:'demo-visitor'},headers:{Origin:'https://other.invalid'}})).status,403);
      for(const path of ['/.local/admin-credentials.txt','/server/api.mjs','/../admin-web/app.js']){
        const response=await fetch(bases().customer+path);
        assert.equal(response.status,404);
        await response.text();
      }
    });
    const submission = {
      requestId:randomUUID(),name:'測試客戶',phone:'0900000000',
      items:[{variantId:catalog[20].variants[0].id,quantity:2,expectedPrice:catalog[20].variants[0].price}],
    };
    await t.test('invalid quantities and price tampering never create a preorder',async()=>{
      const zero=await request('customer','customer/preorders',{method:'POST',body:{...submission,items:[{...submission.items[0],quantity:0}]}});
      assert.equal(zero.status,400);
      const tamper=await request('customer','customer/preorders',{method:'POST',body:{...submission,items:[{...submission.items[0],expectedPrice:1}]}});
      assert.equal(tamper.status,409);
      assert.equal((await request('customer','customer/orders')).data.orders.length,0);
    });
    await t.test('successful submission is durable and replay is idempotent',async()=>{
      const first=await request('customer','customer/preorders',{method:'POST',body:submission});
      assert.equal(first.status,200);
      assert.match(first.data.code,/^KR26-/);
      const replay=await request('customer','customer/preorders',{method:'POST',body:submission});
      assert.deepEqual(replay.data,first.data);
      const orders=(await request('customer','customer/orders')).data.orders;
      assert.equal(orders.length,1);assert.equal(orders[0].quantity,2);
      visitorOrder=orders[0];newItem=orders[0].items[0];
      const changed=await request('customer','customer/preorders',{method:'POST',body:{...submission,items:[{...submission.items[0],quantity:3}]}});
      assert.equal(changed.status,409);
    });
    await t.test('a second customer cannot read or modify the first customer preorder',async()=>{
      await request('customer','customer/login',{method:'POST',jar:'other',body:{profile:'demo-anna'}});
      const orders=(await request('customer','customer/orders',{jar:'other'})).data.orders;
      assert.ok(orders.every(o=>o.customer_id==='demo-anna'));
      assert.equal((await request('customer','customer/items/'+newItem.id,{method:'PATCH',jar:'other',body:{quantity:5}})).status,404);
    });
    await t.test('same-variant additions merge; customer may adjust before cutoff',async()=>{
      await request('customer','customer/preorders',{method:'POST',body:{...submission,requestId:randomUUID(),items:[{...submission.items[0],quantity:1}]}});
      let orders=(await request('customer','customer/orders')).data.orders;
      assert.equal(orders.length,1);assert.equal(orders[0].quantity,3);
      assert.equal((await request('customer','customer/items/'+newItem.id,{method:'PATCH',body:{quantity:4}})).status,200);
      orders=(await request('customer','customer/orders')).data.orders;
      assert.equal(orders[0].quantity,4);
    });
    await t.test('report counts exactly match effective submitted item quantities',async()=>{
      const state=(await request('admin','admin/state')).data;
      const sum=state.orders.flatMap(o=>o.items).reduce((n,i)=>n+i.quantity,0);
      assert.equal(state.stats.quantity,sum);
      assert.equal(state.report.reduce((n,r)=>n+r.demand,0),sum);
      assert.equal(state.report.find(r=>r.variant_id===newItem.variant_id).demand,4);
    });
    await t.test('cancelled item quantities are excluded from buying reports',async()=>{
      const variant=catalog[22].variants[0];
      await request('customer','customer/preorders',{method:'POST',body:{...submission,requestId:randomUUID(),items:[{variantId:variant.id,quantity:3,expectedPrice:variant.price}]}});
      const order=(await request('customer','customer/orders')).data.orders[0];
      const item=order.items.find(i=>i.variant_id===variant.id);
      assert.equal((await request('customer','customer/items/'+item.id,{method:'PATCH',body:{quantity:0}})).status,200);
      const state=(await request('admin','admin/state')).data;
      assert.ok(!state.report.some(r=>r.variant_id===variant.id));
      assert.equal((await request('customer','customer/orders')).data.orders[0].quantity,4);
    });
    await t.test('close stops writes and creates a closing snapshot',async()=>{
      const campaign=(await request('admin','admin/state')).data.campaign;
      assert.equal((await request('admin','admin/campaign',{method:'PUT',body:{...campaign,status:'closed'}})).status,200);
      assert.equal((await request('customer','customer/preorders',{method:'POST',body:{...submission,requestId:randomUUID()}})).status,409);
      assert.equal((await request('customer','customer/items/'+newItem.id,{method:'PATCH',body:{quantity:1}})).status,409);
      assert.equal(app.store.get('SELECT COUNT(*) AS n FROM closing_snapshots').n,1);
      await request('admin','admin/campaign',{method:'PUT',body:campaign});
    });
    await t.test('purchase and shortage checks, manual allocation and stale edit protection',async()=>{
      const id=newItem.variant_id;
      assert.equal((await request('admin','admin/procurement/'+id,{method:'PUT',body:{bought:2,shortage:3,version:0}})).status,400);
      assert.equal((await request('admin','admin/procurement/'+id,{method:'PUT',body:{bought:2,shortage:1,version:0,note:'測試採購'}})).status,200);
      assert.equal((await request('admin','admin/procurement/'+id,{method:'PUT',body:{bought:1,shortage:0,version:0}})).status,409);
      assert.equal((await request('admin','admin/allocation',{method:'POST',body:{itemId:newItem.id,bought:3,shortage:0}})).status,400);
      assert.equal((await request('admin','admin/allocation',{method:'POST',body:{itemId:newItem.id,bought:2,shortage:1}})).status,200);
      const row=(await request('customer','customer/orders')).data.orders[0].items[0];
      assert.equal(row.bought,2);assert.equal(row.shortage,1);
      assert.equal((await request('admin','admin/procurement/'+id,{method:'PUT',body:{bought:1,shortage:0,version:1}})).status,409);
    });
    await t.test('product editing preserves previously submitted prices and names',async()=>{
      const product=catalog[20];
      assert.equal((await request('admin','admin/products',{method:'POST',body:{
        id:product.id,code:product.code,name:'改名後商品',category:product.category,price:990,extra:0,
        colors:'奶油白,燕麥棕,鼠尾草綠',sizes:'S,M,L,XL',kind:product.kind,tone:product.tone,
      }})).status,200);
      const old=(await request('customer','customer/orders')).data.orders[0].items[0];
      assert.equal(old.product_name,newItem.product_name);assert.equal(old.price,newItem.price);
      assert.equal((await request('customer','customer/preorders',{method:'POST',body:{...submission,requestId:randomUUID()}})).status,409);
    });
    await t.test('CSV is previewed and invalid imports do not partially write',async()=>{
      const before=app.store.get('SELECT COUNT(*) AS n FROM products').n;
      const bad='code,name,category,price,colors,sizes\nNEW1,測試商品,生活選物,500,白,標準\nSP001,重複商品,生活選物,500,白,標準';
      const preview=await request('admin','admin/import',{method:'POST',body:{csv:bad}});
      assert.equal(preview.data.errors.length,1);assert.equal(preview.data.errors[0].line,3);
      assert.equal((await request('admin','admin/import',{method:'POST',body:{csv:bad,commit:true}})).status,400);
      assert.equal(app.store.get('SELECT COUNT(*) AS n FROM products').n,before);
      const good='code,name,category,price,colors,sizes\nNEW1,測試商品,生活選物,500,白,標準';
      assert.equal((await request('admin','admin/import',{method:'POST',body:{csv:good,commit:true}})).status,200);
      assert.equal(app.store.get('SELECT COUNT(*) AS n FROM products').n,before+1);
    });
    await t.test('Excel and JSON exports contain business data but no credentials',async()=>{
      const xlsx=await request('admin','admin/export.xlsx');
      assert.equal(xlsx.status,200);assert.equal(xlsx.data.readUInt32LE(0),0x04034b50);
      assert.ok(xlsx.data.includes(Buffer.from('客戶預購明細')));
      assert.ok(xlsx.data.includes(Buffer.from('採買彙總')));
      const backup=await request('admin','admin/backup');
      const text=backup.data.toString();assert.ok(text.includes(visitorOrder.code));assert.ok(!text.includes(password));
      const tables=JSON.parse(text).tables;assert.ok(!tables.admin);assert.ok(!tables.sessions);
    });
    await t.test('catalog supports 200 products with validated bulk import',async()=>{
      const rows=Array.from({length:79},(_,i)=>`LOAD${i+1},批次測試商品${i+1},測試分類,500,奶油白,標準`);
      const csv=['code,name,category,price,colors,sizes',...rows].join('\n');
      assert.equal((await request('admin','admin/import',{method:'POST',body:{csv,commit:true}})).status,200);
      assert.equal((await request('customer','catalog')).data.products.length,200);
    });
    await t.test('eight photos and optional bindings persist without changing variants',async()=>{
      const product=catalog[0],images=Array.from({length:8},(_,i)=>`/uploads/${String(i).padStart(24,'0')}.png`);
      const payload={id:product.id,code:product.code,name:product.name,category:product.category,price:590,extra:0,colors:'白,棕',sizes:'S,M',kind:product.kind,tone:product.tone,images};
      assert.equal((await request('admin','admin/products',{method:'POST',body:payload})).status,200);
      let saved=(await request('admin','admin/state')).data.products.find(p=>p.id===product.id);
      assert.deepEqual(saved.images,images);assert.deepEqual(saved.imageBindings,[]);
      const imageBindings=[{color:'棕',url:images[7]}];
      assert.equal((await request('admin','admin/products',{method:'POST',body:{...payload,images:[...images].reverse(),imageBindings}})).status,200);
      saved=(await request('customer','catalog')).data.products.find(p=>p.id===product.id);
      assert.equal(saved.images[0],images[7]);assert.deepEqual(saved.imageBindings,imageBindings);
      assert.equal(saved.variants.length,4);
      assert.equal((await request('admin','admin/products',{method:'POST',body:{...payload,imageBindings:[{color:'黑',url:images[0]}]}})).status,400);
      assert.equal((await request('admin','admin/products',{method:'POST',body:{...payload,images:[...images,images[0]]}})).status,400);
    });
    await t.test('data and login survive local server restart',async()=>{
      await app.close();
      app=await startApp({directory,customerPort:0,adminPort:0,password,quiet:true,seed:true});
      assert.equal((await request('customer','customer/orders')).data.orders[0].quantity,4);
      assert.equal((await request('admin','admin/state')).data.products.length,200);
      assert.equal((await request('admin','admin/state')).data.products.find(p=>p.id===catalog[0].id).imageBindings[0].color,'棕');
      const credentials=await readFile(join(directory,'admin-credentials.txt'),'utf8');
      assert.ok(credentials.includes(password));
    });
    await t.test('changing the unique owner password revokes old admin sessions',async()=>{
      const changed=await request('admin','admin/password',{method:'POST',body:{current:password,password:randomUUID()+'new-password'}});
      assert.equal(changed.status,200);
      assert.equal((await request('admin','admin/state')).status,401);
      assert.equal((await request('admin','admin/login',{method:'POST',body:{username:'hannah',password}})).status,401);
    });
  }finally{
    await app.close();
    await rm(directory,{recursive:true,force:true});
  }
});
