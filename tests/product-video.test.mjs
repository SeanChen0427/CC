import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { youtubeVideo } from '../shared/youtube.js';
import { productVideoUrl, productVideoLayout } from '../domain/validation.mjs';
import { emptyState, operate, upsertCustomer } from '../cloud/core.mjs';
import { openStore } from '../server/store.mjs';
import { api } from '../server/api.mjs';
import { productCsv, productSheets } from '../domain/product-transfer.mjs';
import { productWorkbook } from '../server/product-workbook.mjs';

const owner={role:'admin',subject:'owner'},customer={role:'customer',subject:'video-person'};
const id='M7lc1UVf-VE',shorts=`https://www.youtube.com/shorts/${id}`,watch=`https://www.youtube.com/watch?v=${id}`;
const product={code:'VIDEO1',name:'現場影片商品',category:'衣著',kind:'vest',price:590,colors:'白,黑',sizes:'S,2XL',sizeSurcharges:[{size:'2XL',extra:50}]};

test('YouTube links normalize IDs and strip sharing parameters before constructing a trusted embed',()=>{
  for(const [url,canonical] of [[shorts+'?si=share',shorts],[' '+shorts+' ',shorts],[`https://youtube.com/shorts/${id}/`,shorts],[`https://youtu.be/${id}?si=share&t=10`,watch],[`https://m.youtube.com/watch?feature=share&v=${id}`,watch],[`https://www.youtube.com/embed/${id}`,watch],[`https://www.youtube-nocookie.com/embed/${id}`,watch]]){
    const video=youtubeVideo(url);assert.equal(video.id,id);assert.equal(video.url,canonical);assert.equal(productVideoUrl(url),canonical);
    assert.equal(new URL(video.embedUrl).hostname,'www.youtube-nocookie.com');assert.ok(!video.embedUrl.includes('share'));
  }
  assert.equal(productVideoUrl(undefined),undefined);assert.equal(productVideoUrl('  '),'');
  assert.equal(productVideoLayout(undefined),undefined);assert.equal(productVideoLayout('vertical'),'vertical');assert.equal(productVideoLayout('horizontal'),'horizontal');
});

const invalid=[null,{},12,'javascript:alert(1)','http://youtu.be/'+id,'https:youtube.com/shorts/'+id,'https://youtube.com.evil.test/shorts/'+id,'https://evil.test/?next=https://youtube.com/shorts/'+id,'https://user:pass@youtube.com/shorts/'+id,'https://youtube.com:444/shorts/'+id,'https://youtube.com/shorts/short','https://youtube.com/watch?v='+id+'&v='+id,'https://youtube.com/shorts/'+id+'/extra','https://youtu.be/'+id+'\nmore','https://youtube.com\\@evil.test/shorts/'+id,'https://youtube.com/@channel','https://youtu.be/'+id+'?q='+'a'.repeat(2048)];
test('unsupported, deceptive and malformed URLs or layouts are rejected',()=>{
  for(const value of invalid){assert.equal(youtubeVideo(value),null,String(value));assert.throws(()=>productVideoUrl(value));}
  for(const value of ['',null,'9:16','<iframe>',{}])assert.throws(()=>productVideoLayout(value));
});

