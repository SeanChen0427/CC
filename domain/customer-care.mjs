import { AppError } from './validation.mjs';
import { validContactCode,officialAccountId } from '../shared/line-contact.js';

const stamp=now=>new Date(now).toISOString();
const own=(value,key)=>Object.prototype.hasOwnProperty.call(value,key);
export const noticeKinds=['thanks','purchased','arrived','payment'];
const money=value=>'NT$ '+Number(value).toLocaleString('en-US');

export function assignContactCode(customer,customers,random=()=>crypto.randomUUID()){
  if(validContactCode(customer.contact_code))return {contactCode:customer.contact_code,officialAccountId,changed:false};
  for(let i=0;i<8;i++){
    const code='CC-'+random().replaceAll('-','').slice(0,12).toUpperCase();
    if(validContactCode(code)&&!customers.some(c=>c.contact_code===code)){
      customer.contact_code=code;return {contactCode:code,officialAccountId,changed:true};
    }
  }
  throw new AppError('暫時無法建立聯繫碼，請稍後再試',503);
}

export function careState(value={}){
  return {version:0,chatConfirmed:false,chatLabel:'',chatConfirmedAt:null,followUpAt:null,followUpNote:'',...value};
}
export function planCustomerCare(body,current={},now=Date.now()){
  const before=careState(current);
  if(!Number.isSafeInteger(body.version)||body.version!==before.version)throw new AppError('聯繫資料已更新，請重新載入後再儲存',409);
  const next={...before,version:before.version+1,updatedAt:stamp(now)};
  if(own(body,'chatConfirmed')){
    if(typeof body.chatConfirmed!=='boolean')throw new AppError('請確認聊天室核對狀態');
    next.chatConfirmed=body.chatConfirmed;
    next.chatConfirmedAt=body.chatConfirmed?(before.chatConfirmedAt||stamp(now)):null;
  }
  for(const [key,max] of [['chatLabel',80],['followUpNote',500]])if(own(body,key)){
    if(typeof body[key]!=='string'||body[key].length>max)throw new AppError('聯繫備註格式或長度無效');
    next[key]=body[key].trim();
  }
  if(own(body,'followUpAt')){
    if(body.followUpAt===null||body.followUpAt==='')next.followUpAt=null;
    else {
      const at=Date.parse(body.followUpAt);
      if(typeof body.followUpAt!=='string'||!Number.isFinite(at)||at<946684800000||at>4102444800000)throw new AppError('請填寫有效的下次聯繫時間');
      next.followUpAt=stamp(at);
    }
  }
  return next;
}

export function orderProgress(order){
  const items=(order.items||[]).filter(i=>i.quantity>0);
  const quantity=items.reduce((n,i)=>n+i.quantity,0),bought=items.reduce((n,i)=>n+(i.bought||0),0),shortage=items.reduce((n,i)=>n+(i.shortage||0),0);
  return {quantity,bought,shortage,pending:Math.max(0,quantity-bought-shortage),boughtTotal:items.reduce((n,i)=>n+(i.bought||0)*i.price,0),total:items.reduce((n,i)=>n+i.quantity*i.price,0)};
}
export function noticeSignature(kind,order,campaign){
  return JSON.stringify([kind,order.id,order.version,...(kind==='arrived'?[campaign.status]:[]),
    order.items.filter(i=>i.quantity>0).map(i=>[i.id,i.product_code,i.product_name,i.color,i.size,i.price,i.quantity,...(['thanks','payment'].includes(kind)?[]:[i.bought||0,i.shortage||0])])]);
}

export function orderNotice(kind,order,campaign,record={}){
  if(!noticeKinds.includes(kind))throw new AppError('通知類型無效');
  const p=orderProgress(order),isArrived=campaign.status==='arrived';
  const base={kind,signature:noticeSignature(kind,order,campaign),progress:p,eligible:p.quantity>0,
    title:'',message:'',blocked:'',done:false,record:record.notices?.[kind]||null};
  const intro=`嗨～${order.name||'你好'}，這是 CCBABY 預購 ${order.code} 的更新`;
  if(kind==='thanks'){
    base.title='預購確認與感謝';
    base.message=`${intro}\n謝謝你的預購！已收到 ${p.quantity} 件選物需求，預估商品小計 ${money(p.total)}\n請於下單後 24 小時內完成付款，確認付款後才安排採購；收款資料與總額會在這裡人工核對\n實際供貨依韓國採購結果為準，缺貨可選擇退款或更換款式；依付款順序寄出，預計 11/30 起陸續出貨\n附上預購明細圖卡，尺寸或商品有問題，直接在這裡留言就好`;
  }else if(kind==='purchased'){
    base.eligible=p.bought+p.shortage>0;
    base.title=p.bought===p.quantity?'已全部買到通知':p.bought>0?'採購進度通知':'缺貨結果確認';
    const result=p.bought===p.quantity?`這次預購的 ${p.bought} 件商品已全部買到`:`目前已買到 ${p.bought} 件、確認缺貨 ${p.shortage} 件，還有 ${p.pending} 件等待採買或分配確認`;
    base.message=`${intro}\n${result}\n${p.shortage?'缺貨商品可選擇退款或更換其他款式，請在這裡告訴我\n':''}${isArrived?'商品已到台，後續會在這裡與你核對交付方式':'後續到台進度會再和你說明'}\n依付款順序寄出，預計 11/30 起陸續出貨；圖卡列出目前各品項的採購結果，謝謝你的等待`;
    base.blocked='先在採買清單記錄結果，並分配到這位客戶的預購，才可產生採購通知';
  }else if(kind==='arrived'){
    base.eligible=isArrived&&p.bought>0;base.title='到台通知';
    base.message=`${intro}\n已分配給你的 ${p.bought} 件商品已到台，謝謝你的耐心等待\n${p.pending?`另有 ${p.pending} 件仍待採買或分配確認，我會分開說明\n`:''}${p.shortage?`本次有 ${p.shortage} 件確認缺貨，可選擇退款或更換款式，明細已列在圖卡\n`:''}接下來會和你核對品項、運費及交付方式，依付款順序寄出，預計 11/30 起陸續出貨`;
    base.blocked='活動需設為「商品已到台」，且此客戶已有分配買到的商品';
  }else{
    base.title='匯款聯繫提醒';
    base.message=`${intro}\n目前預購共 ${p.quantity} 件，預估商品小計 ${money(p.total)}（運費另行確認）\n請於下單後 24 小時內完成付款，確認付款後才安排採購；我會在這裡提供收款資料及核對後的總額，請確認後再匯款\n若已付款，請在這裡告訴我以便人工核對；依付款順序寄出，預計 11/30 起陸續出貨\n缺貨可選擇退款或更換款式，有需要確認的地方都可以直接留言`;
    base.blocked='需有有效預購品項，才可準備匯款聯繫';
  }
  base.done=base.record?.status==='sent'&&base.record.signature===base.signature;
  base.changed=base.record?.status==='sent'&&!base.done;
  return base;
}

