const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const ordered=(base,ids)=>[...new Set([...ids.filter(id=>base.includes(id)),...base])];

export function mountMerchandising(root,{request,toast=()=>{}}){
  let data=null,draft=[],days=30,busy=false,sequence=0,limit=24;
  const dirty=()=>data&&!same(draft,data.currentIds);
  function render(){
    if(!data)return;
    const changed=dirty();
    root.innerHTML=`<div class="heading"><div><div class="eyebrow">MERCHANDISING</div><h1>商品排序</h1><p>參考選購訊號調整順序，確認後再套用到客戶頁</p></div><div class="heading-actions"><button class="button light" data-merch="refresh">更新資料</button></div></div><section class="panel merch-summary"><h2>${changed?'排序草稿尚未套用':'目前客戶看到的順序'}</h2><p>瀏覽與加購使用最近 ${data.days} 天的不重複人數，預購使用本期目前有效明細</p><p>${data.lowSample?'觀察人數少於 5 位，建議仍需人工判斷':'已有 '+data.observedPeople+' 位會員的觀察紀錄'}${!data.hasSignals?' · 尚無商品訊號，建議保留目前順序':''}</p><details><summary>查看建議依據</summary><p>規則分數＝有效預購人數 × 6＋曾加購人數 × 3＋瀏覽人數（最多 10 分）；同分保留目前順序，每第 5 個位置優先保留一款尚無訊號的商品</p><p>分數是整理依據，不是成交機率；加購不代表購物車現況，未瀏覽也不代表沒興趣</p></details><div class="merch-status" role="status">${data.settings.version?'已套用版本 '+data.settings.version:'尚未設定自訂順序'}${changed?' · 草稿有變更，客戶頁尚未改變':''}</div></section><div class="merch-toolbar"><label class="field">觀察期間<select id="merch-days">${[7,30,180].map(n=>`<option value="${n}" ${days===n?'selected':''}>最近 ${n} 天</option>`).join('')}</select></label><button class="button light" data-merch="suggest">載入資料建議</button><button class="button light" data-merch="current">使用目前排序</button><button class="button light" data-merch="original">使用上架順序</button>${data.settings.version?'<button class="button light" data-merch="previous">載入上次排序</button>':''}</div><p class="browse-note">調整的是所有客戶共同的商品順序，分類與搜尋保留相對順序；新上架商品接在後面</p><div class="merch-apply"><span>${changed?'套用後，客戶下次載入選物頁就會使用此順序':'查看與調整草稿後，再決定是否套用'}</span><button class="button" data-merch="apply" ${!changed||busy?'disabled':''}>${busy?'正在套用…':'套用此順序到客戶頁'}</button></div><ol class="merch-list">${draft.slice(0,limit).map((id,index)=>{
      const p=data.rows.find(p=>p.productId===id),suggested=data.suggestedIds.indexOf(id)+1;
      return `<li class="panel merch-row"><div class="merch-position">${index+1}</div>${p.image?`<img src="${esc(p.image)}" alt="" loading="lazy">`:''}<div class="merch-product"><strong>${esc(p.code+' '+p.name)}</strong><small>${esc(p.category)} · 目前第 ${p.currentPosition} 位 · 建議第 ${suggested} 位</small><p>${esc(p.reason)}</p><small>規則分數 ${p.score} · 本期預購 ${p.quantity} 件</small></div><div class="merch-move"><button class="button light" data-merch="up" data-id="${id}" aria-label="上移 ${esc(p.code)}" ${index===0?'disabled':''}>上移</button><button class="button light" data-merch="down" data-id="${id}" aria-label="下移 ${esc(p.code)}" ${index===draft.length-1?'disabled':''}>下移</button><button class="text-button" data-merch="top" data-id="${id}" ${index===0?'disabled':''}>置頂</button></div></li>`;
    }).join('')||'<li class="panel empty">上架商品後即可調整排序</li>'}</ol>${draft.length>limit?'<button class="button light" data-merch="more">顯示更多商品</button>':''}<p class="browse-note">已顯示 ${Math.min(limit,draft.length)}／${draft.length} 款，套用包含全部上架商品</p><p class="error" id="merch-error" role="alert"></p>`;
    root.querySelector('#merch-days').addEventListener('change',event=>{
      if(dirty()&&!window.confirm('排序草稿尚未套用，要放棄草稿並更新期間嗎？')){event.target.value=String(days);return;}
      days=Number(event.target.value);void load();
    });
  }
  async function load(){
    const current=++sequence;busy=true;
    root.innerHTML='<div class="loading">正在整理商品排序建議…</div>';
    try{
      const result=await request('admin/merchandising?days='+days);
      if(!root.isConnected||current!==sequence)return;
      data=result;draft=[...data.currentIds];busy=false;render();
    }catch(error){
      if(!root.isConnected||current!==sequence)return;
      busy=false;root.innerHTML=`<div class="panel empty"><p>${esc(error.message)}</p><button class="button light" data-merch="refresh">重新讀取</button></div>`;
    }
  }
  root.addEventListener('click',async event=>{
    const button=event.target.closest('[data-merch]');if(!button||busy)return;
    const action=button.dataset.merch,id=Number(button.dataset.id),index=draft.indexOf(id);
    if(action==='refresh'){
      if(dirty()&&!window.confirm('排序草稿尚未套用，要放棄草稿並更新資料嗎？'))return;
      void load();return;
    }
    if(!data)return;
    if(action==='more')limit+=24;
    if(action==='suggest')draft=[...data.suggestedIds];
    if(action==='current')draft=[...data.currentIds];
    if(action==='original')draft=[...data.originalIds];
    if(action==='previous')draft=ordered(data.originalIds,data.settings.previousIds);
    if(action==='up'&&index>0)[draft[index-1],draft[index]]=[draft[index],draft[index-1]];
    if(action==='down'&&index>=0&&index<draft.length-1)[draft[index+1],draft[index]]=[draft[index],draft[index+1]];
    if(action==='top'&&index>0)draft.unshift(...draft.splice(index,1));
    if(action==='apply'&&dirty()){
      busy=true;render();
      try{
        const result=await request('admin/product-order',{method:'PUT',body:{version:data.settings.version,productIds:draft}});
        data.settings=result.settings;data.currentIds=[...draft];
        data.rows.forEach(p=>p.currentPosition=draft.indexOf(p.productId)+1);
        toast('商品順序已套用到客戶頁');
      }catch(error){
        busy=false;render();root.querySelector('#merch-error').textContent=error.message;return;
      }
      busy=false;
    }
    render();
    if(['up','down','top'].includes(action))root.querySelector(`[data-merch="${action}"][data-id="${id}"]`)?.focus({preventScroll:true});
  });
  void load();
  return {dirty,canLeave(){
    if(busy){toast('請等商品排序處理完成');return false;}
    return !dirty()||window.confirm('排序草稿尚未套用，要放棄草稿並離開嗎？');
  }};
}
