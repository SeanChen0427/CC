import { AppError } from './validation.mjs';

export function promotionSettings(value) {
  return value || { enabled:false, text:'', version:0 };
}

export function publicPromotion(value) {
  return value?.enabled === true && value.text ? { text:value.text } : null;
}

export function planPromotion(input, current) {
  const previous=promotionSettings(current);
  if (!Number.isSafeInteger(input.version) || input.version !== previous.version) {
    throw new AppError('優惠資訊已在其他畫面更新，請重新整理後再儲存',409);
  }
  if (typeof input.enabled !== 'boolean' || typeof input.text !== 'string') {
    throw new AppError('請確認優惠文字與顯示設定');
  }
  const text=input.text.replace(/\s+/g,' ').trim();
  if (text.length > 120) throw new AppError('優惠文字最多 120 字');
  if (input.enabled && !text) throw new AppError('開啟顯示前請先填寫優惠文字');
  return { enabled:input.enabled, text, version:previous.version+1 };
}
