// Short-lived login attempts only. Website sessions remain in sessionStorage.
const prefix='ccbaby.line.attempt.v2.';
const legacyKey='ccbaby.line.pending';
const recoveryKey='ccbaby.line.browser-login.v1';
const ttl=600000;
const randomValue=/^[A-Za-z0-9_-]{43}$/;
const parse=value=>{try{return JSON.parse(value);}catch{return null;}};
function get(storage,key){try{return storage?.getItem(key);}catch{return null;}}
function remove(storage,key){try{storage?.removeItem(key);}catch{}}
function set(storage,key,value){try{if(!storage)return false;storage.setItem(key,value);return storage.getItem(key)===value;}catch{return false;}}
function valid(p,state,now){return p&&p.state===state&&randomValue.test(p.state)&&randomValue.test(p.verifier)&&randomValue.test(p.nonce)&&Number.isFinite(p.at)&&p.at<=now+5000&&now-p.at<=ttl;}
function clean(storage,now){
  try{
    const rows=[];
    for(let i=0;i<storage.length;i++){
      const key=storage.key(i);if(!key?.startsWith(prefix))continue;
      const p=parse(storage.getItem(key));
      if(!p||!Number.isFinite(p.at)||now-p.at>ttl||p.at>now+5000)rows.push({key,at:-Infinity});
      else rows.push({key,at:p.at});
    }
    rows.sort((a,b)=>b.at-a.at);
    for(const [index,row] of rows.entries())if(index>=8||row.at===-Infinity)remove(storage,row.key);
    const old=parse(storage.getItem(legacyKey));if(old&&!valid(old,old.state,now))remove(storage,legacyKey);
  }catch{}
}
export function saveLineAttempt(pending,{session,local,now=Date.now()}){
  clean(session,now);clean(local,now);
  if(!valid(pending,pending.state,now))throw new Error('登入驗證無效，請重新登入');
  const key=prefix+pending.state,value=JSON.stringify(pending);
  const savedLocal=set(local,key,value),savedSession=set(session,key,value);
  if(!savedLocal&&!savedSession)throw new Error('瀏覽器無法保存登入驗證，請允許網站儲存資料後再試');
}
export function takeLineAttempt(state,{session,local,now=Date.now()}){
  clean(session,now);clean(local,now);
  if(!randomValue.test(state||''))return null;
  const key=prefix+state,shared=parse(get(local,key));
  if(shared?.consumed)return null;
  const candidates=[shared,parse(get(session,key)),parse(get(session,legacyKey))];
  const pending=candidates.find(p=>valid(p,state,now));
  if(!pending)return null;
  // A marker prevents the original tab from reusing its copy after a new tab consumed it.
  set(local,key,JSON.stringify({consumed:true,at:pending.at}));remove(session,key);
  if(parse(get(session,legacyKey))?.state===state)remove(session,legacyKey);
  return {...pending,returnHash:['#shop','#cart','#orders'].includes(pending.returnHash)?pending.returnHash:''};
}
export function markBrowserLineLogin(session){set(session,recoveryKey,'1');}
export function browserLineLoginNeeded(session,search=''){return get(session,recoveryKey)==='1'||new URLSearchParams(search).get('login')==='browser';}
export function clearBrowserLineLogin(session){remove(session,recoveryKey);}
