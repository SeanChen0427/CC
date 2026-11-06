import { AppError, text, integer } from './validation.mjs';

export function validateOrderDeletion(order, items, procurement, input) {
  if (!order) throw new AppError('找不到這份預購', 404);
  if (text(input.confirmCode, '確認預購編號', 40) !== order.code) throw new AppError('預購編號不相符，尚未刪除');
  const reason = text(input.reason, '刪除原因', 300);
  integer(input.version, '預購版本', Number.MAX_SAFE_INTEGER);
  if (order.deleted_at) return reason; // A retry cannot delete a later replacement order.
  if (input.version !== order.version) throw new AppError('預購已更新，請重新開啟明細後再確認刪除', 409);
  const variants = new Set(items.filter(i => i.quantity > 0).map(i => i.variant_id));
  if (items.some(i => i.bought || i.shortage) || procurement.some(r => variants.has(r.variant_id) && (r.bought || r.shortage))) {
    throw new AppError('這份預購包含已有採購、缺貨或分配紀錄的規格，請先處理採購與分配再刪除', 409);
  }
  return reason;
}
