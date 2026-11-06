// Rates use at most six decimals. Round the unit cost to TWD cents, then multiply.
export function unitCostCents(cost) {
  if (!cost) return null;
  const micros = Math.round(cost.exchangeRate * 1000000);
  return Number((BigInt(cost.unitKrw) * BigInt(micros) + 5000n) / 10000n);
}

export const unitCostTwd = cost => cost ? unitCostCents(cost) / 100 : null;
export const costTotal = (cost, quantity) => cost ? unitCostCents(cost) * quantity / 100 : null;

export function costSummary(rows) {
  const sum = (quantity, currency) => rows.reduce((total, row) => total + (row.cost
    ? (currency === 'krw' ? row.cost.unitKrw : unitCostCents(row.cost)) * row[quantity] : 0), 0);
  return {
    demandKrw: sum('demand', 'krw'), demandTwd: sum('demand', 'twd') / 100,
    boughtKrw: sum('bought', 'krw'), boughtTwd: sum('bought', 'twd') / 100,
    salesTotal: rows.reduce((total, row) => total + row.salesTotal, 0),
    missingDemand: rows.reduce((total, row) => total + (row.cost ? 0 : row.demand), 0),
    missingBought: rows.reduce((total, row) => total + (row.cost ? 0 : row.bought), 0),
  };
}