export function planNotice(body,order,campaign,customerCare,current={},now=Date.now()){
  if(!Number.isSafeInteger(body.version)||body.version!==(current.version||0))throw new AppError('通知紀錄已更新，請重新載入',409);
  const notice=orderNotice(body.kind,order,campaign,current);
  if(!notice.eligible)throw new AppError(notice.blocked||'目前沒有可通知的有效品項',409);
  if(body.signature!==notice.signature)throw new AppError('預購或採購結果已變動，請重新產生圖卡與訊息',409);
  if(!['sent','pending'].includes(body.status))throw new AppError('通知狀態無效');
  if(body.status==='sent'&&!careState(customerCare).chatConfirmed)throw new AppError('請先人工核對此會員的官方聊天室',409);
  return {version:(current.version||0)+1,notices:{...(current.notices||{}),[body.kind]:{status:body.status,signature:notice.signature,recordedAt:stamp(now)}},updatedAt:stamp(now)};
}

export function customerCarePerson(customer,orders,campaign,care={},orderRecords={},now=Date.now()){
  care=careState(care);
  const ownOrders=orders.filter(o=>o.customer_id===customer.id&&!o.deleted_at&&o.quantity>0);
  let next={key:'observe',title:'等待客戶的選購或詢問',priority:0};
  const tasks=ownOrders.flatMap(o=>noticeKinds.map(kind=>({...orderNotice(kind,o,campaign,orderRecords[o.id]),orderId:o.id}))).filter(n=>n.eligible&&!n.done);
  const lineIdentified=/^line:U[0-9a-f]{32}$/.test(customer.id);
  if(!lineIdentified&&!care.chatConfirmed&&(ownOrders.length||customer.contact_code))next={key:'chat',title:'先核對官方聊天室與會員',priority:70};
  else if((lineIdentified||care.chatConfirmed)&&tasks.length){const task=tasks[0];next={key:task.kind,title:task.title+(task.changed?'（內容有更新）':''),orderId:task.orderId,priority:60};}
  if(care.followUpAt&&Date.parse(care.followUpAt)<=now)next={key:'followup',title:'已到下次聯繫時間',priority:100};
  return {customerId:customer.id,name:customer.name||customer.display_name,displayName:customer.display_name,contactCode:customer.contact_code||null,care,next,
    pendingNotices:tasks.length,orderCount:ownOrders.length,orderIds:ownOrders.map(o=>o.id)};
}

export function careDashboard(customers,orders,campaign,careRecords={},orderRecords={},now=Date.now()){
  return customers.map(c=>customerCarePerson(c,orders,campaign,careRecords[c.id],orderRecords,now)).sort((a,b)=>b.next.priority-a.next.priority||a.name.localeCompare(b.name,'zh-TW'));
}
export function careData(customers,orders,campaign,careRecords={},orderRecords={}){
  return {campaign,people:careDashboard(customers,orders,campaign,careRecords,orderRecords),orders:orders.filter(o=>!o.deleted_at&&o.quantity>0).map(o=>({
    id:o.id,customer_id:o.customer_id,code:o.code,name:o.name,created_at:o.created_at,updated_at:o.updated_at,version:o.version,
    quantity:o.quantity,total:o.total,items:o.items.map(i=>({id:i.id,product_code:i.product_code,product_name:i.product_name,color:i.color,size:i.size,price:i.price,quantity:i.quantity,bought:i.bought||0,shortage:i.shortage||0})),
    noticeVersion:orderRecords[o.id]?.version||0,notices:noticeKinds.map(kind=>orderNotice(kind,o,campaign,orderRecords[o.id]))
  }))};
}
