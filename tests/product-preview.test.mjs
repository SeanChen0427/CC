import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { productShareLink } from '../shared/product-link.js';
import { lineContactMessage, lineContactURL } from '../shared/line-contact.js';
import { productPreview, previewProductId } from '../domain/product-preview.mjs';
import { previewResponse } from '../services/product-preview/preview.mjs';
import { startApp } from '../server/index.mjs';

const settings = {apiURL:'https://backend.test/functions/v1/ccbaby-api',publishableKey:'public-test-key',customerURL:'https://shop.test/?code=private#orders',productPreviewURL:'https://preview.test/'};
const prefix = 'https://backend.test/storage/v1/object/public/ccbaby-products/';
const product = {id:9,code:'GD09',name:'泰迪熊外套',active:true,images:[prefix+'abc-def.gif'],sourceUrl:'https://private.test',cost:{value:999},customer:'private'};

test('share links carry only product identity and cover revision, with legacy/local fallback', () => {
  const link = productShareLink(settings.customerURL,product,settings.productPreviewURL);
  assert.match(link,/^https:\/\/preview.test\/p\/9\?v=[a-z0-9]+$/);
  assert.equal(productShareLink(settings.customerURL,product), 'https://shop.test/#product/9');
  assert.equal(productShareLink(settings.customerURL,{...product,cost:'changed',sourceUrl:'changed'},settings.productPreviewURL),link);
  for (const changed of [{...product,name:'新名稱'},{...product,images:[prefix+'other.jpg']}]) assert.notEqual(productShareLink(settings.customerURL,changed,settings.productPreviewURL),link);
  assert.doesNotMatch(link,/code=|private|customer|cost/);
  assert.throws(()=>productShareLink(settings.customerURL,product,'https://user:password@evil.test/'));
  assert.throws(()=>productShareLink(settings.customerURL,product,'javascript:alert(1)'));
  const context={product,productURL:link};
  const draft=lineContactMessage(null,context);
  assert.equal(draft.split('\n').filter(line=>line.startsWith('https://')).length,1);
  assert.match(draft,/GD09 泰迪熊外套/);
  assert.equal(decodeURIComponent(lineContactURL(null,context).split('/?')[1]),draft);
  assert.doesNotMatch(lineContactMessage(null,{order:{code:'TEST'},...context}),/preview.test/);
});

test('public projection has exactly four fields, excludes inactive products, and validates image locations', () => {
  assert.deepEqual(productPreview([product],9,prefix),{id:9,code:'GD09',name:'泰迪熊外套',image:prefix+'abc-def.gif'});
  for(const image of ['https://evil.test/image.jpg',prefix+'../secret.jpg',prefix+'abc.jpg?token=secret','data:image/png;base64,AA']) assert.equal(productPreview([{...product,images:[image]}],9,prefix).image,null);
  assert.equal(productPreview([{...product,images:[]}],9,prefix).image,null);
  assert.throws(()=>productPreview([{...product,active:false}],9,prefix),e=>e.status===404);
  for(const value of ['0','01','-1','9.5','9/extra','9007199254740992','9\n']) assert.throws(()=>previewProductId(value),e=>e.status===404);
  assert.equal(previewProductId('9'),9);
});

test('preview provides escaped OGP before JavaScript, redirects people to original dialog, and never renders private fields',async()=>{
  const link=productShareLink(settings.customerURL,product,settings.productPreviewURL);
  let fetched;
  const response=await previewResponse(new Request(link),settings,async(url,options)=>{fetched={url,options};return Response.json({...product,image:product.images[0],name:'外套 "><script>bad</script>'});});
  const html=await response.text();
  assert.equal(response.status,200);assert.match(response.headers.get('content-type'),/text\/html/);
  assert.equal(fetched.url,settings.apiURL+'/public/product-preview/9');
  assert.deepEqual(fetched.options.headers,{apikey:'public-test-key'});
  assert.match(html,/<meta property="og:image" content="https:\/\/backend.test\/storage/);
  assert.match(html,/&quot;&gt;&lt;script&gt;bad&lt;\/script&gt;/);
  assert.match(html,/href="https:\/\/shop.test\/#product\/9"/);
  assert.match(html,/<script src="\/open.js" defer><\/script>/);
  assert.doesNotMatch(html,/private|cost|customer|<script>bad|code=/);
  assert.match(response.headers.get('content-security-policy'),/script-src 'self'/);
  assert.match(response.headers.get('x-robots-tag'),/noindex/);
  const head=await previewResponse(new Request(link,{method:'HEAD'}),settings,async()=>Response.json({...product,image:product.images[0]}));
  assert.equal(head.status,200);assert.equal(await head.text(),'');
  const noImage=await previewResponse(new Request(link),settings,async()=>Response.json({...product,image:'https://evil.test/secret.jpg'}));
  assert.doesNotMatch(await noImage.text(),/og:image|evil.test/);
});

test('invalid, hidden, failed, and rewritten preview requests are bounded and do not leak errors or allow open redirects',async()=>{
  let calls=0;const missing=async()=>{calls++;return Response.json({error:'private'},{status:404});};
  for(const path of ['/p/0','/p/09','/p/9/extra','/p/9007199254740992']){
    const r=await previewResponse(new Request('https://preview.test'+path),settings,missing);assert.equal(r.status,404);assert.doesNotMatch(await r.text(),/og:image|og:title|private/);
  }
  assert.equal(calls,0);
  assert.equal((await previewResponse(new Request('https://preview.test/p/9',{method:'POST'}),settings,missing)).status,405);
  const hidden=await previewResponse(new Request('https://preview.test/p/9'),settings,missing);assert.equal(hidden.status,404);assert.match(await hidden.text(),/#shop/);
  const unavailable=await previewResponse(new Request('https://preview.test/p/9'),settings,async()=>new Response('private',{status:503}));assert.equal(unavailable.status,503);assert.doesNotMatch(await unavailable.text(),/private|open.js/);
  const rewritten=await previewResponse(new Request('https://preview.test/api/product?id=9&next=https://evil.test'),settings,async()=>Response.json({...product,image:null}));assert.equal(rewritten.status,200);assert.doesNotMatch(await rewritten.text(),/evil.test/);
});

test('local anonymous preview reads current cover and name without creating sessions or altering business data',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'ccbaby-preview-'));
  const app=await startApp({directory,customerPort:0,adminPort:0,seed:true,password:'fixture-only',quiet:true});
  try{
    const before=app.store.get('SELECT COUNT(*) AS n FROM sessions').n;
    const product=app.store.catalog()[0];
    const response=await fetch('http://127.0.0.1:'+app.customerPort+'/api/public/product-preview/'+product.id);
    assert.equal(response.status,200);assert.deepEqual(Object.keys(await response.json()).sort(),['code','id','image','name']);
    app.store.run('UPDATE products SET name=? WHERE id=?','更新名稱',product.id);
    const updated=await fetch('http://127.0.0.1:'+app.customerPort+'/api/public/product-preview/'+product.id);assert.equal((await updated.json()).name,'更新名稱');
    app.store.run('UPDATE products SET active=0 WHERE id=?',product.id);
    assert.equal((await fetch('http://127.0.0.1:'+app.customerPort+'/api/public/product-preview/'+product.id)).status,404);
    assert.equal(app.store.get('SELECT COUNT(*) AS n FROM sessions').n,before);
  }finally{await app.close();await rm(directory,{recursive:true,force:true});}
});