for(const engine of ['cloud','sqlite'])test(`${engine}: video metadata persists and exports without exposing purchase sources or altering preorder snapshots`,async()=>{
  const state=engine==='cloud'?emptyState():null,store=state?null:openStore(':memory:',{password:'fixture-only'});
  const run=async(path,method='GET',body={},session=owner)=>state?operate(state,path,method,body,session):api({store,req:{},role:session?.role||'admin',path:'/api/'+path,method,body,session});
  try{
    await run('admin/products','POST',product);
    if(state){const before=JSON.stringify(state);const read=await run('admin/state');assert.equal(read.products[0].videoUrl,'');assert.equal(JSON.stringify(state),before);}
    await run('admin/campaign','PUT',{name:'影片測試',status:'open',closesAt:new Date(Date.now()+86400000).toISOString()});
    if(state)upsertCustomer(state,{id:customer.subject,display_name:'測試'});else store.run('INSERT INTO customers(id,display_name) VALUES(?,?)',customer.subject,'測試');
    await run('customer/preorders','POST',{requestId:crypto.randomUUID(),name:'測試',phone:'0912345678',items:[{variantId:1,quantity:1,expectedPrice:590}]},customer);
    const original=await run('admin/state'),orders=JSON.stringify(original.orders),variants=original.products[0].variants;
    await run('admin/products','POST',{...product,id:1,sourceUrl:'https://private.example/purchase',videoUrl:shorts+'?si=share',videoLayout:'horizontal'});
    let admin=await run('admin/state');assert.equal(admin.products[0].videoUrl,shorts);assert.equal(admin.products[0].videoLayout,'horizontal');
    assert.equal(JSON.stringify(admin.orders),orders);assert.deepEqual(admin.products[0].variants,variants);
    const catalog=await run('catalog','GET',{},customer);assert.equal(catalog.products[0].videoUrl,shorts);assert.equal(catalog.products[0].videoLayout,'horizontal');assert.doesNotMatch(JSON.stringify(catalog),/sourceUrl|private.example|costVersion/);
    if(state)assert.equal((await run('customer/bootstrap','GET',{},customer)).catalog.products[0].videoUrl,shorts);
    await assert.rejects(()=>run('admin/products','POST',{...product,id:1,videoUrl:watch},customer));
    await assert.rejects(()=>run('catalog','GET',{},null));
    await run('admin/products','POST',{...product,id:1}); // Older clients preserve both new fields.
    admin=await run('admin/state');assert.equal(admin.products[0].videoUrl,shorts);assert.equal(admin.products[0].videoLayout,'horizontal');
    const csv=productCsv(admin.products).replace('VIDEO1','VIDEOCOPY');
    assert.equal((await run('admin/import','POST',{csv})).errors.length,0);await run('admin/import','POST',{csv,commit:true});
    admin=await run('admin/state');const copy=admin.products.find(p=>p.code==='VIDEOCOPY');assert.equal(copy.videoUrl,shorts);assert.equal(copy.videoLayout,'horizontal');
    const sheets=productSheets(admin.products);assert.equal(sheets[0].rows[1][13],shorts);assert.equal(sheets[0].rows[1][14],'橫式');assert.ok(sheets[0].links.some(link=>link.col===13&&link.url===shorts));
    const file=productWorkbook(admin.products);assert.ok(file.includes(Buffer.from('<hyperlink ref="N2"')));assert.ok(file.includes(Buffer.from(shorts)));
    for(const videoUrl of invalid){const before=JSON.stringify(await run('admin/state'));await assert.rejects(()=>run('admin/products','POST',{...product,id:1,videoUrl}));assert.equal(JSON.stringify(await run('admin/state')),before);}
    await run('admin/products','POST',{...product,id:1,videoUrl:''});assert.equal((await run('admin/state')).products[0].videoUrl,'');
    assert.equal(JSON.stringify((await run('admin/state')).orders),orders);
  }finally{store?.db.close();}
});

test('legacy SQLite adds empty video fields without touching existing data and persists new values across restart',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'ccbaby-video-')),filename=join(directory,'data.sqlite');let store=openStore(filename,{password:'fixture-only'});
  const save=body=>api({store,req:{},role:'admin',path:'/api/admin/products',method:'POST',session:owner,body});
  try{
    await save(product);const before=store.catalog(true)[0];store.db.exec('ALTER TABLE products DROP COLUMN video_url');store.db.exec('ALTER TABLE products DROP COLUMN video_layout');store.db.close();store=openStore(filename);
    assert.deepEqual(store.catalog(true)[0],before);await save({...product,id:1,videoUrl:shorts,videoLayout:'horizontal'});store.db.close();store=openStore(filename);
    assert.equal(store.catalog(true)[0].videoUrl,shorts);assert.equal(store.catalog(true)[0].videoLayout,'horizontal');assert.deepEqual(store.catalog(true)[0].variants,before.variants);
    const backup=await api({store,req:{},role:'admin',path:'/api/admin/backup',method:'GET',session:owner});assert.equal(JSON.parse(backup.buffer).tables.products[0].video_url,shorts);
  }finally{store.db.close();await rm(directory,{recursive:true,force:true});}
});
