import { AppError } from './validation.mjs';
import { orderNotice, orderProgress, noticeSignature } from './customer-care.mjs';

export const lineRecipient=id=>typeof id==='string'&&/^line:U[0-9a-f]{32}$/.test(id)?id.slice(5):null;
export const notificationKinds=['thanks','arrived'];
const stamp=now=>new Date(now).toISOString();
const money=value=>'NT$ '+Number(value).toLocaleString('en-US');
export const notificationReasons={
  not_configured:'LINE 自動通知尚未啟用，請改用人工傳送',
  quota:'本月訊息額度不足，請改用人工傳送或自行升級方案後重試',
  unavailable:'暫時無法確認 LINE 額度，請稍後重試或改用人工傳送',
  recipient:'尚無可發送的 LINE 對象，請確認客戶已加入官方帳號',
  account:'LINE 官方帳號設定需要確認，請先改用人工傳送',
  uncertain:'發送結果尚待確認，重試會使用同一識別避免重複；人工傳送前請先核對聊天室',
  expired:'先前發送結果未明，已超過安全重試期間，請先核對聊天室再人工處理',
  rejected:'LINE 未接受這次發送，請改用人工傳送',
  superseded:'預購內容已更新，請重新載入最新訊息',
};

export function notificationMessage(kind,order,campaign){
  const notice=orderNotice(kind,order,campaign);
  if(!notificationKinds.includes(kind)||!notice.eligible)throw new AppError(notice.blocked||'目前不能發送此通知',409);
  const p=orderProgress(order),url='https://ccbaby.beecharge.live/#orders';
  const intro=kind==='thanks'
    ?`CCBABY 已收到你的預購 🤍\n預購編號：${order.code}\n目前預購共 ${p.quantity} 件，預估商品小計 ${money(p.total)}\n現在不用付款，實際供貨依採購結果為準，到台後再通知付款`
    :`CCBABY 到台通知 🤍\n預購編號：${order.code}\n已分配給你的 ${p.bought} 件商品已到台，商品小計 ${money(p.boughtTotal)}\n${p.shortage?`確認缺貨 ${p.shortage} 件\n`:''}${p.pending?`另有 ${p.pending} 件仍待確認\n`:''}我們會在這裡核對運費、付款及交付方式，請等確認總額後再付款`;
  const details=order.items.filter(i=>i.quantity>0).map(i=>`${i.product_code} ${i.product_name}｜${i.color}／${i.size} × ${i.quantity}${kind==='arrived'?`（買到 ${i.bought||0}／缺貨 ${i.shortage||0}）`:''}`).join('\n');
  const ending=`\n\n完整明細與進度\n${url}\n有問題直接在這裡留言就好`;
  // A large order uses its protected full-detail link rather than a truncated list.
  return (intro+'\n\n'+details+ending).length<=3000?intro+'\n\n'+details+ending:intro+ending;
}

export function queueNotification(jobs,kind,order,campaign,{message,automatic=false}={},now=Date.now()){
  const signature=noticeSignature(kind,order,campaign);
  const existing=jobs.find(j=>j.orderId===order.id&&j.kind===kind&&j.signature===signature);
  if(existing)return existing;
  const text=message??notificationMessage(kind,order,campaign);
  if(typeof text!=='string'||!text.trim()||text.length>3000)throw new AppError('通知內容需為 1～3000 字');
  const job={id:crypto.randomUUID(),orderId:order.id,customerId:order.customer_id,kind,signature,message:text.trim(),automatic,status:'pending',reason:null,createdAt:stamp(now),updatedAt:stamp(now),attempts:0};
  jobs.push(job);return job;
}

export function publicNotification(job){
  if(!job)return null;
  const explanation=(job.status==='manual'&&job.mayHaveSent?'先前可能已發出，人工傳送前請先核對聊天室；':'')+(notificationReasons[job.reason]||'');
  return {id:job.id,kind:job.kind,status:job.status,inProgress:job.status==='sending'&&Date.parse(job.leaseUntil)>Date.now(),reason:job.reason,explanation,message:job.message,updatedAt:job.updatedAt,acceptedAt:job.acceptedAt||null};
}

export function orderNoticeForSend(body,order,campaign,record={}){
  if(!notificationKinds.includes(body.kind)||body.confirm!==true)throw new AppError('請逐筆確認通知內容與收件客戶');
  if(!Number.isSafeInteger(body.version)||body.version!==(record.version||0))throw new AppError('通知紀錄已更新，請重新載入',409);
  const n=orderNotice(body.kind,order,campaign,record);
  if(!n.eligible||body.signature!==n.signature)throw new AppError(n.blocked||'預購內容已更新，請重新載入',409);
  if(typeof body.message!=='string'||!body.message.trim()||body.message.length>3000)throw new AppError('通知內容需為 1～3000 字');
  return n;
}

export function notificationCareData(data,jobs=[]){
  for(const p of data.people)p.lineIdentified=Boolean(lineRecipient(p.customerId));
  for(const o of data.orders)for(const n of o.notices){
    const job=jobs.findLast(j=>j.orderId===o.id&&j.kind===n.kind&&j.signature===n.signature);
    n.delivery=publicNotification(job);
    if(notificationKinds.includes(n.kind)&&n.eligible)n.message=job?.message||notificationMessage(n.kind,o,data.campaign);
    if(['accepted','manual_done'].includes(job?.status))n.done=true;
  }
  return data;
}

export function claimNotification(job,order,campaign,now=Date.now()){
  if(['accepted','manual_done','superseded'].includes(job.status))return false;
  if(job.status==='sending'&&Date.parse(job.leaseUntil)>now)return false;
  if(!order||order.deleted_at||!orderNotice(job.kind,order,campaign).eligible||noticeSignature(job.kind,order,campaign)!==job.signature){
    Object.assign(job,{status:'superseded',reason:'superseded',updatedAt:stamp(now)});return false;
  }
  // LINE retains retry keys for 24 hours. Keep a margin and never resend an
  // uncertain operation outside that window with a fresh key.
  if(job.mayHaveSent&&now-Date.parse(job.firstPushAt)>=23*3600000){
    Object.assign(job,{status:'manual',reason:'expired',updatedAt:stamp(now)});return false;
  }
  Object.assign(job,{status:'sending',reason:null,claim:crypto.randomUUID(),leaseUntil:stamp(now+120000),updatedAt:stamp(now)});
  return true;
}

export function finishNotification(job,result,now=Date.now()){
  Object.assign(job,result,{updatedAt:stamp(now),leaseUntil:null});
  if(result.status==='accepted')job.acceptedAt=stamp(now);
}
