import { AppError, integer } from './validation.mjs';
import { validateCost, validateExchangeRate } from './costing.mjs';
import { productCostState, sameCost } from '../shared/product-costing.js';

export function planProductCosts(update, variants, records, settings = {}, sizes = []) {
  const current = productCostState(variants, records);
  const inheritBySize = new Map([...new Set(current.entries.filter(v=>v.active).map(v=>v.size))].map(size=>{
    const entries=current.entries.filter(v=>v.active && v.size===size),first=entries[0].cost;
    return [size,entries.every(v=>sameCost(v.cost,first))?first:null];
  }));
  const plan = {hasCost:false,inherit:current.commonCost,inheritBySize,bySize:new Map()};
  if (update === undefined) return plan;
  if (!update || typeof update !== 'object' || Array.isArray(update)) throw new AppError('商品進價設定無效');
  const rate = update.defaultExchangeRate === undefined ? undefined : validateExchangeRate(update.defaultExchangeRate);
  const hasCost = Object.hasOwn(update, 'cost');
  const sizeCosts = update.sizeCosts === undefined ? [] : update.sizeCosts;
  if (!Array.isArray(sizeCosts) || sizeCosts.length > 12) throw new AppError('尺寸進價設定無效');
  if (!hasCost && !sizeCosts.length) return {...plan,rate};
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
  const effectiveSettings = rate === undefined ? settings : {exchangeRate:rate};
  const bySize = new Map();
  for (const entry of sizeCosts) {
    if (!entry || !sizes.includes(entry.size) || bySize.has(entry.size) || !Object.hasOwn(entry,'cost') || entry.cost === undefined) throw new AppError('尺寸進價需對應目前尺寸，且不可重複');
    const previous = current.entries.find(v => v.cost?.exchangeRate === entry.cost?.exchangeRate)?.cost;
    bySize.set(entry.size,validateCost(entry.cost,previous,effectiveSettings));
  }
  const previous = current.entries.find(v => v.cost?.exchangeRate === update.cost?.exchangeRate)?.cost;
  const cost = hasCost ? validateCost(update.cost,previous,effectiveSettings) : undefined;
  return {...plan,hasCost,cost,rate,bySize};
}

export function costForProductVariant(plan, size, isNew) {
  if (plan.bySize.has(size)) return plan.bySize.get(size);
  if (plan.hasCost) return plan.cost;
  if (isNew) return (plan.inheritBySize.has(size) ? plan.inheritBySize.get(size) : plan.inherit) || undefined;
  return undefined;
}
