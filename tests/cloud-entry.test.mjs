import test, { after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { emptyState, upsertCustomer } from '../cloud/core.mjs';

// Exercise the actual Edge handler with isolated LINE/PostgREST responses.
// No network request or real session is created by this test.
const originalFetch=globalThis.fetch,originalDeno=globalThis.Deno;
const env={SUPABASE_URL:'https://backend.test',SUPABASE_SERVICE_ROLE_KEY:'test-service',LINE_CHANNEL_ID:'test-channel',LINE_CHANNEL_SECRET:'test-secret'};
let handler,s,events,sessions,failStartup,nonce,revision,commitConflict;
const digest=value=>createHash('sha256').update(value).digest('hex');
globalThis.Deno={env:{get:key=>env[key]},serve:fn=>{handler=fn;}};
globalThis.fetch=async(url,options={})=>{
  const path=new URL(url).pathname,body=options.body?JSON.parse(String(options.body).startsWith('{')?options.body:'{}'):{};
  events.push(path);
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
beforeEach(()=>{s=emptyState();events=[];sessions=new Map();failStartup=false;nonce='test-nonce';revision=1;commitConflict=null;});
const invoke=(path,{body,token,role='customer',method=body?'POST':'GET'}={})=>handler(new Request('https://backend.test/functions/v1/ccbaby-api/'+path,{method,headers:{Origin:'https://ccbaby.beecharge.live','Content-Type':'application/json','x-ccbaby-role':role,...(token?{Authorization:'Bearer '+token}:{})},body:body?JSON.stringify(body):undefined}));
const credentials={code:'test-code',verifier:'v'.repeat(43),nonce:'test-nonce'};

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
