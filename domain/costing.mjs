import { AppError, integer } from './validation.mjs';

export function validateExchangeRate(value) {
  if ((typeof value !== 'number' && typeof value !== 'string') ||
      !/^\d+(\.\d{1,6})?$/.test(String(value).trim())) throw new AppError('匯率請填正數，最多 6 位小數');
  const rate = Number(value);
  if (!Number.isFinite(rate) || rate <= 0 || rate > 10) throw new AppError('匯率需大於 0 且不超過 10');
  return rate;
}

export function validateCost(input, previous, settings = {}) {
  if (input === undefined) return previous || null; // Older clients must preserve private costs.
  if (input === null) return null;
  if (typeof input !== 'object' || Array.isArray(input)) throw new AppError('進價格式無效');
  const unitKrw = integer(input.unitKrw, '韓幣單件進價', 100000000);
  const exchangeRate = validateExchangeRate(input.exchangeRate);
  if (exchangeRate !== settings.exchangeRate && exchangeRate !== previous?.exchangeRate) {
    throw new AppError('匯率設定已變更，請重新整理後記錄進價', 409);
  }
  return { unitKrw, exchangeRate };
}
