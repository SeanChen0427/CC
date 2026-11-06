import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyState, operate, upsertCustomer, report, orders } from '../cloud/core.mjs';

const owner={role:'admin',subject:'owner'}, anna={role:'customer',subject:'line:a'}, bob={role:'customer',subject:'line:b'};
const product={code:'TEST1',name:'測試選物',category:'衣著',kind:'vest',tone:'#b9a38b',price:590,colors:'奶油白',sizes:'S,M,XL',extra:50};
const imagePrefix='https://example.supabase.co/storage/v1/object/public/ccbaby-products/';
function fixture(){const s=emptyState();operate(s,'admin/products','POST',product,owner,imagePrefix);s.campaign.status='open';s.campaign.closesAt=new Date(Date.now()+86400000).toISOString();upsertCustomer(s,{id:anna.subject,display_name:'A'});upsertCustomer(s,{id:bob.subject,display_name:'B'});return s;}
const submit=(s,user=anna,extra={})=>operate(s,'customer/preorders','POST',{requestId:crypto.randomUUID(),name:'測試',phone:'0912345678',items:[{variantId:1,quantity:2,expectedPrice:590}],...extra},user,imagePrefix);
test('production store starts empty and closed',()=>{const s=emptyState();assert.equal(s.campaign.status,'draft');assert.deepEqual(s.products,[]);assert.deepEqual(s.customers,[]);assert.throws(()=>operate(s,'admin/state','GET',{},null),e=>e.status===401);});
test('product catalog requires a customer session and rejects anonymous or admin sessions',()=>{
  const s=fixture();
  for(const session of [null,owner])assert.throws(()=>operate(s,'catalog','GET',{},session),e=>e.status===401);
  assert.equal(operate(s,'catalog','GET',{},anna).products.length,1);
});
test('customer sessions cannot read or mutate admin routes',()=>{const s=fixture();assert.throws(()=>operate(s,'admin/state','GET',{},anna),e=>e.status===401);assert.throws(()=>operate(s,'admin/products','POST',product,anna),e=>e.status===401);});
test('creating categories preserves every legacy product, variant and preorder field',()=>{
  const s=fixture();delete s.categories;submit(s);
  s.products[0].images=[imagePrefix+'abc-1.png'];s.products[0].imageBindings=[{color:'奶油白',url:s.products[0].images[0]}];
  const protectedKeys=['products','variants','customers','preorders','items','procurement','submissions','closing_snapshots','campaign'];
  const protectedData=Object.fromEntries(protectedKeys.map(key=>[key,structuredClone(s[key])]));
  assert.deepEqual(operate(s,'admin/state','GET',{},owner).categories,['衣著']);
  assert.equal(s.categories,undefined);
  operate(s,'admin/categories','POST',{name:'  玩具  '},owner);
  assert.deepEqual(s.categories,['衣著','玩具']);
  assert.deepEqual(operate(s,'catalog','GET',{},anna).categories,['衣著','玩具']);
  for(const key of protectedKeys)assert.deepEqual(s[key],protectedData[key],key+' must stay identical');
  for(const [body,status] of [[{name:'衣著'},409],[{name:'玩具'},409],[{name:''},400],[{name:'全部選物'},400],[{name:'長'.repeat(31)},400]]){
    const before=structuredClone(s);assert.throws(()=>operate(s,'admin/categories','POST',body,owner),error=>error.status===status);assert.deepEqual(s,before);
  }
  assert.throws(()=>operate(s,'admin/categories','POST',{name:'拒絕'},anna),error=>error.status===401);
  assert.throws(()=>operate(s,'admin/categories','POST',{name:'拒絕'},null),error=>error.status===401);
});
test('preorders are isolated, additive and idempotent',()=>{const s=fixture();submit(s,anna,{requestId:'a'});submit(s,anna,{requestId:'a'});assert.equal(s.items[0].quantity,2);assert.throws(()=>submit(s,anna,{requestId:'a',name:'別名'}),e=>e.status===409);submit(s);assert.equal(s.items[0].quantity,4);assert.equal(orders(s,bob.subject).length,0);assert.throws(()=>operate(s,'customer/items/1','PATCH',{quantity:0},bob),e=>e.status===404);});
test('product price snapshots are immutable and stale cart prices rejected',()=>{const s=fixture();submit(s);operate(s,'admin/products','POST',{...product,id:1,price:690},owner,imagePrefix);assert.equal(s.items[0].price,590);assert.throws(()=>submit(s),e=>e.status===409);submit(s,anna,{items:[{variantId:1,quantity:1,expectedPrice:690}]});assert.equal(s.items.length,2);assert.equal(report(s)[0].demand,3);assert.equal(orders(s)[0].total,1870);});
test('custom 2XL and larger surcharges keep variant IDs and historical preorder prices',()=>{
  const s=fixture();submit(s);const before=s.variants.find(v=>v.size==='S').id;
  const sizeSurcharges=[{size:'2XL',extra:50},{size:'3XL',extra:100},{size:'4XL',extra:150}];
  operate(s,'admin/products','POST',{...product,id:1,sizes:'S,XL,2XL,3XL,4XL',price:590,sizeSurcharges},owner,imagePrefix);
  assert.deepEqual(s.variants.filter(v=>v.active).map(v=>[v.size,v.price]),[['S',590],['XL',590],['2XL',640],['3XL',690],['4XL',740]]);
  assert.equal(s.variants.find(v=>v.size==='S').id,before);assert.equal(s.items[0].price,590);
  assert.equal(s.products[0].basePrice,590);assert.deepEqual(s.products[0].sizeSurcharges,sizeSurcharges);
});
test('canceled items do not count toward procurement',()=>{const s=fixture();submit(s);operate(s,'customer/items/1','PATCH',{quantity:0},anna);assert.equal(report(s).length,0);assert.equal(orders(s)[0].quantity,0);});
test('procurement detects stale writes and prevents allocation overflow',()=>{const s=fixture();submit(s);operate(s,'admin/procurement/1','PUT',{version:0,bought:1,shortage:1},owner);assert.throws(()=>operate(s,'admin/procurement/1','PUT',{version:0,bought:2,shortage:0},owner),e=>e.status===409);assert.throws(()=>operate(s,'admin/allocation','POST',{itemId:1,bought:2,shortage:0},owner));operate(s,'admin/allocation','POST',{itemId:1,bought:1,shortage:1},owner);assert.equal(report(s)[0].remaining,0);assert.equal(report(s)[0].unallocated,0);assert.throws(()=>operate(s,'admin/procurement/1','PUT',{version:1,bought:0,shortage:1},owner),e=>e.status===409);assert.throws(()=>operate(s,'customer/items/1','PATCH',{quantity:0},anna),e=>e.status===409);});
test('closing freezes orders and creates a procurement snapshot',()=>{const s=fixture();submit(s);operate(s,'admin/campaign','PUT',{name:'年度團',status:'closed',closesAt:new Date().toISOString()},owner);assert.equal(s.closing_snapshots.length,1);assert.throws(()=>submit(s),e=>e.status===409);assert.throws(()=>operate(s,'customer/items/1','PATCH',{quantity:1},anna),e=>e.status===409);});
test('invalid CSV is rejected before any item is committed',()=>{const s=emptyState();const csv='code,name,category,price,colors,sizes\nA,一,衣著,590,白,S\nB,二,衣著,錯誤,白,S';const before=structuredClone(s);assert.equal(operate(s,'admin/import','POST',{csv},owner).errors.length,1);assert.throws(()=>operate(s,'admin/import','POST',{csv,commit:true},owner));assert.deepEqual(s,before);});
test('200-product import preserves variants and category counts',()=>{const s=emptyState();const csv='code,name,category,price,colors,sizes\n'+Array.from({length:200},(_,i)=>`CC${i},商品${i},分類${i%5},500,白,S`).join('\n');operate(s,'admin/import','POST',{csv,commit:true},owner);assert.equal(s.products.length,200);assert.equal(s.variants.length,200);assert.equal(new Set(s.products.map(p=>p.category)).size,5);});
test('only this project product image URLs are accepted',()=>{const s=emptyState();for(const url of ['javascript:alert(1)','https://evil.test/x.png',imagePrefix+'../x.png',imagePrefix+'x.svg'])assert.throws(()=>operate(s,'admin/products','POST',{...product,images:[url]},owner,imagePrefix));operate(s,'admin/products','POST',{...product,images:[imagePrefix+'abc-123.png']},owner,imagePrefix);assert.equal(s.products.length,1);});

