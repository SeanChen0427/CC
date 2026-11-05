// Custom app sessions are verified in PostgreSQL on every protected request.
// verify_jwt=false is required: these opaque tokens are not Supabase Auth JWTs.
import { AppError, text } from '../domain/validation.mjs';
import { operate, orders, report } from './core.mjs';
import { workbook } from '../server/xlsx.mjs';

const base = Deno.env.get('SUPABASE_URL');
const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const email = 'owner@ccbaby.internal';
const customerURL = 'https://seanchen0427.github.io/CC/';
const origins = new Set(['https://seanchen0427.github.io','http://127.0.0.1:4173','http://127.0.0.1:4174']);
const imagePrefix = base + '/storage/v1/object/public/ccbaby-products/';
const lineId = Deno.env.get('LINE_CHANNEL_ID') || '';
const lineSecret = Deno.env.get('LINE_CHANNEL_SECRET') || '';
const lineConfigured = Boolean(lineId && lineSecret);
const hex = bytes => [...bytes].map(x=>x.toString(16).padStart(2,'0')).join('');
const digest = async value => hex(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))));
async function backend(path, body, method='POST', extra={}) {
  const r=await fetch(base+path,{method,headers:{apikey:service,Authorization:'Bearer '+service,'Content-Type':'application/json',...extra},body:body===undefined?undefined:JSON.stringify(body)});
  const data=await r.json().catch(()=>null);
  if(!r.ok){console.error('Backend request failed',path,r.status);throw new AppError('服務暫時無法完成，請稍後再試',503);}
  return data;
}
const rpc=(name,body)=>backend('/rest/v1/rpc/'+name,body);
async function session(role,subject) {
  const token=hex(crypto.getRandomValues(new Uint8Array(32)));
  await rpc('ccbaby_session_create',{p_hash:await digest(token),p_role:role,p_subject:subject});
  return token;
}
async function passwordLogin(password) {
  const r=await fetch(base+'/auth/v1/token?grant_type=password',{method:'POST',headers:{apikey:service,'Content-Type':'application/json'},body:JSON.stringify({email,password})});
  const result=await r.json();
  if(!r.ok)throw new AppError('帳號或密碼不正確',401);
  return result;
}
function exportWorkbook(s) {
  const at=new Date().toISOString(),name=s.campaign.name;
  const rows=[['活動','預購編號','LINE 暱稱','聯絡姓名','手機','商品編號','商品名稱','規格','數量','預估單價','預估小計','分配買到','分配缺貨','收件資料','匯出時間']];
  for(const o of orders(s))for(const i of o.items)rows.push([name,o.code,o.customer.display_name,o.name,o.phone,i.product_code,i.product_name,i.color+' / '+i.size,i.quantity,i.price,i.quantity*i.price,i.bought,i.shortage,o.customer.delivery,at]);
  return workbook([{name:'客戶預購明細',rows},{name:'採買彙總',rows:[['活動','商品編號','商品名稱','顏色','尺寸／規格','需求','已買','待採買','確認缺貨','未分配已買','備註','匯出時間'],...report(s).map(r=>[name,r.code,r.name,r.color,r.size,r.demand,r.bought,r.remaining,r.shortage,r.unallocated,r.note,at])]}]);
}

