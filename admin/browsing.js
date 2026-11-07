const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
const stamp=v=>v?new Intl.DateTimeFormat('zh-TW',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false}).format(new Date(v)):'尚無紀錄';
const duration=ms=>{const n=Math.floor(ms/1000);return n>=3600?`${Math.floor(n/3600)} 小時 ${Math.floor(n%3600/60)} 分`:n>=60?`${Math.floor(n/60)} 分 ${n%60} 秒`:n?`${n} 秒`:'少於 1 秒';};
const pageNames={shop:'本期選物',product:'商品詳情',cart:'購物車',orders:'我的預購'};
const actionNames={category:'切換分類',search:'搜尋商品',more:'載入更多商品',photo:'切換照片',zoom:'放大照片',select_color:'選擇顏色',select_size:'選擇尺寸',detail_quantity:'調整選購數量',cart_add:'加入購物車',cart_quantity:'調整購物車數量',cart_remove:'移除購物車商品',submit_attempt:'嘗試送出預購',submit_success:'送出預購成功',submit_failure:'送出預購未成功',order_quantity:'修改預購數量',profile_saved:'儲存聯絡資料',about:'查看預購說明',account:'查看會員',size_guide:'查看尺寸參考',logout:'登出'};
const name=p=>p.name||p.displayName||'LINE 會員';
function figures(p){return `<div class="browse-figures">${[['造訪',p.visits+' 次'],['商品瀏覽',p.productViews+' 次'],['前景停留',duration(p.activeMs)],['加購操作',p.cartAdds+' 次']].map(([k,v])=>`<div><small>${k}</small><strong>${v}</strong></div>`).join('')}</div>`;}
function eventText(e){
  let text=e.type==='page_view'?'瀏覽'+pageNames[e.page]:actionNames[e.action]||'操作';
  if(e.productId)text+=' · '+e.productCode+' '+e.productName;
  if(e.option)text+=' · '+e.option;
  if(e.variantId)text+=' · '+e.color+' / '+e.size;
  if(e.quantity!=null)text+=' · '+e.quantity+' 件';
  if(e.category)text+=' · '+e.category;
  if(e.action==='search'&&e.results!=null)text+=' · '+e.results+' 個結果';
  return text;
}
export function mountBrowsing(root,{request}){
  const state={days:30,people:[],person:null,detail:null,search:'',filter:'all',busy:false,seq:0};
  const note=`<p class="browse-note">從功能上線後開始記錄，保留最近 180 天，僅含登入後的本站活動 · 停留為前景估算，背景與閒置一分鐘後暫停，斷線或關頁可能缺漏 · 預購結果以「客戶預購」為準</p>`;
  function shell(){
    root.innerHTML=`<div class="heading"><div><div class="eyebrow">CUSTOMER JOURNEYS</div><h1>瀏覽紀錄</h1><p>了解每位客戶看過什麼，以及每次選購的過程</p></div><div class="heading-actions"><button class="button light" data-browse="refresh">更新紀錄</button></div></div><div class="browse-controls"><label class="field">觀察期間<select id="browse-days">${[7,30,180].map(n=>`<option value="${n}" ${state.days===n?'selected':''}>最近 ${n} 天</option>`).join('')}</select></label>${!state.person?`<label class="field browse-search">搜尋客戶<input id="browse-search" type="search" placeholder="LINE 暱稱或聯絡姓名" value="${esc(state.search)}"></label><label class="field">觀察對象<select id="browse-filter">${[['all','所有客戶'],['unsubmitted','尚未預購'],['cart','曾加購但未預購'],['repeat','多次造訪']].map(([id,label])=>`<option value="${id}" ${state.filter===id?'selected':''}>${label}</option>`).join('')}</select></label>`:'<button class="button light" data-browse="back">← 所有客戶</button>'}</div>${note}<div id="browse-body" aria-live="polite"></div>`;
    root.querySelector('#browse-days').addEventListener('change',e=>{state.days=Number(e.target.value);void load();});
    root.querySelector('#browse-search')?.addEventListener('input',e=>{state.search=e.target.value;list();});
    root.querySelector('#browse-filter')?.addEventListener('change',e=>{state.filter=e.target.value;list();});
  }
  function list(){
    const people=state.people.filter(p=>(name(p)+' '+p.displayName).toLocaleLowerCase().includes(state.search.toLocaleLowerCase())&&(state.filter==='all'||state.filter==='unsubmitted'&&!p.hasPreorder||state.filter==='cart'&&p.cartAdds>0&&!p.hasPreorder||state.filter==='repeat'&&p.visits>1));
    const totals=state.people.reduce((s,p)=>({visits:s.visits+p.visits,productViews:s.productViews+p.productViews,activeMs:s.activeMs+p.activeMs,cartAdds:s.cartAdds+p.cartAdds}),{visits:0,productViews:0,activeMs:0,cartAdds:0});
    root.querySelector('#browse-body').innerHTML=`<div class="browse-summary"><span>有紀錄 ${state.people.filter(p=>p.visits).length} 位／已登入會員 ${state.people.length} 位</span>${figures(totals)}</div><p class="browse-note">符合條件 ${people.length} 位 · 「尚未預購」依目前有效預購判定，加購次數不代表目前購物車內容</p><div class="browse-customers">${people.map(p=>`<button class="browse-person" data-browse="person" data-id="${esc(p.customerId)}"><div class="browse-person-head"><div><strong>${esc(name(p))}</strong><small>LINE ${esc(p.displayName)}</small></div><span class="status-chip">${p.hasPreorder?'已有預購':'尚未預購'}</span></div>${figures(p)}<div class="browse-last"><span>最近活動 ${stamp(p.lastSeen)}</span><span>查看歷程 →</span></div></button>`).join('')||'<div class="panel empty">目前沒有符合條件的客戶</div>'}</div>`;
  }
  function detail(){
    const d=state.detail,p=d.person,visits=new Map();
    for(const e of d.events){if(!visits.has(e.visitId))visits.set(e.visitId,[]);visits.get(e.visitId).push(e);}
    root.querySelector('#browse-body').innerHTML=`<section class="panel browse-profile"><div class="browse-person-head"><div><h2>${esc(name(p))}</h2><p>LINE ${esc(p.displayName)} · ${p.hasPreorder?'已有有效預購':'尚未預購'}</p></div><span>最近活動 ${stamp(p.lastSeen)}</span></div>${figures(p)}</section><section class="panel browse-interests"><div class="panel-head"><h2>關注商品</h2><small>依瀏覽次數排序</small></div><div class="browse-interest-list">${d.interests.map(i=>`<div><strong>${esc(i.productCode)} ${esc(i.productName)}</strong><span>瀏覽 ${i.views} 次 · 停留 ${duration(i.activeMs)} · 加購 ${i.cartAdds} 次</span></div>`).join('')||'<div class="empty">這段期間尚無商品操作紀錄</div>'}</div></section><section class="browse-journeys"><h2>逐次造訪歷程</h2><p class="browse-note">每次開啟或重整頁面算一次造訪，閒置 30 分鐘後再操作另算一次 · 多個分頁各自計時，停留合計可能重疊</p>${[...visits.values()].map((rows,index)=>`<article class="panel browse-visit"><div class="panel-head"><h3>造訪 ${visits.size-index}${d.nextCursor?'（已載入部分）':''}</h3><small>${rows.length} 筆紀錄</small></div><ol class="browse-events">${[...rows].sort((a,b)=>a.at.localeCompare(b.at)||a.id.localeCompare(b.id)).map(e=>`<li class="${e.type==='page_view'?'browse-view':'browse-action'}"><time>${stamp(e.at)}</time><div><strong>${esc(eventText(e))}</strong>${e.type==='page_view'?`<span>前景停留 ${duration(e.activeMs)}</span>`:`<span>${pageNames[e.page]}</span>`}</div></li>`).join('')}</ol></article>`).join('')||'<div class="panel empty">這段期間尚無瀏覽紀錄，上線前的歷程無法回補</div>'}${d.nextCursor?'<button class="button light" data-browse="more">載入較早紀錄</button>':''}</section>`;
  }
  async function load(more=false){
    const seq=++state.seq;state.busy=true;
    if(!more){shell();root.querySelector('#browse-body').innerHTML='<div class="loading">正在讀取瀏覽紀錄…</div>';}
    const moreButton=root.querySelector('[data-browse="more"]');if(moreButton)moreButton.disabled=true;
    try{
      const q=new URLSearchParams({days:state.days});
      if(state.person)q.set('customerId',state.person);
      if(more&&state.detail?.nextCursor)q.set('before',state.detail.nextCursor);
      const data=await request('admin/browsing?'+q);
      if(!root.isConnected||seq!==state.seq)return;
      if(state.person){if(more)data.events=[...new Map([...state.detail.events,...data.events].map(e=>[e.id,e])).values()];state.detail=data;detail();}
      else{state.people=data.people;list();}
    }catch(error){
      if(!root.isConnected||seq!==state.seq)return;
      if(more){if(moreButton)moreButton.disabled=false;const p=document.createElement('p');p.className='error';p.textContent=error.message;root.querySelector('#browse-body').append(p);}
      else root.querySelector('#browse-body').innerHTML=`<div class="panel empty"><p>${esc(error.message)}</p><button class="button light" data-browse="refresh">重新讀取</button></div>`;
    }finally{if(seq===state.seq)state.busy=false;}
  }
  root.addEventListener('click',event=>{
    const button=event.target.closest('[data-browse]');if(!button)return;
    const action=button.dataset.browse;
    if(action==='person'){state.person=button.dataset.id;void load();window.scrollTo(0,0);}
    if(action==='back'){state.person=null;state.detail=null;void load();}
    if(action==='refresh')void load();
    if(action==='more'&&!state.busy)void load(true);
  });
  void load();
}
