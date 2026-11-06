import { AppError, integer } from './validation.mjs';
import { validateCost, validateExchangeRate } from './costing.mjs';
import { productCostState } from '../shared/product-costing.js';

export function planProductCosts(update, variants, records, settings = {}) {
  const current = productCostState(variants, records);
  if (update === undefined) return { hasCost:false, inherit:current.commonCost };
  if (!update || typeof update !== 'object' || Array.isArray(update)) throw new AppError('商品進價設定無效');
  const rate = update.defaultExchangeRate === undefined ? undefined : validateExchangeRate(update.defaultExchangeRate);
  const hasCost = Object.hasOwn(update, 'cost');
  if (!hasCost) return { hasCost:false, inherit:current.commonCost, rate };
  if (!Array.isArray(update.versions) || update.versions.length !== current.versions.length) throw new AppError('進價已更新，請載入最新進價後再確認儲存',409);
  const seen = new Set();
  for (const entry of update.versions) {
    integer(entry?.variantId, '進價規格識別', 1000000, 1);
    integer(entry?.version, '進價版本', Number.MAX_SAFE_INTEGER);
    if (seen.has(entry.variantId) || !current.versions.some(v => v.variantId === entry.variantId && v.version === entry.version)) {
      throw new AppError('進價已更新，請載入最新進價後再確認儲存',409);
    }
    seen.add(entry.variantId);
  }
  const previous = current.entries.find(v => v.cost?.exchangeRate === update.cost?.exchangeRate)?.cost;
  const cost = validateCost(update.cost, previous, rate === undefined ? settings : {exchangeRate:rate});
  return { hasCost:true, cost, rate };
}
