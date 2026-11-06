import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyState, operate } from '../cloud/core.mjs';
import { openStore } from '../server/store.mjs';
import { api } from '../server/api.mjs';
import { csvRows } from '../domain/validation.mjs';
import { productCsv, productSheets, productTable, previewProductImport, templateProducts } from '../domain/product-transfer.mjs';
import { thumbnail } from './fixtures/product-thumbnail.mjs';
import { validateProduct } from '../cloud/core.mjs';

const owner = {role:'admin',subject:'owner'}, customer = {role:'customer',subject:'customer'};
for (const engine of ['cloud','sqlite']) test(`${engine}: exported products preserve pricing, photos, status and text when copied to new codes`,async () => {
  const state = engine === 'cloud' ? emptyState() : null;
  const store = state ? null : openStore(':memory:',{password:'fixture-only'});
  const prefix = state ? 'https://example.test/photos/' : '/uploads/';
  const image = prefix + 'a'.repeat(24) + '.jpg';
  const run = async (path,method='GET',body={},session=owner) => state ? operate(state,path,method,body,session,prefix) : api({store,req:{},role:session?.role || 'admin',path:'/api/'+path,method,body,session});
  try {
    await run('admin/products','POST',{code:'ORIGINAL',name:'=商品,"原名"',category:'測試',description:'第一行\n第二行,"說明"',price:590,colors:'白,黑',sizes:'S,2XL,3XL',sizeSurcharges:[{size:'2XL',extra:50},{size:'3XL',extra:100}],active:false,kind:'vest',tone:'#b9a38b',images:[image],imageBindings:[{color:'黑',url:image}],costUpdate:{cost:{unitKrw:10000,exchangeRate:.024},defaultExchangeRate:.024,versions:[]}});
    // Remove an old size. Export only current variants while retaining history internally.
    let admin = await run('admin/state');
    await run('admin/products','POST',{id:1,code:'ORIGINAL',name:admin.products[0].name,category:'測試',description:admin.products[0].description,price:590,colors:'白,黑',sizes:'S,2XL',sizeSurcharges:[{size:'2XL',extra:50}],active:false,kind:'vest',tone:'#b9a38b',images:[image],imageBindings:[{color:'黑',url:image}]});
    await run('admin/products','POST',{code:'OTHER',name:"'保留單引號",category:'別類',price:100,colors:'原色',sizes:'單一',kind:'bag'});
    admin = await run('admin/state');
    const before = admin, csv = productCsv(admin.products), sheets = productSheets(admin.products);
    assert.ok(csv.startsWith('\uFEFF'));assert.match(csv,/'=商品/);assert.doesNotMatch(csv,/extra:3XL/);
    assert.equal(csvRows(csv).length,3);
    assert.deepEqual(sheets.map(s=>s.name),['商品清單','匯入底稿','欄位說明','規格進價']);
    assert.equal(sheets[0].rows.length,3);
    assert.equal(sheets[3].rows.length,6);assert.deepEqual(sheets[3].rows[1].slice(6,9),[10000,.024,240]);
    assert.doesNotMatch(csv, /unitKrw|costVersion|fixture-only|customer/);
    const duplicated = await run('admin/import','POST',{csv});
    assert.equal(duplicated.errors.length,2);
    await assert.rejects(()=>run('admin/import','POST',{csv,commit:true}));
    assert.deepEqual(await run('admin/state'),before);
    const copied = csv.replace('ORIGINAL','COPY1').replace('OTHER','COPY2');
    assert.equal((await run('admin/import','POST',{csv:copied})).errors.length,0);
    assert.deepEqual(await run('admin/state'),before); // Preview and export are read only.
    await run('admin/import','POST',{csv:copied,commit:true});
    admin = await run('admin/state');
    for (const [oldCode,newCode] of [['ORIGINAL','COPY1'],['OTHER','COPY2']]) {
      const original = admin.products.find(p=>p.code===oldCode), copy = admin.products.find(p=>p.code===newCode);
      assert.deepEqual(productTable([copy])[1].slice(1),productTable([original])[1].slice(1));
      assert.deepEqual(copy.variants.filter(v=>v.active).map(v=>[v.color,v.size,v.price]),original.variants.filter(v=>v.active).map(v=>[v.color,v.size,v.price]));
      assert.ok(copy.variants.every(v=>!v.cost));
    }
    await assert.rejects(()=>run('admin/import','POST',{csv:copied},customer));
    if (store) {
      for (const path of ['admin/products.csv','admin/products.xlsx','admin/products-template.csv']) {
        await assert.rejects(()=>run(path,'GET',{},null));
        const output = path.endsWith('.xlsx') ? await run(path,'POST',{thumbnails:(await run('admin/state')).products.filter(p=>p.images[0]).map(p=>({productId:p.id,url:p.images[0],data:thumbnail}))}) : await run(path);
        assert.ok(output.buffer.length>0);
        assert.equal(output.buffer.toString().includes('fixture-only'),false);
      }
      await assert.rejects(()=>run('admin/products.xlsx'),e=>e.status===409);
    }
  } finally {store?.db.close();}
});

test('CSV validates optional columns and refuses malformed rows before commit', () => {
  const preview = csv => previewProductImport(csv,p=>validateProduct(p,'https://example.test/photos/'),()=>false);
  assert.equal(preview(productCsv(templateProducts)).errors.length,0);
  const header = 'code,name,category,price,colors,sizes';
  for (const [column,value] of [['active','maybe'],['extra:不存在','50'],['extra:S','-1'],['extra:S','1.5'],['images','{}'],['imageBindings','{}'],['images','broken']]) {
    assert.equal(preview(header+','+column+'\nA,商品,分類,590,白,S,'+value).errors.length,1,column);
  }
  assert.throws(()=>preview(header+',price\nA,商品,分類,590,白,S,100'),/重複/);
  assert.throws(()=>preview(header+',cost\nA,商品,分類,590,白,S,100'),/無法辨識/);
  assert.throws(()=>preview(header),/至少/);
  assert.equal(preview(header+'\nA,商品,分類,590,白,S,多餘欄').errors.length,1);
  const rows = preview(header+',extra\nA,商品,分類,590,白,2XL,50');
  assert.equal(validateProduct(rows.products[0]).sizeSurcharges[0].extra,50); // Previous templates remain compatible.
  for (const name of ["'原字","'=原字",'-商品','@商品','+商品']) {
    const p = {...templateProducts[0],name};
    assert.equal(preview(productCsv([p])).products[0].name,name);
  }
});
