export const config = await fetch(new URL('./config.json', import.meta.url), { cache: 'no-store' }).then(r => { if(!r.ok)throw new Error('config'); return r.json(); });
export const cloud = config.mode === 'cloud';
const sessionKey = 'ccbaby.session.' + config.role + '.v1';
function token(){ return sessionStorage.getItem(sessionKey) || ''; }
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
export async function lineLogin(channelId, { replace = false } = {}) {
  if(!cloud||!channelId)throw new Error('LINE 登入準備中，開放時間將另行公告');
  const verifier=random(),state=random(),nonce=random();
  const challenge=b64(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(verifier))));
  const returnHash=['#shop','#cart','#orders'].includes(location.hash)?location.hash:'';
  sessionStorage.setItem('ccbaby.line.pending',JSON.stringify({verifier,state,nonce,returnHash,at:Date.now()}));
  const query=new URLSearchParams({response_type:'code',client_id:channelId,redirect_uri:config.customerURL,state,nonce,scope:'profile openid',code_challenge:challenge,code_challenge_method:'S256'});
  const url='https://access.line.me/oauth2/v2.1/authorize?'+query;
  if(replace)location.replace(url);else location.assign(url);
}
export async function finishLineLogin() {
  if(!cloud||config.role!=='customer')return;
  const q=new URLSearchParams(location.search);
  if(!q.has('code')&&!q.has('error'))return;
  history.replaceState(null,'',location.pathname+location.hash);
  let pending;try{pending=JSON.parse(sessionStorage.getItem('ccbaby.line.pending')||'null');}catch{}
  sessionStorage.removeItem('ccbaby.line.pending');
  if(q.has('error'))throw new Error('LINE 登入已取消，請再試一次');
  if(!pending||q.get('state')!==pending.state||Date.now()-pending.at>600000)throw new Error('LINE 登入驗證已失效，請重新登入');
  await request('customer/line/exchange',{method:'POST',body:{code:q.get('code'),verifier:pending.verifier,nonce:pending.nonce}});
  const returnHash=['#shop','#cart','#orders'].includes(pending.returnHash)?pending.returnHash:'';
  history.replaceState(null,'',location.pathname+returnHash);
}
