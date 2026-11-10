import { unitCostTwd, costTotal } from './costing.js?v=0.3.28';

const twd = value => 'NT$ ' + value.toLocaleString('en-US', {minimumFractionDigits:2,maximumFractionDigits:2});

export function mountPurchaseCost(root, {cost, exchangeRate, demand, boughtInput}) {
  let rate = cost?.exchangeRate ?? exchangeRate;
  root.innerHTML = `<h3>進價紀錄</h3><div class="form-grid"><label class="field">韓幣單件進價<input name="unitKrw" type="number" inputmode="numeric" min="0" max="100000000" step="1" placeholder="尚未填寫" value="${cost?.unitKrw ?? ''}"></label><div class="field">台幣單件進價<output class="cost-output" aria-live="polite"></output></div></div><div class="cost-rate"></div><button class="text-button current-rate" type="button">改用目前設定匯率</button><p class="settings-foot cost-subtotal" aria-live="polite"></p><p class="settings-foot">此規格的累計採買使用同一單件進價，留白表示尚未記錄</p>`;
  const input = root.querySelector('input'), output = root.querySelector('output');
  const current = root.querySelector('.current-rate');
  function update() {
    const valid = input.value !== '' && Number.isSafeInteger(Number(input.value)) && Number(input.value) >= 0 && Number(input.value) <= 100000000;
    const value = valid && rate ? {unitKrw:Number(input.value),exchangeRate:rate} : null;
    output.textContent = value ? twd(unitCostTwd(value)) : '—';
    root.querySelector('.cost-rate').textContent = rate ? `採用匯率：1 韓元＝${rate} 台幣` : '請先到「活動與設定」填寫匯率';
    current.hidden = !exchangeRate || rate === exchangeRate;
    const bought = Number(boughtInput.value);
    root.querySelector('.cost-subtotal').textContent = value && Number.isSafeInteger(bought) && bought >= 0
      ? `需求 ${demand} 件進價 ${twd(costTotal(value,demand))} · 已買 ${bought} 件進價 ${twd(costTotal(value,bought))}`
      : '填入韓幣進價後，自動換算台幣';
  }
  input.addEventListener('input',update);
  boughtInput.addEventListener('input',update);
  current.addEventListener('click',()=>{rate=exchangeRate;update();});
  update();
  return {value() {
    if (input.value === '') return null;
    if (!rate) throw new Error('請先在活動與設定填寫匯率，再記錄進價');
    return {unitKrw:Number(input.value),exchangeRate:rate};
  }};
}
