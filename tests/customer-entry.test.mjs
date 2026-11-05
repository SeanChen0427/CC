import test from 'node:test';
import assert from 'node:assert/strict';
import { enterCustomerSite } from '../apps/customer-web/entry.js';

function setup({ user=null, callback=false, callbackError, configured=true, local=false }={}) {
  const calls=[],gates=[],logins=[],ready=[];
  const deps={
    cloud:!local,returningFromLine:callback,
    finishLogin:async()=>{calls.push('callback');if(callbackError)throw new Error(callbackError);},
    request:async path=>{
      calls.push(path);
      if(path==='me')return{authenticated:Boolean(user),user};
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
  assert.deepEqual(f.calls,['callback','me','customer/line/config']);
  assert.deepEqual(f.logins,[['2012401105']]);assert.equal(f.ready.length,0);
});
test('a verified session loads products without requesting another LINE login',async()=>{
  const user={id:'line:valid'};const f=setup({user});assert.equal(await enterCustomerSite(f.deps),'ready');
  assert.deepEqual(f.calls,['callback','me','catalog']);assert.equal(f.logins.length,0);assert.equal(f.ready[0][1].user.id,user.id);
});
test('LINE callback is processed before reading the session or fetching products',async()=>{
  const f=setup({callback:true,user:{id:'line:valid'}});await enterCustomerSite(f.deps);
  assert.deepEqual(f.calls,['callback','me','catalog']);assert.equal(f.ready.length,1);assert.equal(f.logins.length,0);
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
});
