import { AppError } from '../domain/validation.mjs';
import { claimNotification,finishNotification,publicNotification } from '../domain/line-notifications.mjs';

// transact runs synchronously inside the store's atomic transaction/revision
// check. External requests run only after the corresponding claim is durable.
export async function dispatchLineNotification(id,{transact,messaging}){
  const access=ctx=>{
    const job=ctx.jobs.find(j=>j.id===id);
    if(!job)throw new AppError('找不到通知',404);
    if(!ctx.session||(ctx.session.role!=='admin'&&!(ctx.session.role==='customer'&&ctx.session.subject===job.customerId)))throw new AppError('請先登入',401);
    return job;
  };
  const claimed=await transact(ctx=>{
    const job=access(ctx),order=ctx.orders.find(o=>o.id===job.orderId);
    return {claimed:claimNotification(job,order,ctx.campaign),job:structuredClone(job)};
  });
  if(!claimed.claimed)return publicNotification(claimed.job);
  const ticket=claimed.job.claim;
  const finish=async result=>transact(ctx=>{
    const job=access(ctx);
    if(job.claim!==ticket)return publicNotification(job);
    finishNotification(job,result);
    if(result.status==='accepted'){
      const old=ctx.notices[job.orderId]||{};
      ctx.notices[job.orderId]={version:(old.version||0)+1,notices:{...old.notices,[job.kind]:{status:'sent',method:'line-api',signature:job.signature,recordedAt:job.acceptedAt,notificationId:job.id}},updatedAt:job.updatedAt};
    }
    return publicNotification(job);
  });
  const quota=await messaging.quota();
  if(!quota.available)return finish({status:'manual',reason:quota.reason});
  if(!await messaging.recipient(claimed.job.customerId))return finish({status:'manual',reason:'recipient'});
  const prepared=await transact(ctx=>{
    const job=access(ctx),order=ctx.orders.find(o=>o.id===job.orderId);
    if(job.claim!==ticket||job.status!=='sending')return null;
    // Recheck the order immediately before committing the external operation.
    const check={...job,status:'pending'};
    if(!claimNotification(check,order,ctx.campaign)){
      finishNotification(job,{status:check.status,reason:check.reason});return null;
    }
    job.firstPushAt ||= new Date().toISOString();job.mayHaveSent=true;job.attempts++;
    return structuredClone(job);
  });
  if(!prepared)return publicNotification(claimed.job);
  return finish(await messaging.push(prepared));
}
