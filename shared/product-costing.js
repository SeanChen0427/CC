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

// Use the most frequent existing cost as the editor's common value. Size edits
// remain explicit patches, so an untouched mixed color/size keeps its own cost.
export function sizeCostState(variants) {
  const active = variants.filter(v => v.active), counts = [];
  for (const variant of active) {
    let group = counts.find(entry => sameCost(entry.cost, variant.cost));
    if (!group) { group = {cost:variant.cost || null,count:0}; counts.push(group); }
    group.count++;
  }
  const baseCost = counts.sort((a,b) => b.count-a.count)[0]?.cost || null;
  const sizes = [...new Set(active.map(v => v.size))].map(size => {
    const entries = active.filter(v => v.size === size), first = entries[0].cost || null;
    const mixed = entries.some(v => !sameCost(v.cost,first));
    return {size,cost:mixed ? null : first,mixed};
  });
  return {baseCost,sizes};
}
