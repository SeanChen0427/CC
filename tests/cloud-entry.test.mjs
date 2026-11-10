import test, { after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { emptyState, upsertCustomer } from '../cloud/core.mjs';
import { productGifData, productGifOfSize } from './fixtures/product-gif.mjs';

// Exercise the actual Edge handler with isolated LINE/PostgREST responses.
// No network request or real session is created by this test.
const originalFetch=globalThis.fetch,originalDeno=globalThis.Deno;
const env={SUPABASE_URL:'https://backend.test',SUPABASE_SERVICE_ROLE_KEY:'test-service',LINE_CHANNEL_ID:'test-channel',LINE_CHANNEL_SECRET:'test-secret'};
let handler,s,events,sessions,failStartup,nonce,revision,commitConflict,uploaded,controlResult,controlCall;
const digest=value=>createHash('sha256').update(value).digest('hex');
globalThis.Deno={env:{get:key=>env[key]},serve:fn=>{handler=fn;}};
globalThis.fetch=async(url,options={})=>{
  const path=new URL(url).pathname,body=options.body?JSON.parse(String(options.body).startsWith('{')?options.body:'{}'):{};
  events.push(path);
  if(path==='/rest/v1/rpc/ccbaby_browsing_manage'){controlCall=body;return Response.json(controlResult);}
  if(path==='/rest/v1/rpc/ccbaby_browsing_read')return Response.json({metrics:[],events:[],interests:[],controls:[{customerId:'fixture-person',excluded:true,version:4,recordCount:2}]});
  if(path.startsWith('/storage/v1/object/ccbaby-products/')){uploaded={path,type:options.headers['Content-Type'],bytes:Buffer.from(options.body)};return Response.json({Key:path});}
  if(path==='/oauth2/v2.1/token')return Response.json({id_token:'test-id-token'});
  if(path==='/oauth2/v2.1/verify')return Response.json({sub:'test-person',name:'Verified member',nonce,aud:'test-channel',iss:'https://access.line.me'});
  if(path==='/rest/v1/rpc/ccbaby_line_customer'){upsertCustomer(s,{id:body.p_id,display_name:body.p_name});return Response.json(null);}
  if(path==='/rest/v1/rpc/ccbaby_session_create'){sessions.set(body.p_hash,{role:body.p_role,subject:body.p_subject});return Response.json(null);}
  if(path==='/rest/v1/rpc/ccbaby_load'){
    if(failStartup)return Response.json({error:'temporary'}, {status:503});
    const found=sessions.get(body.p_hash),session=found?.role===body.p_role?found:null;
    return Response.json({data:s,session,revision,owner_id:'test-owner'});
  }
  if(path==='/rest/v1/rpc/ccbaby_commit'){
    if(commitConflict){
      if(commitConflict==='promotion')s.promotion={version:1,enabled:true,text:'其他畫面已儲存'};
      else s.campaign.description='另一筆正常活動編輯';
      revision++;commitConflict=null;return Response.json(false);
    }
    if(body.p_revision!==revision)return Response.json(false);
    s=body.p_data;revision++;return Response.json(true);
  }
  throw new Error('Unexpected test request: '+path);
};
await import('../cloud/index.ts');
after(()=>{globalThis.fetch=originalFetch;if(originalDeno===undefined)delete globalThis.Deno;else globalThis.Deno=originalDeno;});
beforeEach(()=>{s=emptyState();events=[];sessions=new Map();failStartup=false;nonce='test-nonce';revision=1;commitConflict=null;uploaded=null;controlResult={ok:true,deleted:2};controlCall=null;});
const invoke=(path,{body,token,role='customer',method=body?'POST':'GET'}={})=>handler(new Request('https://backend.test/functions/v1/ccbaby-api/'+path,{method,headers:{Origin:'https://ccbaby.beecharge.live','Content-Type':'application/json','x-ccbaby-role':role,...(token?{Authorization:'Bearer '+token}:{})},body:body?JSON.stringify(body):undefined}));
const credentials={code:'test-code',verifier:'v'.repeat(43),nonce:'test-nonce'};

test('actual browsing control handler requires owner and confirmation, maps database conflicts and never commits orders',async()=>{
  sessions.set(digest('owner'),{role:'admin',subject:'test-owner'});
  sessions.set(digest('member'),{role:'customer',subject:'fixture-person'});upsertCustomer(s,{id:'fixture-person',display_name:'測試'});
  const body={customerId:'fixture-person',version:0,action:'clear',confirm:true};
  assert.equal((await invoke('admin/browsing/control',{body,role:'admin'})).status,401);
  assert.equal((await invoke('admin/browsing/control',{body,token:'member'})).status,403);
  assert.equal((await invoke('admin/browsing/control',{body:{...body,confirm:false},token:'owner',role:'admin'})).status,400);assert.equal(controlCall,null);
  const before=JSON.stringify(s);
  const response=await invoke('admin/browsing/control',{body:{...body,orderId:999},token:'owner',role:'admin'});
  assert.equal(response.status,200);assert.deepEqual(controlCall,{p_hash:digest('owner'),p_customer:'fixture-person',p_version:0,p_action:'clear',p_excluded:null,p_confirm:true});
  assert.equal(revision,1);assert.equal(JSON.stringify(s),before);assert.ok(!events.includes('/rest/v1/rpc/ccbaby_commit'));
  for(const [result,status] of [[{conflict:true},409],[{notFound:true},404],[{unauthorized:true},401]]){controlResult=result;assert.equal((await invoke('admin/browsing/control',{body,token:'owner',role:'admin'})).status,status);}
  const listing=await invoke('admin/browsing',{token:'owner',role:'admin'});assert.equal(listing.status,200);
  const person=(await listing.json()).people[0];assert.equal(person.browsingExcluded,true);assert.equal(person.browsingVersion,4);assert.equal(person.browsingRecordCount,2);
});

test('anonymous product preview returns only active product identity and cover without a session or revision write',async()=>{
  const image='https://backend.test/storage/v1/object/public/ccbaby-products/abc-def.gif';
  s.products.push({id:9,code:'GD09',name:'外套',active:true,images:[image],sourceUrl:'private-source',cost:'private-cost'});
  const before=JSON.stringify(s);
  const result=await handler(new Request('https://backend.test/functions/v1/ccbaby-api/public/product-preview/9'));
  assert.equal(result.status,200);assert.deepEqual(await result.json(),{id:9,code:'GD09',name:'外套',image});
  assert.equal(JSON.stringify(s),before);assert.equal(revision,1);assert.equal(sessions.size,0);
  assert.deepEqual(events,['/rest/v1/rpc/ccbaby_load']);
  assert.equal((await invoke('catalog')).status,401);
  s.products[0].active=false;assert.equal((await invoke('public/product-preview/9')).status,404);
  const count=events.length;
  for(const id of ['0','09','9/extra','9007199254740992']) assert.equal((await invoke('public/product-preview/'+id)).status,404);
  assert.equal(events.length,count);
  assert.equal((await invoke('public/product-preview/9',{body:{id:9}})).status,401);
});

test('actual GIF handler verifies role, preserves bytes and rejects invalid content before Storage',async()=>{
  const token='gif-owner';sessions.set(digest(token),{role:'admin',subject:'test-owner'});
  assert.equal((await invoke('admin/upload',{body:{data:productGifData},role:'admin'})).status,401);
  assert.equal((await invoke('admin/upload',{body:{data:productGifData},token,role:'customer'})).status,403);
  assert.equal(uploaded,null);
  const fullGif=productGifOfSize(2000000),fullData='data:image/gif;base64,'+fullGif.toString('base64');
  const result=await invoke('admin/upload',{body:{data:fullData},token,role:'admin'});
  assert.equal(result.status,200);const {url}=await result.json();assert.match(url,/ccbaby-products\/[a-f0-9-]+\.gif$/);
  assert.equal(uploaded.type,'image/gif');assert.deepEqual(uploaded.bytes,fullGif);
  assert.equal(revision,1);assert.deepEqual(s.products,[]);
  for(const data of [productGifData.replace('image/gif','image/png'),'data:image/gif;base64,'+Buffer.from('GIF89a').toString('base64'),'data:image/gif;base64,'+productGifOfSize(2000001).toString('base64')]){
    uploaded=null;assert.equal((await invoke('admin/upload',{body:{data},token,role:'admin'})).status,400);assert.equal(uploaded,null);
  }
  const still=await invoke('admin/upload',{body:{data:fullData.replace('image/gif','image/png')},token,role:'admin'});
  assert.equal(still.status,400);assert.match((await still.json()).error,/1.4 MB/);assert.equal(uploaded,null);
  assert.equal((await invoke('admin/products',{body:{data:fullData},token,role:'admin'})).status,413);
  assert.equal((await invoke('admin/upload',{body:{data:'x'.repeat(2800001)},token,role:'admin'})).status,413);
  const product={code:'GIF',name:'動畫商品',category:'衣著',price:590,colors:'藍',sizes:'S',kind:'vest',images:[url],imageBindings:[{color:'藍',url}]};
  assert.equal((await invoke('admin/products',{body:product,token,role:'admin'})).status,200);
  assert.deepEqual(s.products[0].images,[url]);assert.deepEqual(s.products[0].imageBindings,product.imageBindings);
});

test('actual video handler preserves concurrent edits, protects writes and returns video only through verified catalog',async()=>{
  const token='test-video-owner',customerToken='test-video-customer';
  sessions.set(digest(token),{role:'admin',subject:'test-owner'});
  sessions.set(digest(customerToken),{role:'customer',subject:'video-person'});upsertCustomer(s,{id:'video-person',display_name:'測試'});
  const product={code:'VIDEO',name:'影片商品',category:'衣著',price:590,colors:'白',sizes:'S',kind:'vest',sourceUrl:'https://private.example/purchase',videoUrl:'https://youtu.be/M7lc1UVf-VE?si=share',videoLayout:'horizontal'};
  assert.equal((await invoke('admin/products',{body:product,role:'admin'})).status,401);
  assert.equal((await invoke('admin/products',{body:product,token:customerToken,role:'customer'})).status,403);
  commitConflict='other';
  assert.equal((await invoke('admin/products',{body:product,token,role:'admin'})).status,200);
  assert.equal(s.products.length,1);assert.equal(s.campaign.description,'另一筆正常活動編輯');assert.equal(s.products[0].videoUrl,'https://www.youtube.com/watch?v=M7lc1UVf-VE');
  const publicResult=await invoke('customer/bootstrap',{token:customerToken});assert.equal(publicResult.status,200);
  const catalog=(await publicResult.json()).catalog;assert.equal(catalog.products[0].videoLayout,'horizontal');assert.doesNotMatch(JSON.stringify(catalog),/sourceUrl|private.example/);
  const before=JSON.stringify(s),beforeRevision=revision;
  assert.equal((await invoke('admin/products',{body:{...product,id:1,videoUrl:'https://youtube.com.evil.test/shorts/M7lc1UVf-VE'},token,role:'admin'})).status,400);
  assert.equal(JSON.stringify(s),before);assert.equal(revision,beforeRevision);
});

test('fast LINE login verifies identity before loading startup and returns a usable opaque session',async()=>{
  const response=await invoke('customer/line/exchange',{body:{...credentials,includeStartup:true}}),data=await response.json();
  assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');
  assert.match(data.token,/^[a-f0-9]{64}$/);assert.equal(data.startup.me.user.id,'line:test-person');
  assert.equal(data.startup.catalog.lineChannelId,'test-channel');
  assert.deepEqual(events,['/oauth2/v2.1/token','/oauth2/v2.1/verify','/rest/v1/rpc/ccbaby_line_customer','/rest/v1/rpc/ccbaby_session_create','/rest/v1/rpc/ccbaby_load']);
  const bootstrap=await invoke('customer/bootstrap',{token:data.token});assert.equal(bootstrap.status,200);
  assert.deepEqual(await bootstrap.json(),data.startup);
});
test('legacy LINE callers keep the original response and do not load the store unnecessarily',async()=>{
  const response=await invoke('customer/line/exchange',{body:credentials}),data=await response.json();
  assert.equal(response.status,200);assert.deepEqual(Object.keys(data).sort(),['ok','token']);
  assert.ok(!events.includes('/rest/v1/rpc/ccbaby_load'));
});
test('catalog failure after successful login keeps the session available for a retry',async()=>{
  failStartup=true;
  const response=await invoke('customer/line/exchange',{body:{...credentials,includeStartup:true}}),data=await response.json();
  assert.equal(response.status,200);assert.ok(data.token);assert.equal(data.startup,undefined);
  failStartup=false;assert.equal((await invoke('customer/bootstrap',{token:data.token})).status,200);
});
test('invalid LINE identity cannot create a session or load startup',async()=>{
  nonce='wrong-nonce';
  const response=await invoke('customer/line/exchange',{body:{...credentials,includeStartup:true}});
  assert.equal(response.status,401);assert.equal(sessions.size,0);
  assert.deepEqual(events,['/oauth2/v2.1/token','/oauth2/v2.1/verify']);
});
test('startup rejects anonymous, wrong-role, expired and missing-customer sessions',async()=>{
  sessions.set(digest('owner'),{role:'admin',subject:'test-owner'});
  sessions.set(digest('missing'),{role:'customer',subject:'line:missing'});
  for(const options of [{},{token:'expired'},{token:'owner'},{token:'owner',role:'admin'},{token:'missing'}]){
    const response=await invoke('customer/bootstrap',options);assert.ok([401,403].includes(response.status));
    const data=await response.json();assert.equal(data.catalog,undefined);assert.equal(data.me,undefined);
  }
});

test('actual promotion handler requires owner session and commits only valid settings',async()=>{
  sessions.set(digest('owner'),{role:'admin',subject:'test-owner'});
  const body={version:0,enabled:true,text:'本期公告'};
  for(const options of [{role:'admin'},{role:'customer',token:'owner'}]){
    assert.ok([401,403].includes((await invoke('admin/promotion',{...options,method:'PUT',body})).status));
  }
  assert.ok(!events.includes('/rest/v1/rpc/ccbaby_commit'));
  assert.equal((await invoke('admin/promotion',{role:'admin',token:'owner',method:'PUT',body:{...body,text:''}})).status,400);
  const saved=await invoke('admin/promotion',{role:'admin',token:'owner',method:'PUT',body});
  assert.equal(saved.status,200);assert.deepEqual((await saved.json()).promotion,{...body,version:1});
  assert.equal(revision,2);assert.equal(saved.headers.get('cache-control'),'no-store');
  const stale=await invoke('admin/promotion',{role:'admin',token:'owner',method:'PUT',body});
  assert.equal(stale.status,409);assert.equal(revision,2);
});

test('promotion revision retry preserves concurrent changes and refuses another promotion overwrite',async()=>{
  sessions.set(digest('owner'),{role:'admin',subject:'test-owner'});
  const options={role:'admin',token:'owner',method:'PUT',body:{version:0,enabled:true,text:'本期公告'}};
  commitConflict='unrelated';
  assert.equal((await invoke('admin/promotion',options)).status,200);
  assert.equal(s.campaign.description,'另一筆正常活動編輯');assert.equal(s.promotion.text,'本期公告');
  delete s.promotion;commitConflict='promotion';
  assert.equal((await invoke('admin/promotion',options)).status,409);
  assert.equal(s.promotion.text,'其他畫面已儲存');
});
