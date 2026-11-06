import { request, config, cloud, download } from './runtime.js';
import { art } from './product-art.js';
import { mountImageEditor } from './image-editor.js';
const $ = selector => document.querySelector(selector);
const esc = value => String(value ?? '').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[ch]);
const money = value => 'NT$ '+Number(value).toLocaleString('en-US');
const paths = {
  bag:'<path d="M5 7h14l1 14H4L5 7Z"/><path d="M9 8V6a3 3 0 016 0v2"/>',
  grid:'<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
  list:'<path d="M5 3h14v18H5zM9 8h6M9 12h6M9 16h3"/>',
  users:'<circle cx="9" cy="7" r="3"/><path d="M3 21v-3a6 6 0 0112 0v3M16 4a3 3 0 010 6M18 14a5 5 0 013 4v3"/>',
  box:'<path d="m12 2 9 5v10l-9 5-9-5V7l9-5Z"/><path d="m3 7 9 5 9-5M12 12v10M7.5 4.5l9 5"/>',
  settings:'<circle cx="12" cy="12" r="3"/><path d="m9 3 6 0 1 3 3 1 2 5-2 5-3 1-1 3H9l-1-3-3-1-2-5 2-5 3-1z"/>',
  arrow:'<path d="M4 12h15m-6-6 6 6-6 6"/>',
  external:'<path d="M14 3h7v7M21 3 11 13"/><path d="M10 3H3v18h18v-7"/>',
  download:'<path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/>',
  plus:'<path d="M12 5v14M5 12h14"/>',
  search:'<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',
  close:'<path d="m6 6 12 12M6 18 18 6"/>',
  check:'<path d="m5 12 4 4L19 6"/>',
};
const icon = name => `<svg viewBox="0 0 24 24" aria-hidden="true">${paths[name]||paths.list}</svg>`;
const views={dashboard:'工作總覽',products:'商品管理',customers:'客戶預購',procurement:'採買清單',settings:'活動與設定'};
const state={view:'dashboard',data:null,search:'',category:'全部分類',limit:25,onlyPending:false,imageEditor:null};
const modal=$('#modal');
let toastTimer;
const labels={draft:'準備中',open:'開放預購中',closed:'已結單',purchasing:'韓國採購中',arrived:'商品已到台',archived:'已封存'};
const date=value=>new Intl.DateTimeFormat('zh-TW',{timeZone:'Asia/Taipei',month:'2-digit',day:'2-digit'}).format(new Date(value));
const time=value=>new Intl.DateTimeFormat('zh-TW',{timeZone:'Asia/Taipei',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(value));

async function api(path, options={}){
  try { return await request(path,options); }
  catch(error) { if(error.status===401&&path!=='admin/login'){state.data=null;renderLogin();} throw error; }
}

function toast(message){$('#toast').textContent=message;$('#toast').classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').classList.remove('visible'),3500);}
function photo(p){return p.images?.[0]||'data:image/svg+xml,'+encodeURIComponent(art(p.kind,p.tone));}
function showModal(content,small=false){state.imageEditor?.dispose();state.imageEditor=null;modal.className=small?'modal-small':'';modal.innerHTML=`<button class="modal-close" data-action="close" aria-label="關閉">${icon('close')}</button><div class="modal-content">${content}</div>`;if(!modal.open)modal.showModal();}
function formData(form){return Object.fromEntries(new FormData(form));}
const exportButton=()=>`<button class="button light" data-action="export">${icon('download')}匯出 Excel</button>`;
const brand=()=>`<div class="brand"><span class="brand-symbol">${icon('bag')}</span><span><span class="brand-title">CCBABY</span><small>店主採購工作台</small></span></div>`;

function renderLogin(){
  $('#app').innerHTML=`<div class="login-screen"><section class="login-story">${brand()}<div><div class="eyebrow">CURATE WITH CARE</div><h1>商品與採買管理</h1><p>從每一份小小的喜歡，到一張清楚的採買清單， 這一趟，讓預購的每個細節都有自己的位置</p></div><footer>CCBABY / OWNER WORKSPACE</footer><div class="story-number">01</div></section><section class="login-panel"><form class="login-card" id="login-form"><div class="eyebrow">WELCOME TO YOUR WORKSPACE</div><h2>歡迎回來</h2><p>請使用店主專屬帳號登入採購工作台</p><label class="field">管理帳號<input name="username" autocomplete="username" required value="hannah"></label><label class="field">登入密碼<input name="password" type="password" autocomplete="current-password" required placeholder="輸入你的管理密碼"></label><div id="login-error" class="error" role="alert"></div><button class="button" type="submit">登入工作台 ${icon('arrow')}</button><div class="login-note"><span class="pill"><i></i>${cloud ? '店主專屬入口' : '本機工作台'}</span><p>客戶與管理入口各自獨立， 此處只供店主管理商品、預購與採買進度</p></div></form></section></div>`;
  $('#login-form').addEventListener('submit',async event=>{
    event.preventDefault();const form=event.currentTarget,button=form.querySelector('button');button.disabled=true;$('#login-error').textContent='';
    try{await api('admin/login',{method:'POST',body:formData(form)});await load();renderShell();}
    catch(error){$('#login-error').textContent=error.message;button.disabled=false;}
  });
}
async function load(){state.data=await api('admin/state');}
function navigate(view){state.view=view;state.search='';state.category='全部分類';state.limit=25;state.onlyPending=false;location.hash=view;renderShell();}
function renderShell(){
  const d=state.data;if(!d)return;
  $('#app').innerHTML=`<div class="workspace"><aside class="sidebar">${brand()}<div class="nav-label">YOUR WORKSPACE</div><nav class="side-nav" aria-label="管理導覽">${[['dashboard','grid'],['products','bag'],['customers','users'],['procurement','list'],['settings','settings']].map(([id,img])=>`<button data-action="navigate" data-view="${id}" class="${state.view===id?'active':''}">${icon(img)}<span>${views[id]}</span>${id==='products'?`<span class="nav-count">${d.products.length}</span>`:''}</button>`).join('')}</nav><div class="sidebar-bottom"><a class="side-preview" href="${esc(config.customerURL)}" target="_blank" rel="noopener">${icon('external')}預覽客戶選物頁</a><div class="owner"><div class="avatar">S</div><div><div class="owner-name">店主工作室</div><div class="owner-role">OWNER / 唯一管理員</div></div><button class="text-button" data-action="logout">登出</button></div></div></aside><div class="admin-main"><header class="topbar"><div class="breadcrumb"><span>韓國年度採購</span><span>/</span><strong>${views[state.view]}</strong></div><div class="topbar-right"><span>${esc(d.campaign.name)}</span><span class="pill"><i></i>${cloud ? '雲端工作台' : '本機工作台'}</span><button class="text-button" data-action="refresh" aria-label="重新整理資料">更新資料</button><button class="text-button mobile-logout" data-action="logout">登出</button></div></header><main class="admin-content" id="content"></main></div></div>`;
  if(state.view==='dashboard')renderDashboard();
  else if(state.view==='settings')renderSettings();
  else renderTablePage();
}

function heading(eyebrow,title,description,actions=''){
  return `<div class="heading"><div><div class="eyebrow">${eyebrow}</div><h1>${title}</h1><p>${description}</p></div><div class="heading-actions">${actions}</div></div>`;
}
function renderDashboard(){
  const {stats,orders,campaign}=state.data;
  const percent=stats.quantity?Math.min(100,Math.round(stats.bought/stats.quantity*100)):0;
  const activeOrders=orders.filter(o=>o.quantity>0);
  $('#content').innerHTML=heading('A LITTLE ORDER, A BETTER JOURNEY','採買工作總覽','查看預購、商品與採買進度',exportButton())+
    `<div class="stats">${[
      ['預購客戶',stats.customers,'位','已送出預購的客戶','users'],
      ['有效預購',stats.quantity,'件','不包含購物車暫存','list'],
      ['預估商品總額',money(stats.total),'','參考金額，並非已收款','bag'],
      ['本期選物',stats.products,'款','目前開放預購的商品','box'],
    ].map(([label,value,unit,note,img])=>`<div class="stat"><div class="stat-label"><span>${label}</span>${icon(img)}</div><div class="stat-value" ${String(value).length>9?'style="font-size:27px"':''}>${value}<small>${unit}</small></div><div class="stat-note">${note}</div></div>`).join('')}</div>
    <div class="dashboard-columns"><section class="panel"><div class="panel-head"><h2>最近的預購 <small>RECENT PREORDERS</small></h2><button class="text-button" data-action="navigate" data-view="customers">查看全部 →</button></div>${activeOrders.length ? `<div class="table-scroll"><table><thead><tr><th>客戶／預購編號</th><th>件數</th><th>預估金額</th><th>預購時間</th><th></th></tr></thead><tbody>${activeOrders.slice(0,6).map(o=>`<tr><td><div class="customer-cell"><span class="avatar">${esc(o.name.slice(-1))}</span><span><strong>${esc(o.name)}</strong><small>${esc(o.code)}</small></span></div></td><td class="number">${o.quantity}</td><td class="money">${money(o.total)}</td><td><small>${date(o.updated_at)} ${time(o.updated_at)}</small></td><td><button class="text-button" data-action="order" data-id="${o.id}">查看</button></td></tr>`).join('')||'<tr><td colspan="5" class="empty">還沒有收到預購，客戶送出後就會顯示在這裡</td></tr>'}</tbody></table></div>` : '<div class="empty">尚未收到預購</div>'}</section>
    <aside class="dashboard-right"><section class="panel"><div class="panel-head"><h2>這一趟的行程</h2><span class="pill">${labels[campaign.status]}</span></div><div class="panel-body"><ol class="timeline"><li class="${campaign.status==='open'?'current':''}">選物開放預購<small>讓客人慢慢挑，先把喜歡記下</small></li><li class="${campaign.status==='closed'?'current':''}">整理採買清單<small>${campaign.status==='draft'?'請設定預購截止時間':'預計 '+date(campaign.closesAt)+' 結單'}</small></li><li class="${campaign.status==='purchasing'?'current':''}">出發韓國，親自採買<small>依規格記錄買到與缺貨</small></li><li class="${campaign.status==='arrived'?'current':''}">到台清點，聯絡客人<small>回台後再通知付款與交付</small></li></ol><div class="trip-note">${cloud?'請先上架商品並設定 LINE 登入，再開放預購':'本機資料保存在這台電腦'} 選物與日期可在活動與設定調整</div></div></section>
    <section class="progress-panel"><div class="progress-head"><h2>採買進度</h2><strong>${percent}%</strong></div><div class="progress-track"><div class="progress-fill" style="width:${percent}%"></div></div><div class="progress-text"><span>已買到 ${stats.bought} 件</span><span>待採買 ${stats.remaining} 件</span></div><button class="text-button" data-action="navigate" data-view="procurement" style="padding:17px 0 0">打開採買清單 →</button></section></aside></div>
    <p class="admin-footnote">所有金額為預購參考金額，非已收款，付款與交付仍透過 LINE 人工聯絡</p>`;
}

function renderTablePage(){
  const view=state.view;
  const meta={
    products:['THE COLLECTION','本期選物管理','上架、整理與更新這一趟的選物'],
    customers:['PEOPLE & PREORDERS','客戶預購紀錄','依客戶查看完整預購，回台後也能照著分貨'],
    procurement:['YOUR BUYING LIST','採買清單','每個規格分開計算，買到多少就記下多少'],
  }[view];
  const actions=view==='products'?`<button class="button light" data-action="import">CSV 批次匯入</button><button class="button" data-action="new-product">${icon('plus')}新增商品</button>`:exportButton();
  $('#content').innerHTML=heading(...meta,actions)+
    (view==='procurement'?`<div class="page-note">${icon('box')}「待採買」與「確認缺貨」分開記錄，買到後可在客戶明細手動分配，沒有自動順位</div>`:'')+
    `<section class="panel" data-page="${view}"><div class="toolbar"><div class="toolbar-left"><label class="search-box">${icon('search')}<input id="table-search" placeholder="${view==='customers'?'搜尋姓名、手機或預購編號':'搜尋商品名稱、編號或規格'}" value="${esc(state.search)}" aria-label="搜尋清單"></label>${view!=='customers'?`<select class="filter-select" id="category-filter" aria-label="分類篩選"><option>全部分類</option>${[...new Set(state.data.products.map(p=>p.category))].map(c=>`<option ${state.category===c?'selected':''}>${esc(c)}</option>`).join('')}</select>`:''}</div>${view==='procurement'?`<label class="checkbox-label"><input type="checkbox" id="pending-only" ${state.onlyPending?'checked':''}>只看待採買</label>`:`<span class="pill gray">${view==='products'?state.data.products.length+' 款選物':state.data.orders.filter(o=>o.quantity>0).length+' 份預購'}</span>`}</div><div id="table-area"></div></section>`;
  $('#table-search').addEventListener('input',e=>{state.search=e.target.value;state.limit=25;renderTable();});
  $('#category-filter')?.addEventListener('change',e=>{state.category=e.target.value;state.limit=25;renderTable();});
  $('#pending-only')?.addEventListener('change',e=>{state.onlyPending=e.target.checked;renderTable();});
  renderTable();
}

function renderTable(){
  const query=state.search.toLowerCase(),view=state.view;
  let rows;
  if(view==='products') rows=state.data.products.filter(p=>(p.name+' '+p.code).toLowerCase().includes(query)&&(state.category==='全部分類'||p.category===state.category));
  if(view==='customers') rows=state.data.orders.filter(o=>o.quantity>0&&(o.name+' '+o.phone+' '+o.code+' '+o.customer.display_name).toLowerCase().includes(query));
  if(view==='procurement') rows=state.data.report.filter(r=>(r.name+' '+r.code+' '+r.color+' '+r.size).toLowerCase().includes(query)&&(state.category==='全部分類'||r.category===state.category)&&(!state.onlyPending||r.remaining>0));
  const body=rows.slice(0,state.limit).map(row=>{
    if(view==='products'){
      const prices=row.variants.filter(v=>v.active).map(v=>v.price);
      return `<tr><td><div class="table-product"><img src="${photo(row)}" alt=""><span><strong>${esc(row.name)}</strong><small>${esc(row.code)}</small></span></div></td><td>${esc(row.category)}</td><td class="money">${money(Math.min(...prices))}</td><td>${prices.length} 種</td><td><span class="pill ${row.active?'':'gray'}">${row.active?'上架中':'已下架'}</span></td><td><button class="text-button" data-action="edit-product" data-id="${row.id}">編輯</button></td></tr>`;
    }
    if(view==='customers') return `<tr><td><div class="customer-cell"><span class="avatar">${esc(row.name.slice(-1))}</span><span><strong>${esc(row.name)}</strong><small>LINE：${esc(row.customer.display_name)}</small></span></div></td><td class="number">${esc(row.code)}</td><td>${row.quantity} 件</td><td class="money">${money(row.total)}</td><td>${row.phone?esc(row.phone):'<span class="muted">示範資料未填</span>'}</td><td><span class="pill">${labels[state.data.campaign.status]}</span></td><td><button class="text-button" data-action="order" data-id="${row.id}">查看明細</button></td></tr>`;
    return `<tr><td><div class="table-product"><img src="${photo(row)}" alt=""><span><strong>${esc(row.name)}</strong><small>${esc(row.code)} · ${esc(row.color)} / ${esc(row.size)}</small></span></div></td><td class="number">${row.demand}</td><td class="number">${row.bought}</td><td><span class="pill ${row.remaining?'gray':''}">${row.remaining}</span></td><td><span class="${row.shortage?'pill rose':'muted'}">${row.shortage}</span></td><td><small>${row.unallocated?'尚有 '+row.unallocated+' 件待分配':esc(row.note)||'—'}</small></td><td><button class="text-button" data-action="procure" data-id="${row.variant_id}">記錄</button><button class="text-button" data-action="demand" data-id="${row.variant_id}">看需求</button></td></tr>`;
  }).join('');
  const headings={
    products:['商品／編號','分類','起始售價','規格','狀態',''],
    customers:['客戶','預購編號','數量','預估金額','手機','階段',''],
    procurement:['商品與規格','需求','已買','待買','缺貨','備註／分配',''],
  }[view];
  $('#table-area').innerHTML=rows.length?`<div class="table-scroll"><table><thead><tr>${headings.map(h=>`<th>${h}</th>`).join('')}</tr></thead><tbody>${body}</tbody></table></div><div class="table-footer"><span>顯示 ${Math.min(rows.length,state.limit)} / ${rows.length} 筆</span>${rows.length>state.limit?'<button class="text-button" data-action="more">載入更多 →</button>':'<span>清單已更新</span>'}</div>`:`<div class="empty">${icon('search')}<h3>目前沒有符合的資料</h3><p>試著調整關鍵字或篩選條件</p></div>`;
}

function showOrder(id){
  const o=state.data.orders.find(o=>o.id===id);if(!o)return;
  showModal(`<div class="eyebrow">PREORDER DETAILS / ${esc(o.code)}</div><h2>${esc(o.name)}的預購清單</h2><p>${date(o.created_at)} 建立，共 ${o.quantity} 件選物</p><div class="detail-contact"><div>LINE 暱稱<strong>${esc(o.customer.display_name)}</strong></div><div>聯絡手機<strong>${esc(o.phone||'尚未填寫')}</strong></div><div class="wide">收件資料<strong>${esc(o.customer.delivery||'待客戶補填')}</strong></div></div>
    ${o.items.map(i=>`<div class="modal-item"><div>${esc(i.product_name)}<small>${esc(i.product_code)} · ${esc(i.color)} / ${esc(i.size)} · ${i.quantity} 件</small><small>分配買到 ${i.bought} · 確認缺貨 ${i.shortage} · 待處理 ${i.quantity-i.bought-i.shortage}</small></div><div class="right"><span class="money">${money(i.price*i.quantity)}</span> <button class="text-button" data-action="allocate" data-id="${i.id}">分配採購結果</button></div></div>`).join('')}<div class="detail-total"><span>預估商品小計，非已收款</span><strong>${money(o.total)}</strong></div><div class="form-actions"><button class="button light" data-action="copy-order" data-id="${o.id}">複製分貨明細</button><button class="button" data-action="close">完成</button></div>`);
}

function showProductEditor(id){
  const p=state.data.products.find(p=>p.id===id);
  const variants=p?.variants.filter(v=>v.active)||[];
  const low=variants.length?Math.min(...variants.map(v=>v.price)):590;
  const high=variants.length?Math.max(...variants.map(v=>v.price)):590;
  showModal(`<div class="eyebrow">CURATE YOUR COLLECTION</div><h2>${p?'編輯商品':'新增商品'}</h2><form id="product-form"><section id="product-photos" class="photo-editor" aria-label="商品照片管理"></section>
    <div class="form-grid"><label class="field">商品編號<input name="code" required maxlength="30" value="${esc(p?.code||'')}" placeholder="例如 SP121"></label><label class="field">商品名稱<input name="name" required maxlength="80" value="${esc(p?.name||'')}"></label>
    <label class="field">商品分類<input name="category" list="categories" required maxlength="30" value="${esc(p?.category||'毛孩衣著')}"><datalist id="categories">${[...new Set(state.data.products.map(p=>p.category))].map(c=>`<option value="${esc(c)}"></option>`).join('')}</datalist></label><label class="field">上架狀態<select name="active"><option value="true" ${!p||p.active?'selected':''}>上架中</option><option value="false" ${p&&!p.active?'selected':''}>下架</option></select></label>
    <label class="field">基本售價（台幣）<input name="price" type="number" required min="1" max="1000000" value="${low}"></label><label class="field">XL／2XL 加價<input name="extra" type="number" required min="0" max="100000" value="${high-low}"></label>
    <label class="field">顏色（逗號分隔）<input name="colors" required value="${esc([...new Set(variants.map(v=>v.color))].join(',')||'奶油白,燕麥棕,鼠尾草綠')}"></label><label class="field">尺寸／規格（逗號分隔）<input name="sizes" required value="${esc([...new Set(variants.map(v=>v.size))].join(',')||'S,M,L,XL')}"></label>
    <label class="field">無照片時的示意圖<select name="kind">${[['vest','背心'],['coat','外套'],['bag','提袋'],['bowl','食碗'],['bed','睡墊'],['toy','玩具'],['scarf','領巾']].map(([key,label])=>`<option value="${key}" ${p?.kind===key?'selected':''}>${label}</option>`).join('')}</select></label><label class="field">示意圖色調<input name="tone" type="color" value="${p?.tone||'#b9a38b'}"></label>
    <label class="field wide">標籤（選填）<input name="badge" maxlength="20" value="${esc(p?.badge||'')}" placeholder="例如 NEW 或編輯推薦"></label><label class="field wide">商品說明<textarea name="description" maxlength="3000">${esc(p?.description||'')}</textarea></label></div><div class="error" id="product-error" role="alert"></div><div class="form-actions"><button type="button" class="button light" data-action="close">取消</button><button class="button" type="submit">儲存商品 ${icon('check')}</button></div></form>`);
  const editor=mountImageEditor($('#product-photos'),{
    images:p?.images,bindings:p?.imageBindings,colorsInput:$('#product-form [name="colors"]'),
    upload:(data,signal)=>api('admin/upload',{method:'POST',body:{data},signal}),
    onChange:({busy,failed})=>{const button=$('#product-form button[type="submit"]');button.disabled=busy||failed;button.textContent=busy?'等待照片上傳':failed?'請先處理失敗照片':'儲存商品';},
  });
  state.imageEditor=editor;
  $('#product-form').addEventListener('submit',async e=>{
    if(editor.busy){e.preventDefault();return;}
    e.preventDefault();const form=e.currentTarget,button=form.querySelector('button[type="submit"]');button.disabled=true;
    const data=formData(form);data.active=data.active==='true';Object.assign(data,editor.value());if(p)data.id=p.id;
    try{await api('admin/products',{method:'POST',body:data});await load();modal.close();renderShell();toast('商品已儲存，客戶端重新整理即可看到');}
    catch(error){$('#product-error').textContent=error.message;button.disabled=false;}
  });
}

function renderSettings(){
  const campaign=state.data.campaign;
  const local=new Date(new Date(campaign.closesAt).getTime()+8*3600000).toISOString().slice(0,16);
  $('#content').innerHTML=heading('READY FOR THE NEXT JOURNEY','活動與工作台設定','設定預購活動與管理帳號')+
    `<div class="settings-grid"><section class="panel"><div class="panel-head"><h2>本期預購活動</h2><span class="pill">${labels[campaign.status]}</span></div><form class="panel-body" id="campaign-form"><label class="field">活動名稱<input name="name" required maxlength="80" value="${esc(campaign.name)}"></label><label class="field">預購截止時間（台灣時間）<input name="closesAt" type="datetime-local" required value="${local}"></label><label class="field">目前階段<select name="status">${Object.entries(labels).map(([value,label])=>`<option value="${value}" ${campaign.status===value?'selected':''}>${label}</option>`).join('')}</select></label><p class="settings-foot">離開「開放預購」階段會停止客戶新增與修改，並保留結單採購快照，重新開放會恢復預購</p><div class="error" id="campaign-error" role="alert"></div><div class="form-actions"><button class="button" type="submit">儲存活動</button></div></form></section>
    <div><section class="panel"><div class="panel-head"><h2>預購資料備份</h2>${icon('box')}</div><div class="panel-body"><p class="settings-foot" style="margin-top:0">下載商品、客戶預購、採買與異動紀錄，備份不含管理密碼或登入憑證，請自行妥善保存</p><div class="form-actions"><button class="button light" data-action="backup">${icon('download')}下載 JSON 備份</button>${exportButton()}</div></div></section><section class="panel" style="margin-top:23px"><div class="panel-head"><h2>唯一管理員密碼</h2><span class="pill gray">hannah</span></div><form class="panel-body" id="password-form"><label class="field">目前密碼<input name="current" type="password" autocomplete="current-password" required></label><label class="field">新密碼<input name="password" type="password" autocomplete="new-password" minlength="12" maxlength="128" required placeholder="至少 12 個字元"></label><label class="field">再次輸入新密碼<input name="confirm" type="password" autocomplete="new-password" required></label><p class="settings-foot">更換後會撤銷所有舊管理登入，請用新密碼重新登入</p><div class="error" id="password-error" role="alert"></div><div class="form-actions"><button class="button light" type="submit">更換密碼</button></div></form></section></div></div>`;
  $('#campaign-form').addEventListener('submit',async e=>{
    e.preventDefault();const data=formData(e.currentTarget);data.closesAt=new Date(data.closesAt+':00+08:00').toISOString();
    try{await api('admin/campaign',{method:'PUT',body:data});await load();renderShell();toast('活動設定已更新');}
    catch(error){$('#campaign-error').textContent=error.message;}
  });
  $('#password-form').addEventListener('submit',async e=>{
    e.preventDefault();const data=formData(e.currentTarget);
    if(data.password!==data.confirm){$('#password-error').textContent='兩次新密碼不相同';return;}
    try{await api('admin/password',{method:'POST',body:data});state.data=null;renderLogin();toast('密碼已更換，請重新登入');}
    catch(error){$('#password-error').textContent=error.message;}
  });
}

function showImport(){
  showModal(`<div class="eyebrow">BUILD YOUR COLLECTION</div><h2>批次匯入商品</h2><p>上傳 UTF-8 CSV，或直接貼上內容，可從 Excel 另存為 CSV 後使用</p><div class="page-note">必要欄位：code,name,category,price,colors,sizes 顏色／尺寸中的逗號需以雙引號包住</div><input id="csv-file" type="file" accept=".csv,text/csv" aria-label="上傳 CSV"><label class="field">CSV 內容<textarea id="csv-text" class="import-text" placeholder='code,name,category,price,colors,sizes&#10;SP121,日常背心,毛孩衣著,590,"奶油白,燕麥棕","S,M,L"'></textarea></label><div id="import-result"></div><div class="form-actions"><button class="button light" data-action="csv-template">下載範本</button><button class="button" id="preview-import">預覽並檢查</button><button class="button" id="commit-import" hidden>確認匯入</button></div>`);
  $('#csv-file').addEventListener('change',async e=>{if(e.target.files[0]){$('#csv-text').value=await e.target.files[0].text();$('#commit-import').hidden=true;}});
  $('#csv-text').addEventListener('input',()=>{$('#commit-import').hidden=true;$('#import-result').innerHTML='';});
  $('#preview-import').addEventListener('click',async()=>{
    try{const result=await api('admin/import',{method:'POST',body:{csv:$('#csv-text').value}});$('#import-result').innerHTML=`<div class="import-preview">共 ${result.count} 筆，${result.errors.length} 個錯誤，${result.errors.map(error=>`<div class="import-error">第 ${error.line} 列：${esc(error.message)}</div>`).join('')}${result.products.slice(0,6).map(p=>`<div>${esc(p.code)} · ${esc(p.name)} · NT$ ${esc(p.price)}</div>`).join('')}</div>`;$('#commit-import').hidden=result.errors.length>0;}
    catch(error){$('#import-result').innerHTML=`<div class="error">${esc(error.message)}</div>`;}
  });
  $('#commit-import').addEventListener('click',async e=>{
    e.currentTarget.disabled=true;try{const result=await api('admin/import',{method:'POST',body:{csv:$('#csv-text').value,commit:true}});await load();modal.close();renderShell();toast('已匯入 '+result.count+' 件商品');}
    catch(error){toast(error.message);e.currentTarget.disabled=false;}
  });
}

document.addEventListener('click',async event=>{
  const target=event.target.closest('[data-action]');if(!target)return;
  const action=target.dataset.action,id=Number(target.dataset.id);
  try{
    if(action==='export'){await download('admin/export.xlsx','ccbaby-preorder.xlsx');return;}
    if(action==='backup'){await download('admin/backup','ccbaby-preorder-backup.json');return;}
    if(action==='close'){modal.close();return;}
    if(action==='navigate'){navigate(target.dataset.view);return;}
    if(action==='logout'){await api('logout',{method:'POST',body:{}});state.data=null;renderLogin();return;}
    if(action==='refresh'){await load();renderShell();toast('已取得最新資料');return;}
    if(action==='more'){state.limit+=25;renderTable();return;}
    if(action==='order'){showOrder(id);return;}
    if(action==='new-product'){showProductEditor();return;}
    if(action==='edit-product'){showProductEditor(id);return;}
    if(action==='import'){showImport();return;}
    if(action==='copy-order'){
      const o=state.data.orders.find(o=>o.id===id);
      const value=[o.code+' '+o.name,...o.items.map(i=>`${i.product_code} ${i.product_name} ${i.color}/${i.size} ×${i.quantity}（買到${i.bought}／缺貨${i.shortage}）`),'預估商品小計 '+money(o.total)].join('\n');
      await navigator.clipboard.writeText(value);toast('分貨明細已複製');return;
    }
    if(action==='csv-template'){
      const csv='\uFEFFcode,name,category,price,colors,sizes,kind,tone\nSP121,日常背心,毛孩衣著,590,"奶油白,燕麥棕","S,M,L",vest,#b9a38b\n';
      const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download='product-template.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);return;
    }
    if(action==='procure'){
      const r=state.data.report.find(r=>r.variant_id===id);
      showModal(`<div class="eyebrow">RECORD YOUR FINDS</div><h2>記錄採買結果</h2><p>${esc(r.code)} ${esc(r.name)} ${esc(r.color)} / ${esc(r.size)} · 共需 ${r.demand} 件</p><form id="procure-form"><div class="form-grid"><label class="field">累計已買到<input name="bought" type="number" min="0" max="99999" required value="${r.bought}"></label><label class="field">確認缺貨<input name="shortage" type="number" min="0" max="${r.demand}" required value="${r.shortage}"></label></div><label class="field">採購備註<textarea name="note" maxlength="500">${esc(r.note)}</textarea></label><p class="settings-foot">尚未採買不是缺貨，只有確認無法購得時才填缺貨，已分配給客戶的數量需先調整分配後才能減少</p><div class="error" id="procure-error" role="alert"></div><div class="form-actions"><button type="button" class="button light" data-action="close">返回</button><button class="button">儲存紀錄</button></div></form>`,true);
      $('#procure-form').addEventListener('submit',async e=>{
        e.preventDefault();const data=formData(e.currentTarget);data.bought=Number(data.bought);data.shortage=Number(data.shortage);data.version=r.version;
        try{await api('admin/procurement/'+id,{method:'PUT',body:data});await load();modal.close();renderShell();toast('採買結果已儲存');}
        catch(error){$('#procure-error').textContent=error.message;}
      });return;
    }
    if(action==='demand'){
      const r=state.data.report.find(r=>r.variant_id===id);
      const requests=state.data.orders.flatMap(o=>o.items.filter(i=>i.variant_id===id).map(i=>({o,i})));
      showModal(`<div class="eyebrow">WHO SAVED THIS PIECE</div><h2>預購需求明細</h2><p>${esc(r.code)} ${esc(r.name)} ${esc(r.color)} / ${esc(r.size)} · 合計 ${r.demand} 件</p>${requests.map(({o,i})=>`<div class="modal-item"><div>${esc(o.name)}<small>${esc(o.code)} · 預購 ${i.quantity} 件</small></div><button class="text-button" data-action="order" data-id="${o.id}">查看明細 →</button></div>`).join('')}<div class="form-actions"><button class="button" data-action="close">知道了</button></div>`,true);return;
    }
    if(action==='allocate'){
      const o=state.data.orders.find(o=>o.items.some(i=>i.id===id)),item=o.items.find(i=>i.id===id);
      showModal(`<div class="eyebrow">SET ASIDE FOR THIS CUSTOMER</div><h2>分配給${esc(o.name)}</h2><p>${esc(item.product_name)} ${esc(item.color)} / ${esc(item.size)} · 預購 ${item.quantity} 件</p><form id="allocate-form"><div class="form-grid"><label class="field">買到分配數<input type="number" name="bought" min="0" max="${item.quantity}" required value="${item.bought}"></label><label class="field">確認缺貨數<input type="number" name="shortage" min="0" max="${item.quantity}" required value="${item.shortage}"></label></div><p class="settings-foot">先在採買清單記錄買到與缺貨數量，再手動分配給客戶，系統不會自動決定客戶順位</p><div class="error" id="allocate-error" role="alert"></div><div class="form-actions"><button type="button" class="button light" data-action="order" data-id="${o.id}">返回明細</button><button class="button">儲存分配</button></div></form>`,true);
      $('#allocate-form').addEventListener('submit',async e=>{
        e.preventDefault();const data=formData(e.currentTarget);
        try{await api('admin/allocation',{method:'POST',body:{itemId:id,bought:Number(data.bought),shortage:Number(data.shortage)}});await load();renderShell();showOrder(o.id);toast('客戶分配已更新');}
        catch(error){$('#allocate-error').textContent=error.message;}
      });return;
    }
  }catch(error){toast(error.message);}
});
modal.addEventListener('close',()=>{state.imageEditor?.dispose();state.imageEditor=null;});
modal.addEventListener('click',event=>{if(event.target===modal){const box=modal.getBoundingClientRect();if(event.clientX<box.left||event.clientX>box.right||event.clientY<box.top||event.clientY>box.bottom)modal.close();}});
window.addEventListener('hashchange',()=>{
  const view=location.hash.slice(1);
  if(state.data&&views[view]&&view!==state.view){modal.close();state.view=view;state.search='';state.limit=25;renderShell();}
});
try{
  const me=await api('me');
  if(me.authenticated){await load();if(views[location.hash.slice(1)])state.view=location.hash.slice(1);renderShell();}
  else renderLogin();
}catch(error){renderLogin();toast(error.message);}
