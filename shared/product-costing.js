export const sameCost = (a, b) => (a?.unitKrw ?? null) === (b?.unitKrw ?? null) && (a?.exchangeRate ?? null) === (b?.exchangeRate ?? null);

export function productCostState(variants, records) {
  const entries = variants.map(v => {
    const row = records?.find(r => r.variant_id === v.id);
    return { variantId:v.id, color:v.color, size:v.size, active:v.active, cost:records ? row?.cost || null : v.cost || null, version:records ? row?.version || 0 : v.costVersion || 0 };
  });
  const active = entries.filter(v => v.active);
  const first = active[0]?.cost || null;
  const mixed = active.some(v => !sameCost(v.cost, first));
  return { commonCost:mixed ? null : first, mixed, entries, versions:entries.map(v => ({variantId:v.variantId,version:v.version})) };
}
