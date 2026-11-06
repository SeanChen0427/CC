import { productCostState } from './product-costing.js?v=0.3.14';
import { unitCostTwd } from './costing.js?v=0.3.14';

const esc = value => String(value ?? '').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[ch]);
const money = value => 'NT$ '+value.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});

export function mountProductCost(root, {variants = [], exchangeRate, draft}) {
  const current=productCostState(variants),cost=current.commonCost;
  const initialUnitKrw=draft?.initialUnitKrw ?? String(cost?.unitKrw ?? '');
  const initialExchangeRate=draft?.initialExchangeRate ?? String(cost?.exchangeRate ?? exchangeRate ?? '');
  const versions=draft?.versions ?? current.versions;
  let clearMixed=draft?.clearMixed === true;
  root.innerHTML=`<h3>商品進價（選填）</h3><div class="form-grid"><label class="field">韓幣單件進價<input name="purchaseUnitKrw" type="number" inputmode="numeric" min="0" max="100000000" step="1" placeholder="可留白，之後再填"></label><div class="field">台幣單件進價<output class="cost-output" aria-live="polite"></output></div></div><label class="field">換算匯率（1 韓元＝台幣）<input name="purchaseExchangeRate" type="number" inputmode="decimal" min="0.000001" max="10" step="0.000001" placeholder="例如 0.024"></label><button class="text-button current-product-rate" type="button">改用目前設定匯率</button><p class="settings-foot">進價可留白，填寫後套用此商品各規格，與採買清單同步</p><p class="settings-foot">在此修改匯率會一併更新預設，其他商品已保存的匯率不變</p>${current.mixed?`<details class="product-cost-details"><summary>各規格進價不同，未修改時保留原價</summary><ul>${current.entries.filter(v=>v.active).map(v=>`<li>${esc(v.color)}／${esc(v.size)}：${v.cost?'₩ '+v.cost.unitKrw.toLocaleString('en-US')+' ／ '+money(unitCostTwd(v.cost)):'未填'}</li>`).join('')}</ul><button class="text-button clear-product-cost" type="button">清除全部規格進價</button></details>`:''}`;
  const unit=root.querySelector('[name="purchaseUnitKrw"]'),rate=root.querySelector('[name="purchaseExchangeRate"]');
  unit.value=draft?.unitKrw ?? initialUnitKrw;
  rate.value=draft?.exchangeRate ?? initialExchangeRate;
  const currentRate=root.querySelector('.current-product-rate');
  function update(){
    const valid=unit.value!==''&&Number.isSafeInteger(Number(unit.value))&&Number(unit.value)>=0&&Number(unit.value)<=100000000;
    const validRate=Number(rate.value)>0&&Number(rate.value)<=10&&/^\d+(\.\d{1,6})?$/.test(rate.value);
    root.querySelector('output').textContent=valid&&validRate?money(unitCostTwd({unitKrw:Number(unit.value),exchangeRate:Number(rate.value)})):valid?'填入匯率後換算':'—';
    currentRate.hidden=!exchangeRate||Number(rate.value)===exchangeRate;
  }
  root.addEventListener('input',update);
  currentRate.addEventListener('click',()=>{rate.value=exchangeRate;rate.dispatchEvent(new Event('input',{bubbles:true}));});
  root.querySelector('.clear-product-cost')?.addEventListener('click',()=>{clearMixed=true;unit.value='';unit.dispatchEvent(new Event('input',{bubbles:true}));});
  update();
  return {
    draft:()=>({unitKrw:unit.value,exchangeRate:rate.value,initialUnitKrw,initialExchangeRate,versions,clearMixed}),
    value(){
      const costChanged=clearMixed||unit.value!==initialUnitKrw||(unit.value!==''&&rate.value!==initialExchangeRate);
      const rateChanged=rate.value!==''&&rate.value!==initialExchangeRate&&Number(rate.value)!==exchangeRate;
      if(!costChanged&&!rateChanged)return {};
      const costUpdate={};
      if(rateChanged)costUpdate.defaultExchangeRate=Number(rate.value);
      if(costChanged){
        if(unit.value==='')costUpdate.cost=null;
        else {
          if(!rate.value)throw new Error('請在商品進價區填寫換算匯率，或將進價留白');
          costUpdate.cost={unitKrw:Number(unit.value),exchangeRate:Number(rate.value)};
        }
        costUpdate.versions=versions;
      }
      return {costUpdate};
    },
  };
}
