import { costTotal, unitCostTwd, costSummary } from '../shared/costing.js';

// Used by both SQLite and the Edge Function. Callers must authorize the owner.
export function reportSheets(campaign, orders, report, settings = {}, at = new Date().toISOString()) {
  const costCells = (cost, quantity) => [cost?.unitKrw ?? '', cost?.exchangeRate ?? '', unitCostTwd(cost) ?? '',
    cost ? cost.unitKrw * quantity : '', costTotal(cost, quantity) ?? '', cost ? '已記錄' : '未填進價'];
  const customerRows = [['活動','預購編號','LINE 暱稱','聯絡姓名','手機','商品編號','商品名稱','規格','數量','售價單價（台幣快照）','售價小計（台幣）','分配買到','分配缺貨','收件資料','匯出時間','單件進價（韓幣）','採用匯率（1 韓元＝台幣）','單件進價（台幣）','需求進價小計（韓幣）','需求進價小計（台幣）','進價狀態']];
  for (const o of orders) for (const i of o.items) {
    const cost = report.find(r => r.variant_id === i.variant_id)?.cost;
    customerRows.push([campaign.name,o.code,o.customer.display_name,o.name,o.phone,i.product_code,i.product_name,
      i.color+' / '+i.size,i.quantity,i.price,i.quantity*i.price,i.bought,i.shortage,o.customer.delivery,at,...costCells(cost,i.quantity)]);
  }
  const reportRows = [['活動','商品編號','商品名稱','顏色','尺寸／規格','需求','已買','待採買','確認缺貨','未分配已買','備註','匯出時間','單件進價（韓幣）','採用匯率（1 韓元＝台幣）','單件進價（台幣）','需求進價小計（韓幣）','需求進價小計（台幣）','進價狀態','已買進價小計（韓幣）','已買進價小計（台幣）','預購售價最低（台幣快照）','預購售價最高（台幣快照）','預購售價合計（台幣）'],
    ...report.map(r => [campaign.name,r.code,r.name,r.color,r.size,r.demand,r.bought,r.remaining,r.shortage,r.unallocated,r.note,at,
      ...costCells(r.cost,r.demand),r.cost ? r.cost.unitKrw*r.bought : '',costTotal(r.cost,r.bought) ?? '',r.priceMin,r.priceMax,r.salesTotal])];
  const totals = costSummary(report);
  const summaryRows = [['項目','金額／數量','說明'],['活動',campaign.name,''],['匯出時間',at,''],
    ['目前預設匯率',settings.exchangeRate ?? '未設定','1 韓元等於多少台幣；各筆採用匯率見明細'],
    ['預購售價合計（台幣）',totals.salesTotal,'所有有效預購的售價快照合計，非實收款'],
    ['需求進價已填小計（韓幣）',totals.demandKrw,'韓幣單件進價 × 有效需求'],
    ['需求進價已填小計（台幣）',totals.demandTwd,'台幣單件進價 × 有效需求'],
    ['未填進價需求件數',totals.missingDemand,totals.missingDemand ? '進價尚未齊全，小計不代表全部成本' : '進價已填齊'],
    ['已買進價已填小計（韓幣）',totals.boughtKrw,'韓幣單件進價 × 累計已買'],
    ['已買進價已填小計（台幣）',totals.boughtTwd,'台幣單件進價 × 累計已買'],
    ['未填進價已買件數',totals.missingBought,totals.missingBought ? '已買成本尚未齊全' : '已買進價已填齊'],
    ['換算規則','單件台幣四捨五入至小數 2 位後乘件數','需求進價含待採買及缺貨需求；已買進價依累計已買，未含運費或其他費用']];
  return [{name:'客戶預購明細',rows:customerRows},{name:'採買彙總',rows:reportRows},{name:'進銷總覽',rows:summaryRows}];
}