Deno.serve(async req=>{
  const origin=req.headers.get('origin')||'';
  const headers={'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Vary':'Origin',...(origins.has(origin)?{'Access-Control-Allow-Origin':origin}:{}),'Access-Control-Allow-Headers':'content-type,apikey,authorization,x-ccbaby-role','Access-Control-Allow-Methods':'GET,POST,PATCH,PUT,OPTIONS'};
  const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers});
  try {
    if(origin&&!origins.has(origin))throw new AppError('此來源未開放',403);
    if(req.method==='OPTIONS')return new Response(null,{status:204,headers});
    const path=new URL(req.url).pathname.split('/ccbaby-api/')[1]||'';
    const method=req.method,role=req.headers.get('x-ccbaby-role')==='admin'?'admin':'customer';
    if(!['GET','POST','PUT','PATCH'].includes(method))throw new AppError('不支援的操作',405);
    if(method!=='GET'&&!origins.has(origin))throw new AppError('請從 CCBABY 網站操作',403);
    let body={};
    if(method!=='GET'){
      if(!(req.headers.get('content-type')||'').startsWith('application/json'))throw new AppError('請使用 JSON',415);
      const raw=await req.text();if(new TextEncoder().encode(raw).length>2200000)throw new AppError('資料超過允許大小',413);
      try{body=JSON.parse(raw);}catch{throw new AppError('資料格式不正確');}
      if(!body||typeof body!=='object'||Array.isArray(body))throw new AppError('資料格式不正確');
    }
    if(path==='health'&&method==='GET')return json({ok:true,database:'supabase',localOnly:false,lineConfigured});
    if((path.startsWith('admin/')&&role!=='admin')||(path.startsWith('customer/')&&role!=='customer'))throw new AppError('請使用對應入口',403);
    const token=(req.headers.get('authorization')||'').replace(/^Bearer /,'');
    const hash=await digest(token);
    let state=await rpc('ccbaby_load',{p_hash:hash,p_role:role});
    if(path==='admin/login'&&method==='POST'){
      const ip=req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()||'unknown';
      if(!await rpc('ccbaby_login_attempt',{p_bucket:await digest('admin:'+ip)}))throw new AppError('登入嘗試較多，請五分鐘後再試',429);
      if(body.username!=='hannah'||typeof body.password!=='string'||body.password.length>128)throw new AppError('帳號或密碼不正確',401);
      const auth=await passwordLogin(body.password);
      if(!state.owner_id||auth.user.id!==state.owner_id)throw new AppError('此帳號沒有管理權限',403);
      return json({ok:true,token:await session('admin',auth.user.id)});
    }
    if(path==='customer/login')throw new AppError('請使用 LINE 登入',403);
    if(path==='customer/line/exchange'&&method==='POST'){
      if(!lineConfigured)throw new AppError('LINE 登入準備中，開放時間將另行公告',503);
      const code=text(body.code,'登入識別',2048),verifier=text(body.verifier,'登入驗證',128),nonce=text(body.nonce,'登入驗證',128);
      if(!/^[A-Za-z0-9._~-]{43,128}$/.test(verifier))throw new AppError('登入驗證無效');
      const response=await fetch('https://api.line.me/oauth2/v2.1/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'authorization_code',code,redirect_uri:customerURL,client_id:lineId,client_secret:lineSecret,code_verifier:verifier})});
      const line=await response.json();if(!response.ok||!line.id_token)throw new AppError('LINE 登入已失效，請重新登入',401);
      const verified=await fetch('https://api.line.me/oauth2/v2.1/verify',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({id_token:line.id_token,client_id:lineId,nonce})});
      const identity=await verified.json();if(!verified.ok||!identity.sub||identity.nonce!==nonce||String(identity.aud)!==lineId||identity.iss!=='https://access.line.me')throw new AppError('LINE 身分驗證失敗',401);
      await rpc('ccbaby_line_customer',{p_id:'line:'+identity.sub,p_name:String(identity.name||'LINE 會員').slice(0,80)});
      return json({ok:true,token:await session('customer','line:'+identity.sub)});
    }
    if(path==='catalog'&&method==='GET')return json({...operate(state.data,path,method,body,null,imagePrefix),lineConfigured,lineChannelId:lineConfigured?lineId:null});
    if(path==='me'&&method==='GET')return json(operate(state.data,path,method,body,state.session,imagePrefix));
    if(!state.session)throw new AppError('請先登入',401);
    if(path==='logout'&&method==='POST'){await rpc('ccbaby_revoke',{p_hash:hash,p_all_admin:false});return json({ok:true});}
    if(path==='admin/password'&&method==='POST'){
      const p=text(body.password,'新密碼',128);if(p.length<12)throw new AppError('新密碼至少 12 個字元');
      const auth=await passwordLogin(String(body.current||'').slice(0,128));if(auth.user.id!==state.owner_id)throw new AppError('管理身分不符',403);
      await backend('/auth/v1/admin/users/'+state.owner_id,{password:p},'PUT');
      await rpc('ccbaby_revoke',{p_hash:'',p_all_admin:true});return json({ok:true});
    }
    if(path==='admin/upload'&&method==='POST'){
      const match=String(body.data||'').match(/^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/=]+)$/);if(!match)throw new AppError('僅支援 PNG、JPG、WebP');
      let bytes;try{bytes=Uint8Array.from(atob(match[2]),c=>c.charCodeAt(0));}catch{throw new AppError('圖片格式無效');}
      const valid=match[1]==='png'?hex(bytes.slice(0,8))==='89504e470d0a1a0a':match[1]==='jpeg'?hex(bytes.slice(0,3))==='ffd8ff':new TextDecoder().decode(bytes.slice(0,4))==='RIFF'&&new TextDecoder().decode(bytes.slice(8,12))==='WEBP';
      if(!valid||!bytes.length||bytes.length>1400000)throw new AppError('圖片格式無效或超過 1.4 MB');
      const name=crypto.randomUUID()+'.'+(match[1]==='jpeg'?'jpg':match[1]);
      const uploaded=await fetch(base+'/storage/v1/object/ccbaby-products/'+name,{method:'POST',headers:{apikey:service,Authorization:'Bearer '+service,'Content-Type':'image/'+match[1],'Cache-Control':'3600'},body:bytes});
      if(!uploaded.ok)throw new AppError('圖片上傳失敗，請稍後再試',503);
      return json({ok:true,url:imagePrefix+name});
    }
    if(path==='admin/export.xlsx'&&method==='GET')return new Response(exportWorkbook(state.data),{headers:{...headers,'Content-Type':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','Content-Disposition':'attachment; filename="ccbaby-preorder.xlsx"'}});
    if(path==='admin/backup'&&method==='GET')return new Response(JSON.stringify({schemaVersion:1,exportedAt:new Date().toISOString(),storage:'supabase-private-document-v1',data:state.data},null,2),{headers:{...headers,'Content-Disposition':'attachment; filename="ccbaby-preorder-backup.json"'}});
    if(path==='admin/campaign'&&body.status==='open'&&!lineConfigured)throw new AppError('請先設定 LINE 登入，再開放預購');
    for(let attempt=0;attempt<5;attempt++){
      const result=operate(state.data,path,method,body,state.session,imagePrefix);
      if(method==='GET'||(path==='admin/import'&&!body.commit))return json(result);
      if(await rpc('ccbaby_commit',{p_revision:state.revision,p_data:state.data,p_hash:hash,p_role:role}))return json(result);
      state=await rpc('ccbaby_load',{p_hash:hash,p_role:role});
      if(!state.session)throw new AppError('請重新登入',401);
    }
    throw new AppError('資料正由另一個畫面更新，請稍後再試',409);
  } catch(error) {
    const status=error instanceof AppError?error.status:500;
    if(status===500)console.error('CCBABY handler error',error?.name);
    return json({error:status===500?'服務暫時無法完成，請稍後再試':error.message},status);
  }
});
