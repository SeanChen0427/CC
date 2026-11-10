import { parseSizes } from './product-pricing.js?v=0.3.26';

const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[ch]);

export function mountSizePricing(root, {sizesInput, priceInput, sizeSurcharges = []}) {
  const amounts = new Map(sizeSurcharges.map(entry => [entry.size, entry.extra]));
  function refreshTotals() {
    for (const row of root.querySelectorAll('[data-size]')) {
      const base = Number(priceInput.value), extra = Number(row.querySelector('input').value);
      row.querySelector('output').textContent = Number.isSafeInteger(base + extra) && base > 0 && extra >= 0
        ? '售價 NT$ ' + (base + extra).toLocaleString('en-US') : '請填有效金額';
    }
  }
  function render() {
    const sizes = parseSizes(sizesInput.value);
    root.innerHTML = `<h3>各尺寸加價</h3><p>需要加價的尺寸填入金額，不加價填 0，尺寸新增或調整後會同步顯示</p><div class="size-pricing-grid">${sizes.map(size => `<label class="size-price-field" data-size="${esc(size)}"><span>${esc(size)}</span><input type="number" min="0" max="100000" step="1" required value="${esc(amounts.get(size) ?? 0)}" aria-label="${esc(size)} 加價金額"><output></output></label>`).join('') || '<p>請先填寫尺寸／規格</p>'}</div>`;
    refreshTotals();
  }
  root.addEventListener('input', event => {
    const row = event.target.closest('[data-size]');
    if (!row) return;
    amounts.set(row.dataset.size, event.target.value);
    refreshTotals();
  });
  sizesInput.addEventListener('input', render);
  priceInput.addEventListener('input', refreshTotals);
  render();
  return {
    draft() { return parseSizes(sizesInput.value).map(size => ({size,extra:amounts.get(size) ?? 0})); },
    value() { return parseSizes(sizesInput.value).map(size => ({size,extra:Number(amounts.get(size) || 0)})).filter(entry => entry.extra > 0); },
  };
}
