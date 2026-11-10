import { AppError, integer } from './validation.mjs';

export function browsingControlInput(body) {
  if (typeof body.customerId !== 'string' || !body.customerId.trim() || body.customerId.length > 160) throw new AppError('請選擇要管理的客戶');
  integer(body.version, '瀏覽設定版本', Number.MAX_SAFE_INTEGER);
  if (!['clear', 'exclusion'].includes(body.action)) throw new AppError('瀏覽管理操作無效');
  if (body.action === 'clear' && body.confirm !== true) throw new AppError('請先確認要清除此帳號的瀏覽紀錄');
  if (body.action === 'exclusion' && typeof body.excluded !== 'boolean') throw new AppError('請確認是否排除瀏覽統計');
  return {customerId:body.customerId, version:body.version, action:body.action, confirm:body.confirm === true, excluded:body.action === 'exclusion' ? body.excluded : null};
}

export function acceptsBrowsing(row, control) {
  return !control?.excluded && (!control?.accept_after || Date.parse(row.at) > Date.parse(control.accept_after));
}
