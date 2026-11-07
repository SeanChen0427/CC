import { productCostState, sameCost, sizeCostState } from './product-costing.js?v=0.3.16';
import { unitCostTwd } from './costing.js?v=0.3.16';
import { parseSizes } from './product-pricing.js?v=0.3.16';

const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[ch]);
const money = value => 'NT$ '+value.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});

export function mountProductCost(root, {variants = [], exchangeRate, sizesInput, draft}) {
  const current=productCostState(variants),state=sizeCostState(variants),cost=state.baseCost;
  const initialUnitKrw=draft?.initialUnitKrw ?? String(cost?.unitKrw ?? '');
  const initialExchangeRate=draft?.initialExchangeRate ?? String(cost?.exchangeRate ?? exchangeRate ?? '');
  const initialSizeCosts=draft?.initialSizeCosts ?? state.sizes.map(row=>({size:row.size,unitKrw:!row.mixed&&!sameCost(row.cost,cost)?String(row.cost?.unitKrw ?? ''):''}));
  const amounts=new Map((draft?.sizeCosts ?? initialSizeCosts).map(row=>[row.size,row.unitKrw]));
  const versions=draft?.versions ?? current.versions,events=new AbortController();
  let clearMixed=draft?.clearMixed === true;
  root.innerHTML=`<h3>商品進價（選填）</h3><div class="form-grid"><label class="field">共用韓幣單件進價<input name="purchaseUnitKrw" type="number" inputmode="numeric" min="0" max="100000000" step="1" placeholder="可留白，之後再填"></label><div class="field">台幣單件進價<output class="cost-output common-cost-output" aria-live="polite"></output></div></div><label class="field">換算匯率（1 韓元＝台幣）<input name="purchaseExchangeRate" type="number" inputmode="decimal" min="0.000001" max="10" step="0.000001" placeholder="例如 0.024"></label><button class="text-button current-product-rate" type="button">改用目前設定匯率</button><p class="settings-foot">先填共用進價，只有不同的尺寸才另外填完整韓幣進價，與採買清單同步</p><details class="product-cost-details size-cost-details"><summary>個別尺寸進價（選填）</summary><p class="settings-foot">留白沿用共用進價，填 0 表示零元；已保存的不同進價與匯率，未修改時保留</p><div class="size-cost-grid"></div></details><p class="settings-foot">修改匯率會一併更新預設，其他商品已保存的匯率不變</p><button class="text-button clear-product-cost" type="button">清除全部規格進價</button>`;
  const unit=root.querySelector('[name="purchaseUnitKrw"]'),rate=root.querySelector('[name="purchaseExchangeRate"]');
  unit.value=draft?.unitKrw ?? initialUnitKrw;
  rate.value=draft?.exchangeRate ?? initialExchangeRate;
  const sizes=()=>parseSizes(sizesInput.value),initialAmount=size=>initialSizeCosts.find(row=>row.size===size)?.unitKrw ?? '';
  const currentRate=root.querySelector('.current-product-rate');
  const rateChanged=()=>rate.value!==initialExchangeRate;
  const baseChanged=()=>clearMixed||unit.value!==initialUnitKrw||(unit.value!==''&&rateChanged());
  function costValue(raw) {
    if(raw==='')return null;
    if(!Number.isSafeInteger(Number(raw))||Number(raw)<0||Number(raw)>100000000)throw new Error('韓幣進價請填 0～100000000 的整數');
    if(!rate.value)throw new Error('請在商品進價區填寫換算匯率，或將進價留白');
    return {unitKrw:Number(raw),exchangeRate:Number(rate.value)};
  }
  function preview(size) {
    if(clearMixed)return null;
    const raw=amounts.get(size) ?? '',saved=state.sizes.find(row=>row.size===size);
    if(raw!==initialAmount(size)||rateChanged()||(!raw&&baseChanged())||!saved)return costValue(raw||unit.value);
    return saved.mixed ? 'mixed' : saved.cost;
  }
  function update(){
    try{const value=costValue(unit.value);root.querySelector('.common-cost-output').textContent=value?money(unitCostTwd(value)):'—';}
    catch{root.querySelector('.common-cost-output').textContent=unit.value?'填入有效進價及匯率後換算':'—';}
    currentRate.hidden=!exchangeRate||Number(rate.value)===exchangeRate;
    for(const row of root.querySelectorAll('[data-cost-size]')){
      try{const value=preview(row.dataset.costSize);row.querySelector('output').textContent=value==='mixed'?'各顏色進價不同，未修改時保留':value?money(unitCostTwd(value)):'未填進價';}
      catch{row.querySelector('output').textContent='填入有效進價及匯率後換算';}
    }
  }
  function render(){
    root.querySelector('.size-cost-grid').innerHTML=sizes().map(size=>{
      const saved=state.sizes.find(row=>row.size===size),raw=amounts.get(size) ?? '';
      return `<label class="size-price-field" data-cost-size="${esc(size)}"><span>${esc(size)} 韓幣進價</span><input type="number" inputmode="numeric" min="0" max="100000000" step="1" value="${esc(raw)}" placeholder="${saved?.mixed?'未修改保留各顏色進價':saved&&!saved.cost?'未填進價':'同共用進價'}" aria-label="${esc(size)} 韓幣進價"><output></output></label>`;
    }).join('')||'<p>請先填寫尺寸／規格</p>';
    update();
  }
  root.querySelector('.size-cost-details').open=initialSizeCosts.some(row=>row.unitKrw!=='')||state.sizes.some(row=>row.mixed||!sameCost(row.cost,cost))||[...amounts.values()].some(value=>value!=='');
  root.addEventListener('input',event=>{
    const row=event.target.closest('[data-cost-size]');
    if(row)amounts.set(row.dataset.costSize,event.target.value);
    if(event.target!==root)clearMixed=false;update();
  },{signal:events.signal});
  sizesInput.addEventListener('input',render,{signal:events.signal});
  currentRate.addEventListener('click',()=>{rate.value=exchangeRate;rate.dispatchEvent(new Event('input',{bubbles:true}));},{signal:events.signal});
  root.querySelector('.clear-product-cost').addEventListener('click',()=>{
    unit.value='';for(const size of sizes())amounts.set(size,'');render();clearMixed=true;update();root.dispatchEvent(new Event('input',{bubbles:true}));clearMixed=true;
  },{signal:events.signal});
  render();
  return {
    dispose:()=>events.abort(),
    draft:()=>({unitKrw:unit.value,exchangeRate:rate.value,initialUnitKrw,initialExchangeRate,versions,clearMixed,sizeCosts:[...amounts].map(([size,unitKrw])=>({size,unitKrw})),initialSizeCosts}),
    value(){
      const sizeCosts=[];
      for(const size of sizes()){
        const raw=amounts.get(size) ?? '',saved=state.sizes.find(row=>row.size===size),changed=raw!==initialAmount(size);
        if(clearMixed){sizeCosts.push({size,cost:null});continue;}
        if(saved?.mixed&&!changed)continue;
        if(raw!==''){
          if(changed||rateChanged()||!saved)sizeCosts.push({size,cost:costValue(raw)});
        }else if(changed||baseChanged()||(!saved&&unit.value!==''))sizeCosts.push({size,cost:costValue(unit.value)});
      }
      const defaultChanged=rate.value!==''&&rateChanged()&&Number(rate.value)!==exchangeRate;
      if(!sizeCosts.length&&!defaultChanged)return {};
      const costUpdate={};
      if(defaultChanged)costUpdate.defaultExchangeRate=Number(rate.value);
      if(sizeCosts.length){costUpdate.sizeCosts=sizeCosts;costUpdate.versions=versions;}
      return {costUpdate};
    },
  };
}