test('eight ordered photos are independent of colors, with validated optional bindings',()=>{
  const s=emptyState(),images=Array.from({length:8},(_,i)=>imagePrefix+`abc-${i}.png`);
  operate(s,'admin/products','POST',{...product,images},owner,imagePrefix);
  assert.deepEqual(s.products[0].images,images);assert.deepEqual(s.products[0].imageBindings,[]);
  const imageBindings=[{color:'奶油白',url:images[6]}],reordered=[...images].reverse();
  operate(s,'admin/products','POST',{...product,id:1,images:reordered,imageBindings},owner,imagePrefix);
  assert.deepEqual(s.products[0].images,reordered);assert.deepEqual(s.products[0].imageBindings,imageBindings);
  for(const invalid of [[{color:'不存在',url:images[0]}],[{color:'奶油白',url:imagePrefix+'abc-99.png'}],[...imageBindings,...imageBindings]]){
    assert.throws(()=>operate(structuredClone(s),'admin/products','POST',{...product,id:1,images,imageBindings:invalid},owner,imagePrefix));
  }
  assert.throws(()=>operate(structuredClone(s),'admin/products','POST',{...product,id:1,images:[...images,images[0]]},owner,imagePrefix));
  operate(s,'admin/products','POST',{...product,id:1,images:reordered,imageBindings:[]},owner,imagePrefix);
  assert.deepEqual(s.products[0].imageBindings,[]);
});
