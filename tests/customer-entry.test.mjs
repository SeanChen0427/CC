import test from 'node:test';
import assert from 'node:assert/strict';
import { enterCustomerSite } from '../apps/customer-web/entry.js';

function setup({ user=null, callback=false, callbackError, configured=true, local=false, token=Boolean(user), startup, bootstrapError }={}) {
  const calls=[],gates=[],logins=[],ready=[];
  const deps={
    cloud:!local,hasSession:()=>token,returningFromLine:callback,
    finishLogin:async()=>{calls.push('callback');if(callbackError)throw new Error(callbackError);return startup;},
    request:async path=>{
      calls.push(path);
      if(path==='me')return{authenticated:Boolean(user),user};
      if(path==='customer/bootstrap'){
        if(bootstrapError)throw Object.assign(new Error('bootstrap unavailable'),{status:bootstrapError});
        if(!user)throw Object.assign(new Error('expired'),{status:401});
        return{me:{authenticated:true,user},catalog:{products:[{id:1}],campaign:{status:'open'}}};
      }
      if(path==='customer/line/config')return{lineConfigured:configured,lineChannelId:configured?'2012401105':null};
      if(path==='catalog')return{products:[{id:1}],campaign:{status:'open'}};
      throw new Error('Unexpected request');
    },
    showGate:(...args)=>gates.push(args),login:async(...args)=>logins.push(args),ready:(...args)=>ready.push(args),
  };
  return{deps,calls,gates,logins,ready};
}
test('a new visitor goes directly to LINE without requesting or displaying products',async()=>{
  const f=setup();assert.equal(await enterCustomerSite(f.deps),'redirected');
  assert.deepEqual(f.calls,['callback','customer/line/config']);
  assert.deepEqual(f.logins,[['2012401105']]);assert.equal(f.ready.length,0);
});
test('a verified session loads products without requesting another LINE login',async()=>{
  const user={id:'line:valid'};const f=setup({user});assert.equal(await enterCustomerSite(f.deps),'ready');
  assert.deepEqual(f.calls,['callback','customer/bootstrap']);assert.equal(f.logins.length,0);assert.equal(f.ready[0][1].user.id,user.id);
});
test('LINE callback is processed before reading the session or fetching products',async()=>{
  const f=setup({callback:true,user:{id:'line:valid'}});await enterCustomerSite(f.deps);
  assert.deepEqual(f.calls,['callback','customer/bootstrap']);assert.equal(f.ready.length,1);assert.equal(f.logins.length,0);
});
test('canceling LINE login stays at the retry screen without a redirect loop',async()=>{
  const f=setup({callback:true,callbackError:'LINE 登入已取消'});assert.equal(await enterCustomerSite(f.deps),'blocked');
  assert.deepEqual(f.calls,['callback','customer/line/config']);assert.equal(f.logins.length,0);assert.equal(f.ready.length,0);assert.equal(f.gates[0][1],'LINE 登入已取消');
});
test('an invalid or expired callback cannot enter the product page or loop into LINE',async()=>{
  const f=setup({callback:true});assert.equal(await enterCustomerSite(f.deps),'blocked');
  assert.equal(f.logins.length,0);assert.equal(f.ready.length,0);assert.ok(!f.calls.includes('catalog'));
});
test('missing LINE configuration shows a gate and never fetches the catalog',async()=>{
  const f=setup({configured:false});assert.equal(await enterCustomerSite(f.deps),'unavailable');
  assert.equal(f.logins.length,0);assert.equal(f.ready.length,0);assert.ok(!f.calls.includes('catalog'));
});
test('local demo mode remains available without real LINE redirects',async()=>{
  const f=setup({local:true});assert.equal(await enterCustomerSite(f.deps),'ready');
  assert.equal(f.logins.length,0);assert.equal(f.ready.length,1);
  assert.deepEqual(f.calls,['callback','me','catalog']);
});
test('verified callback startup renders without any follow-up API request',async()=>{
  const startup={me:{authenticated:true,user:{id:'line:valid'}},catalog:{products:[],campaign:{status:'open'}}};
  const f=setup({callback:true,startup});await enterCustomerSite(f.deps);
  assert.deepEqual(f.calls,['callback']);assert.deepEqual(f.ready,[[startup.catalog,startup.me]]);assert.equal(f.logins.length,0);
});
test('expired sessions restart login without reading products',async()=>{
  const f=setup({token:true});assert.equal(await enterCustomerSite(f.deps),'redirected');
  assert.deepEqual(f.calls,['callback','customer/bootstrap','customer/line/config']);assert.equal(f.ready.length,0);
});
test('a transient bootstrap failure is surfaced without forcing LINE reauthentication',async()=>{
  const f=setup({user:{id:'line:valid'},bootstrapError:503});
  await assert.rejects(enterCustomerSite(f.deps),e=>e.status===503);
  assert.deepEqual(f.calls,['callback','customer/bootstrap']);assert.equal(f.logins.length,0);assert.equal(f.ready.length,0);
});
test('older backends retain their verified me and catalog flow during rollout',async()=>{
  const f=setup({user:{id:'line:valid'},bootstrapError:404});assert.equal(await enterCustomerSite(f.deps),'ready');
  assert.deepEqual(f.calls,['callback','customer/bootstrap','me','catalog']);assert.equal(f.ready.length,1);
});
test('expired fallback sessions never load an older backend catalog',async()=>{
  const f=setup({token:true,bootstrapError:404});assert.equal(await enterCustomerSite(f.deps),'redirected');
  assert.deepEqual(f.calls,['callback','customer/bootstrap','me','customer/line/config']);assert.equal(f.ready.length,0);
});
