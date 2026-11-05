export class AppError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

export function text(value, label, max = 150) {
  const result = typeof value === 'string' ? value.trim() : '';
  if (!result || result.length > max) throw new AppError(`請填寫有效的${label}`);
  return result;
}

export function integer(value, label, max = 999, min = 0) {
  if (!Number.isSafeInteger(value) || value < min || value > max) {
    throw new AppError(`${label}需為 ${min}～${max} 的整數`);
  }
  return value;
}

export function assertOpen(campaign, now = Date.now()) {
  if (campaign.status !== 'open' || new Date(campaign.closesAt).getTime() <= now) {
    throw new AppError('本期已結單，暫時無法新增或修改預購。', 409);
  }
}

export function contact(input) {
  const name = text(input.name, '聯絡姓名', 40);
  const phone = text(input.phone, '手機', 30).replace(/[\s-]/g, '');
  if (!/^09\d{8}$/.test(phone)) throw new AppError('請填寫 09 開頭的 10 位手機號碼');
  return { name, phone };
}

export function validateProcurement({ demand, bought, shortage, allocatedBought = 0, allocatedShortage = 0 }) {
  integer(bought, '已買數量', 99999);
  integer(shortage, '缺貨數量', 99999);
  if (bought < allocatedBought || shortage < allocatedShortage) {
    throw new AppError('數量小於已分配結果，請先調整客戶分配。', 409);
  }
  if (shortage > Math.max(demand - bought, 0)) throw new AppError('確認缺貨不能超過尚未買到的需求');
}

export function csvRows(source) {
  const rows = [];
  let row = [], cell = '', quoted = false;
  const value = source.replace(/^\uFEFF/, '');
  for (let i = 0; i < value.length; i++) {
    const ch = value[i];
    if (ch === '"') {
      if (quoted && value[i + 1] === '"') { cell += '"'; i++; }
      else quoted = !quoted;
    } else if (ch === ',' && !quoted) {
      row.push(cell); cell = '';
    } else if ((ch === '\n' || ch === '\r') && !quoted) {
      if (ch === '\r' && value[i + 1] === '\n') i++;
      row.push(cell);
      if (row.some(v => v.trim())) rows.push(row);
      row = []; cell = '';
    } else cell += ch;
  }
  if (quoted) throw new AppError('CSV 引號未閉合');
  row.push(cell);
  if (row.some(v => v.trim())) rows.push(row);
  if (rows.length < 2) throw new AppError('請提供欄位標題及至少一筆商品');
  if (rows.length > 501) throw new AppError('一次最多匯入 500 筆');
  return rows;
}
