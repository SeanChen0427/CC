import { renderOrderCards } from './order-card.js?v=0.3.20';
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
const date=value=>value?new Intl.DateTimeFormat('zh-TW',{timeZone:'Asia/Taipei',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(value)):'尚未設定';
const inputDate=value=>value?new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(value)).replace(' ','T'):'';

export function mountCustomerCare(root,{request,toast=()=>{},onOrder=()=>{},initialCustomerId=null}){
  let data=null,customerId=initialCustomerId,orderId=null,kind='thanks',filter='all',search='',busy=false,dirtyForm=false,generation=0,cards=[],page=0,imageURL='';
  const drafts=new Map();
  const dirty=()=>dirtyForm||drafts.size>0;
  const person=()=>data.people.find(p=>p.customerId===customerId);
  const order=()=>data.orders.find(o=>o.id===orderId&&o.customer_id===customerId);
  const notice=()=>order()?.notices.find(n=>n.kind===kind);
  const draftKey=()=>orderId+':'+kind;
  function clearImage(){if(imageURL)URL.revokeObjectURL(imageURL);imageURL='';cards=[];generation++;}
  function canLeave(){if(busy){toast('請等聯繫資料處理完成');return false;}return !dirty()||window.confirm('有尚未儲存的聯繫資料或對話草稿，要放棄並離開嗎？');}
  function shell(){
    root.innerHTML=`<div class="heading"><div><div class="eyebrow">CARE THROUGH THE JOURNEY</div><h1>客戶聯繫</h1><p>從第一則詢問到採買與到台，每次更新都讓客戶更安心</p></div><div class="heading-actions"><button class="button light" data-care="refresh">更新資料</button></div></div><div id="care-body"></div><p class="error" id="care-error" role="alert"></p>`;
    if(customerId&&person())renderPerson();else {customerId=null;renderList();}
  }
  function renderList(){
    clearImage();
    root.querySelector('#care-body').innerHTML=`<div class="browse-controls"><label class="field browse-search">搜尋客戶<input id="care-search" type="search" placeholder="聯繫碼、姓名或 LINE 暱稱" value="${esc(search)}"></label><label class="field">處理對象<select id="care-filter">${[['all','所有客戶'],['chat','待核對聊天室'],['notices','有待處理通知'],['due','已到追蹤時間']].map(([key,label])=>`<option value="${key}" ${key===filter?'selected':''}>${label}</option>`).join('')}</select></label></div><p class="browse-note">客戶先從網站傳出含聯繫碼的訊息，你再人工核對聊天室 · 所有訊息由官方帳號原生聊天人工傳送</p><div id="care-list"></div>`;
    root.querySelector('#care-search').addEventListener('input',event=>{search=event.target.value;listRows();});
    root.querySelector('#care-filter').addEventListener('change',event=>{filter=event.target.value;listRows();});listRows();
  }
  function listRows(){
    const rows=data.people.filter(p=>(p.name+' '+p.displayName+' '+(p.contactCode||'')).toLowerCase().includes(search.toLowerCase())&&(filter==='all'||filter==='chat'&&!p.care.chatConfirmed||filter==='notices'&&p.pendingNotices>0||filter==='due'&&p.next.key==='followup'));
    root.querySelector('#care-list').innerHTML=`<p class="browse-note">符合條件 ${rows.length} 位</p><div class="browse-customers">${rows.map(p=>`<button class="browse-person" data-care="person" data-id="${esc(p.customerId)}"><div class="browse-person-head"><div><strong>${esc(p.name)}</strong><small>LINE ${esc(p.displayName)}</small><small>${esc(p.contactCode||'尚未取得聯繫碼')}</small></div><span class="pill">${p.care.chatConfirmed?'已核對聊天室':'待核對聊天室'}</span></div><div class="browse-next"><strong>${esc(p.next.title)}</strong><span>有效預購 ${p.orderCount} 份 · 待處理通知 ${p.pendingNotices} 項</span></div><div class="browse-last"><span>下次聯繫 ${date(p.care.followUpAt)}</span><span>查看聯繫與圖卡 →</span></div></button>`).join('')||'<div class="panel empty">目前沒有符合條件的客戶</div>'}</div>`;
  }
  function renderPerson(){
    const p=person(),orders=data.orders.filter(o=>o.customer_id===customerId);
    if(!orders.some(o=>o.id===orderId))orderId=orders[0]?.id||null;
    root.querySelector('#care-body').innerHTML=`<button class="text-button" data-care="back">← 所有客戶</button><section class="panel care-person"><div class="browse-person-head"><div><h2>${esc(p.name)}</h2><p>LINE ${esc(p.displayName)}</p></div><span class="pill">${p.care.chatConfirmed?'已人工核對聊天室':'待人工核對聊天室'}</span></div><div class="care-code"><span>會員聯繫碼 <strong>${esc(p.contactCode||'尚未取得')}</strong></span>${p.contactCode?'<button class="button light" data-care="copy-code">複製聯繫碼</button>':''}<a class="button light" href="https://manager.line.biz/" target="_blank" rel="noopener noreferrer">開啟 LINE 官方帳號</a></div><p class="browse-note">請核對客戶傳來的聯繫碼或既有預購編號，再確認聊天室；網站不會自動判斷好友、送出或已讀狀態</p><form id="care-form"><div class="form-grid"><label class="field wide care-check"><input type="checkbox" name="chatConfirmed" ${p.care.chatConfirmed?'checked':''}>我已人工核對官方聊天室與此會員</label><label class="field">聊天室備註名稱<input name="chatLabel" maxlength="80" value="${esc(p.care.chatLabel)}" placeholder="方便你在官方帳號找到對話"></label><label class="field">下次聯繫時間（台灣）<input type="datetime-local" name="followUpAt" value="${inputDate(p.care.followUpAt)}"></label><label class="field wide">下次聯繫要確認什麼<textarea name="followUpNote" rows="2" maxlength="500" placeholder="例如 確認尺寸、更新採買進度或到台後確認匯款">${esc(p.care.followUpNote)}</textarea></label></div><div class="form-actions"><button class="button" ${busy?'disabled':''}>儲存聯繫與提醒</button>${p.care.followUpAt?'<button class="button light" type="button" data-care="clear-followup">這次追蹤已處理</button>':''}</div></form></section>${orders.length?`<section class="panel care-order"><div class="panel-head"><h2>預購圖卡與通知</h2><button class="text-button" data-care="order">核對完整預購 →</button></div><div class="panel-body"><label class="field">選擇預購<select id="care-order">${orders.map(o=>`<option value="${o.id}" ${o.id===orderId?'selected':''}>${esc(o.code)} · ${o.quantity} 件</option>`).join('')}</select></label><div id="care-notice"></div></div></section>`:'<div class="panel empty">尚無有效預購，可先安排詢問與選購協助</div>'}`;
    const form=root.querySelector('#care-form');form.addEventListener('input',()=>{dirtyForm=true;});
    form.addEventListener('submit',event=>{event.preventDefault();void saveCare();});
    root.querySelector('#care-order')?.addEventListener('change',event=>{orderId=Number(event.target.value);kind='thanks';renderNotice();});
    if(orderId)renderNotice();
  }
  function renderNotice(){
    clearImage();const o=order();if(!o)return;
    if(!o.notices.some(n=>n.kind===kind&&n.eligible))kind='thanks';
    const n=notice(),p=person(),key=draftKey(),saved=drafts.get(key);
    if(saved&&saved.signature!==n.signature)drafts.delete(key);
    const text=drafts.has(key)?drafts.get(key).text:n.message;
    root.querySelector('#care-notice').innerHTML=`<div class="care-stages">${o.notices.map(n=>`<button class="button ${n.kind===kind?'':'light'}" data-care="stage" data-kind="${n.kind}" ${!n.eligible?'disabled':''}>${esc(n.title)}${n.done?' ✓':''}</button>`).join('')}</div><div class="care-status"><strong>${esc(n.title)}</strong><span>${n.done?'已由店主標記人工傳送 · '+date(n.record.recordedAt):n.changed?'預購或採購內容已更新，請重新確認通知':'待人工傳送'}</span><p>預購 ${n.progress.quantity} 件 · 已分配買到 ${n.progress.bought} 件 · 確認缺貨 ${n.progress.shortage} 件 · 待確認 ${n.progress.pending} 件</p></div>${o.notices.some(n=>!n.eligible)?`<p class="browse-note">${o.notices.filter(n=>!n.eligible).map(n=>esc(n.blocked)).join(' · ')}</p>`:''}<label class="field">一對一訊息，可先修改<textarea id="care-message" rows="7" maxlength="3000">${esc(text)}</textarea></label><div class="form-actions"><button class="button light" data-care="copy-message">複製對話文字</button><button class="button ${n.done?'light':''}" data-care="mark" ${!p.care.chatConfirmed||busy?'disabled':''}>${n.done?'重新列為待處理':'我已在 LINE 人工傳送'}</button></div><p class="browse-note">${!p.care.chatConfirmed?'先在上方人工核對並儲存聊天室，才可標記通知狀態 · ':''}標記只記錄你的人工操作，不代表 LINE 已送達或客戶已付款；匯款總額與收款資料請在 LINE 核對後提供</p><div id="care-card"><div class="loading">正在產生預購圖卡…</div></div>`;
    root.querySelector('#care-message').addEventListener('input',event=>drafts.set(draftKey(),{text:event.target.value,signature:n.signature}));
    const ticket=generation;
    void renderOrderCards(o,n).then(result=>{if(!root.isConnected||ticket!==generation)return;cards=result;page=0;renderCard();}).catch(error=>{if(ticket===generation&&root.isConnected)root.querySelector('#care-card').textContent=error.message;});
  }
  function renderCard(){
    if(imageURL)URL.revokeObjectURL(imageURL);imageURL=URL.createObjectURL(cards[page].blob);
    root.querySelector('#care-card').innerHTML=`<div class="care-card-actions"><span>圖卡 ${page+1}／${cards.length} 張</span><div><button class="button light" data-care="card-prev" ${page===0?'disabled':''}>上一張</button><button class="button light" data-care="card-next" ${page===cards.length-1?'disabled':''}>下一張</button><a class="button" href="${imageURL}" download="${esc(cards[page].name)}">下載第 ${page+1} 張圖卡</a></div></div><p class="browse-note">下載圖卡後，附加到官方帳號的個別聊天室；多張圖卡請逐張下載並傳送，所有品項均分頁保留</p><img class="care-card-preview" src="${imageURL}" alt="${esc(notice().title)}圖卡，第 ${page+1} 張，共 ${cards.length} 張">`;
  }
  function careBody(){
    const form=root.querySelector('#care-form');return {customerId,version:person().care.version,chatConfirmed:form.elements.chatConfirmed.checked,chatLabel:form.elements.chatLabel.value,followUpAt:form.elements.followUpAt.value?new Date(form.elements.followUpAt.value+'+08:00').toISOString():null,followUpNote:form.elements.followUpNote.value};
  }
  async function saveCare(clear=false){
    if(busy)return;busy=true;
    try{const body=careBody();if(clear)body.followUpAt=null;await request('admin/customer-care',{method:'PUT',body});dirtyForm=false;busy=false;await load(false);toast(clear?'這次追蹤已處理':'聯繫與提醒已儲存');}
    catch(error){if(root.isConnected)root.querySelector('#care-error').textContent=error.message;}
    finally{busy=false;}
  }
  async function load(showLoading=true){
    const ticket=++generation;
    if(showLoading)root.innerHTML='<div class="loading">正在整理客戶聯繫與提醒…</div>';
    try{const result=await request('admin/customer-care');if(!root.isConnected||ticket!==generation)return;data=result;shell();}
    catch(error){if(!root.isConnected||ticket!==generation)return;root.innerHTML=`<div class="panel empty"><p>${esc(error.message)}</p><button class="button light" data-care="refresh">重新讀取</button></div>`;}
  }
  root.addEventListener('click',async event=>{
    const target=event.target.closest('[data-care]');if(!target||busy)return;
    const action=target.dataset.care;
    try{
      if(action==='refresh'){if(!canLeave())return;dirtyForm=false;drafts.clear();await load();return;}
      if(action==='person'||action==='back'){if(!canLeave())return;dirtyForm=false;drafts.clear();customerId=action==='person'?target.dataset.id:null;shell();return;}
      if(action==='stage'){kind=target.dataset.kind;renderNotice();return;}
      if(action==='order'){onOrder(orderId);return;}
      if(action==='clear-followup'){await saveCare(true);return;}
      if(action==='copy-code'||action==='copy-message'){
        const field=root.querySelector('#care-message'),text=action==='copy-code'?person().contactCode:field.value;
        try{await navigator.clipboard.writeText(text);toast(action==='copy-code'?'聯繫碼已複製':'文字已複製，請至官方聊天室核對後人工傳送');}
        catch{if(action==='copy-message'){field.focus();field.select();}toast('請選取文字後手動複製');}return;
      }
      if(action==='card-prev'||action==='card-next'){page+=action==='card-prev'?-1:1;renderCard();return;}
      if(action==='mark'){
        const n=notice(),o=order();busy=true;
        try{await request('admin/order-notice',{method:'PUT',body:{orderId:o.id,kind,version:o.noticeVersion,signature:n.signature,status:n.done?'pending':'sent'}});drafts.delete(draftKey());busy=false;await load(false);toast(n.done?'已重新列為待處理':'已記錄人工通知');}
        finally{busy=false;}
      }
    }catch(error){if(root.isConnected)root.querySelector('#care-error').textContent=error.message;}
  });
  void load();
  return {dirty,canLeave,dispose:clearImage};
}

export async function renderCareReminders(root,{request}){
  try{
    const data=await request('admin/customer-care');if(!root.isConnected)return;
    const people=data.people.filter(p=>p.next.priority>0);
    root.innerHTML=`<div class="panel-head"><h2>客戶聯繫提醒</h2><button class="text-button" data-action="navigate" data-view="care">查看全部 →</button></div><div class="panel-body">${people.slice(0,4).map(p=>`<button class="care-reminder" data-action="care-customer" data-customer-id="${esc(p.customerId)}"><strong>${esc(p.name)}</strong><span>${esc(p.next.title)}</span></button>`).join('')||'<p class="browse-note">目前沒有待處理的聯繫提醒</p>'}<p class="browse-note">共 ${people.length} 位待確認 · 提醒依正式預購、採購分配與你設定的時間整理</p></div>`;
  }catch{if(root.isConnected)root.innerHTML='<div class="panel-body">暫時無法載入聯繫提醒，可從「客戶聯繫」重新讀取</div>';}
}
