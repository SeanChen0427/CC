// First-party observations only. No DOM/text capture, URLs, form values or persistent queue.
export function createBrowsingTracker({send,now=Date.now,uuid=()=>crypto.randomUUID()}) {
  let visitId=uuid(),current=null,last=now(),interaction=last,visible=true,stopped=false,inFlight=null;
  const pending=new Map();
  function queue(row){pending.set(row.id,{...row});while(pending.size>200)pending.delete(pending.keys().next().value);}
  function sample(){
    const at=now();
    if(current&&visible){
      const delta=Math.max(0,Math.min(at,interaction+60000)-last);
      if(delta){current.activeMs=Math.min(43200000,current.activeMs+delta);queue(current);}
    }
    last=at;
  }
  function make(page,productId){return {id:uuid(),visitId,at:new Date(now()).toISOString(),type:'page_view',page,activeMs:0,...(productId?{productId}:{})};}
  function touch(){
    if(stopped)return;
    sample();
    if(now()-interaction>=1800000 || (current&&now()-Date.parse(current.at)>=43200000)){
      visitId=uuid();if(current){current=make(current.page,current.productId);queue(current);}
    }
    interaction=now();
  }
  function view(page,productId){
    if(stopped)return;
    touch();
    if(current?.page===page&&current?.productId===productId)return;
    current=make(page,productId);queue(current);
  }
  function action(action,detail={}){
    if(stopped||!current)return;
    touch();queue({id:uuid(),visitId,at:new Date(now()).toISOString(),type:'action',page:current.page,activeMs:0,...(current.productId?{productId:current.productId}:{}),...detail,action});
  }
  async function flush({keepalive=false}={}){
    sample();
    if(!pending.size)return;
    if(inFlight&&!keepalive)return inFlight;
    const batch=[...pending.values()].slice(0,20);
    const task=(async()=>{
      try{
        await send({events:batch},{keepalive});
        for(const row of batch)if(pending.get(row.id)?.activeMs===row.activeMs)pending.delete(row.id);
      }catch(error){
        // A rejected batch cannot be repaired by retry; network/server failures can.
        if([400,401,403].includes(error.status))for(const row of batch)pending.delete(row.id);
      }
    })();
    if(!keepalive){inFlight=task;try{await task;}finally{inFlight=null;}}
    else await task;
  }
  return {view,action,touch,sample,flush,
    visibility(value){sample();visible=value;if(value)touch();},
    stop(){sample();stopped=true;},
  };
}

export function mountBrowsingTracker(send) {
  const tracker=createBrowsingTracker({send});
  tracker.visibility(document.visibilityState==='visible');
  const touch=()=>tracker.touch();
  const visibility=()=>{tracker.visibility(document.visibilityState==='visible');if(document.visibilityState==='hidden')void tracker.flush({keepalive:true});};
  const hide=()=>{tracker.visibility(false);void tracker.flush({keepalive:true});};
  const show=()=>tracker.visibility(document.visibilityState==='visible');
  const activity=['pointerdown','keydown','scroll','touchstart'];
  for(const event of activity)document.addEventListener(event,touch,{passive:true,capture:true});
  document.addEventListener('visibilitychange',visibility);
  window.addEventListener('pagehide',hide);window.addEventListener('pageshow',show);
  const sampleTimer=setInterval(()=>tracker.sample(),5000),flushTimer=setInterval(()=>void tracker.flush(),15000);
  return {...tracker,dispose(){tracker.stop();clearInterval(sampleTimer);clearInterval(flushTimer);
    for(const event of activity)document.removeEventListener(event,touch,true);
    document.removeEventListener('visibilitychange',visibility);window.removeEventListener('pagehide',hide);window.removeEventListener('pageshow',show);
  }};
}
