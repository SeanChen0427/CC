import { officialAccountId } from '../shared/line-contact.js';
import { lineRecipient } from '../domain/line-notifications.mjs';

// Only server-side callers supply the token. No raw API response or credential
// is returned to the browser or logged.
export function createLineMessaging({token='',enabled=false,fetcher=globalThis.fetch}={}){
  const configured=Boolean(enabled&&token);
  async function call(path,options={}){
    return fetcher('https://api.line.me'+path,{...options,headers:{Authorization:'Bearer '+token,'Content-Type':'application/json',...options.headers},signal:AbortSignal.timeout(8000)});
  }
  async function quota(){
    if(!configured)return {configured:false,available:false,reason:'not_configured'};
    try{
      const info=await call('/v2/bot/info');
      if(!info.ok||(await info.json()).basicId!==officialAccountId)return {configured:true,available:false,reason:'account'};
      const [limitResponse,usageResponse]=await Promise.all([call('/v2/bot/message/quota'),call('/v2/bot/message/quota/consumption')]);
      if(!limitResponse.ok||!usageResponse.ok)return {configured:true,available:false,reason:'unavailable'};
      const limit=await limitResponse.json(),usage=await usageResponse.json();
      if(limit.type!=='limited'||!Number.isSafeInteger(limit.value)||!Number.isSafeInteger(usage.totalUsage)||limit.value<0||usage.totalUsage<0)return {configured:true,available:false,reason:'unavailable'};
      // Never buy extra messages or change the LINE plan. The existing LINE
      // monthly limit remains authoritative, including after an owner upgrade.
      return {configured:true,available:usage.totalUsage<limit.value,limit:limit.value,used:usage.totalUsage,remaining:Math.max(0,limit.value-usage.totalUsage),reason:usage.totalUsage>=limit.value?'quota':null};
    }catch{return {configured:true,available:false,reason:'unavailable'};}
  }
  async function recipient(customerId){
    const id=lineRecipient(customerId);if(!id)return false;
    try{const r=await call('/v2/bot/profile/'+id);return r.ok&&(await r.json()).userId===id;}catch{return false;}
  }
  async function push(job){
    try{
      const r=await call('/v2/bot/message/push',{method:'POST',headers:{'X-Line-Retry-Key':job.id},body:JSON.stringify({to:lineRecipient(job.customerId),messages:[{type:'text',text:job.message}]})});
      if(r.ok||(r.status===409&&r.headers.get('x-line-accepted-request-id')))return {status:'accepted',reason:null,requestId:r.headers.get('x-line-accepted-request-id')||r.headers.get('x-line-request-id')||null};
      if(r.status>=500)return {status:'manual',reason:'uncertain',mayHaveSent:true};
      if(r.status===429){
        const error=await r.json().catch(()=>({}));
        return {status:'manual',reason:/monthly limit|quota/i.test(error.message||'')?'quota':'unavailable',mayHaveSent:false};
      }
      return {status:'manual',reason:'rejected',mayHaveSent:false};
    }catch{return {status:'manual',reason:'uncertain',mayHaveSent:true};}
  }
  return {configured,quota,recipient,push};
}
