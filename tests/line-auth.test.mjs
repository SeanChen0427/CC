import test from 'node:test';
import assert from 'node:assert/strict';
import { saveLineAttempt,takeLineAttempt,browserLineLoginNeeded,markBrowserLineLogin,clearBrowserLineLogin } from '../shared/line-auth.js';
function storage(){const values=new Map();return {get length(){return values.size;},key:i=>[...values.keys()][i]??null,getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,String(value)),removeItem:key=>values.delete(key)};}
const at=Date.now(),attempt=(state='s'.repeat(43))=>({state,verifier:'v'.repeat(43),nonce:'n'.repeat(43),at,returnHash:'#orders'});

test('a callback in a new tab can consume its exact shared attempt once',()=>{
  const local=storage(),source=storage(),callback=storage(),p=attempt();
  saveLineAttempt(p,{session:source,local,now:at});
  assert.equal(callback.length,0);
  assert.deepEqual(takeLineAttempt(p.state,{session:callback,local,now:at+1000}),p);
  assert.equal(takeLineAttempt(p.state,{session:callback,local,now:at+1001}),null);
  assert.equal(takeLineAttempt(p.state,{session:source,local,now:at+1001}),null);
  assert.ok(!JSON.stringify([...Array(local.length)].map((_,i)=>local.getItem(local.key(i)))).includes(p.verifier));
});
test('unmatched or cross-browser callbacks never exchange identity and do not remove another attempt',()=>{
  const session=storage(),local=storage(),p=attempt();saveLineAttempt(p,{session,local,now:at});
  assert.equal(takeLineAttempt('x'.repeat(43),{session,local,now:at}),null);
  assert.equal(takeLineAttempt(p.state,{session:storage(),local:storage(),now:at}),null);
  assert.deepEqual(takeLineAttempt(p.state,{session,local,now:at+1}),p);
});
test('parallel sign-ins keep their own PKCE, nonce and return location',()=>{
  const local=storage(),one=storage(),two=storage(),a=attempt(),b={...attempt('b'.repeat(43)),verifier:'z'.repeat(43),nonce:'m'.repeat(43),returnHash:'#cart'};
  saveLineAttempt(a,{session:one,local,now:at});saveLineAttempt(b,{session:two,local,now:at});
  assert.deepEqual(takeLineAttempt(a.state,{session:two,local,now:at}),a);
  assert.deepEqual(takeLineAttempt(b.state,{session:one,local,now:at}),b);
});
test('expired, future and malformed attempts are rejected and expired secrets are cleaned',()=>{
  const session=storage(),local=storage(),p=attempt();saveLineAttempt(p,{session,local,now:at});
  assert.equal(takeLineAttempt(p.state,{session,local,now:at+600001}),null);assert.equal(local.length,0);assert.equal(session.length,0);
  for(const extra of [{at:at+10000},{at:'today'},{verifier:'broken'},{nonce:null}])assert.throws(()=>saveLineAttempt({...p,...extra},{session,local,now:at}));
});
test('legacy same-tab returns remain usable, unsafe hashes are stripped and denied storage has a clear error',()=>{
  const session=storage(),local=storage(),p=attempt();session.setItem('ccbaby.line.pending',JSON.stringify({...p,returnHash:'#other'}));
  assert.equal(takeLineAttempt(p.state,{session,local,now:at}).returnHash,'');assert.equal(session.getItem('ccbaby.line.pending'),null);
  const denied={getItem(){throw new Error('blocked');},setItem(){throw new Error('blocked');}};
  saveLineAttempt(p,{session:storage(),local:denied,now:at});
  assert.throws(()=>saveLineAttempt(p,{session:denied,local:denied,now:at}),/無法保存登入驗證/);
});
test('recovery uses browser login until successful and explicit recovery links are supported',()=>{
  const session=storage();assert.equal(browserLineLoginNeeded(session),false);
  markBrowserLineLogin(session);assert.equal(browserLineLoginNeeded(session),true);
  clearBrowserLineLogin(session);assert.equal(browserLineLoginNeeded(session),false);
  assert.equal(browserLineLoginNeeded(session,'?login=browser'),true);
});
