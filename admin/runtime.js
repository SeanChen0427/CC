import { saveLineAttempt, takeLineAttempt, markBrowserLineLogin, browserLineLoginNeeded, clearBrowserLineLogin } from './line-auth.js?v=0.3.26';
const embeddedConfig = document.getElementById('ccbaby-config');
export const config = embeddedConfig ? JSON.parse(embeddedConfig.textContent) : await fetch(new URL('./config.json', import.meta.url), { cache: 'no-store' }).then(r => { if(!r.ok)throw new Error('config'); return r.json(); });
export const cloud = config.mode === 'cloud';
const sessionKey = 'ccbaby.session.' + config.role + '.v1';
function token(){ return sessionStorage.getItem(sessionKey) || ''; }
export function hasSession(){ return Boolean(token()); }
function clear(){ sessionStorage.removeItem(sessionKey); }
async function response(path, options={}) {
  const auth=cloud&&token()?{Authorization:'Bearer '+token()}:{};
  return fetch((cloud?config.apiURL:'/api')+'/'+path, {
    ...options, headers:{'Content-Type':'application/json',...(cloud?{apikey:config.publishableKey,'x-ccbaby-role':config.role,...auth}:{}),...options.headers},
    body:options.body?JSON.stringify(options.body):undefined, cache:'no-store',
  });
}
export async function request(path, options={}) {
  const r=await response(path,options);
  const data=await r.json().catch(()=>({error:'連線暫時中斷，請稍後再試'}));
  if(!r.ok){if(r.status===401&&path!=='admin/login')clear();const error=new Error(data.error||'連線暫時中斷，請稍後再試');error.status=r.status;throw error;}
  if(cloud&&data.token){sessionStorage.setItem(sessionKey,data.token);delete data.token;}
  if(path==='logout'||path==='admin/password')clear();
  return data;
}
export async function download(path, filename, options={}) {
  const r=await response(path,options);
  if(!r.ok){const d=await r.json().catch(()=>({}));if(r.status===401)clear();throw new Error(d.error||'下載失敗，請重新登入後再試');}
  const url=URL.createObjectURL(await r.blob());const a=document.createElement('a');a.href=url;a.download=filename;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
const b64=bytes=>btoa(String.fromCharCode(...bytes)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
const random=()=>b64(crypto.getRandomValues(new Uint8Array(32)));
const browserStorage=name=>{try{return window[name];}catch{return null;}};
const lineStorage=()=>({session:browserStorage('sessionStorage'),local:browserStorage('localStorage')});
export const browserLineLoginRequired=()=>browserLineLoginNeeded(browserStorage('sessionStorage'),location.search);
export async function lineLogin(channelId, { replace = false } = {}) {
  if(!cloud||!channelId)throw new Error('LINE 登入準備中，開放時間將另行公告');
  const verifier=random(),state=random(),nonce=random();
  const challenge=b64(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(verifier))));
  const returnHash=['#shop','#cart','#orders'].includes(location.hash)?location.hash:'';
  const browserLogin=browserLineLoginRequired();
  saveLineAttempt({verifier,state,nonce,returnHash,at:Date.now()},lineStorage());
  const query=new URLSearchParams({response_type:'code',client_id:channelId,redirect_uri:config.customerURL,state,nonce,scope:'profile openid',code_challenge:challenge,code_challenge_method:'S256'});
  if(browserLogin)query.set('disable_auto_login','true');
  const url='https://access.line.me/oauth2/v2.1/authorize?'+query;
  if(replace)location.replace(url);else location.assign(url);
}
export async function finishLineLogin() {
  if(!cloud||config.role!=='customer')return;
  const q=new URLSearchParams(location.search);
  if(!q.has('code')&&!q.has('error'))return;
  history.replaceState(null,'',location.pathname+location.hash);
  const pending=takeLineAttempt(q.get('state'),lineStorage());
  if(q.has('error')){
    if(q.get('error')==='ACCESS_DENIED')throw new Error('LINE 登入已取消，請再試一次');
    markBrowserLineLogin(browserStorage('sessionStorage'));
    throw new Error('LINE 登入未能完成，請在此瀏覽器重新登入');
  }
  if(!pending){markBrowserLineLogin(browserStorage('sessionStorage'));throw new Error('登入驗證未能接續，請在此瀏覽器重新登入 LINE');}
  let result;
  try{result=await request('customer/line/exchange',{method:'POST',body:{code:q.get('code'),verifier:pending.verifier,nonce:pending.nonce,includeStartup:true}});}
  catch(error){markBrowserLineLogin(browserStorage('sessionStorage'));throw error;}
  clearBrowserLineLogin(browserStorage('sessionStorage'));
  const returnHash=['#shop','#cart','#orders'].includes(pending.returnHash)?pending.returnHash:'';
  history.replaceState(null,'',location.pathname+returnHash);
  return result.startup;
}
