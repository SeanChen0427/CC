import { youtubeVideo } from '../shared/youtube.js';

export class AppError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

export function productVideoUrl(value) {
  if (value === undefined) return undefined;
  if (typeof value === 'string' && !value.trim()) return '';
  const video = youtubeVideo(value);
  if (!video) throw new AppError('商品影片請貼完整的 YouTube 或 Shorts HTTPS 連結');
  return video.url;
}

export function productVideoLayout(value) {
  if (value === undefined) return undefined;
  if (!['vertical', 'horizontal'].includes(value)) throw new AppError('影片比例請選直式或橫式');
  return value;
}

export function productSourceUrl(value) {
  if (value === undefined) return undefined;
  if (typeof value !== 'string') throw new AppError('韓國商品連結請填完整的 http 或 https 網址');
  const url = value.trim();
  if (!url) return '';
  if (url.length > 2048 || /[\u0000-\u0020\u007f]/.test(url)) throw new AppError('韓國商品連結格式無效或超過 2048 字');
  if (!/^https?:\/\//i.test(url)) throw new AppError('韓國商品連結請填完整的 http 或 https 網址');
  let parsed;
  try { parsed = new URL(url); } catch { throw new AppError('韓國商品連結請填完整的 http 或 https 網址'); }
  if (!['http:','https:'].includes(parsed.protocol) || !parsed.hostname || parsed.username || parsed.password) throw new AppError('韓國商品連結請填不含帳密的 http 或 https 網址');
  return url;
}

export function validateImageBindings(value, images, colors) {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 12) throw new AppError('照片綁定設定無效');
  const seen = new Set();
  return value.map(binding => {
    if (!binding || typeof binding.color !== 'string' || typeof binding.url !== 'string' ||
      !colors.includes(binding.color) || !images.includes(binding.url) || seen.has(binding.color)) {
      throw new AppError('請將照片綁定至現有顏色及商品照片');
    }
    seen.add(binding.color);
    return {color:binding.color,url:binding.url};
  });
}

export function validateSizeSurcharges(input, sizes, basePrice) {
  // Older clients send one extra amount; their historical XL/2XL rule remains compatible.
  const fallback = integer(Number(input.extra || 0), '尺寸加價', 100000);
  const entries = input.sizeSurcharges === undefined
    ? sizes.filter(size => ['XL', '2XL'].includes(size)).map(size => ({size, extra:fallback}))
    : input.sizeSurcharges;
  if (!Array.isArray(entries) || entries.length > 12) throw new AppError('尺寸加價設定無效');
  const seen = new Set();
  return entries.map(entry => {
    if (!entry || typeof entry.size !== 'string' || !sizes.includes(entry.size) || seen.has(entry.size)) {
      throw new AppError('請為現有尺寸設定加價，每個尺寸限一筆');
    }
    seen.add(entry.size);
    const extra = integer(Number(entry.extra), entry.size + ' 加價', 100000);
    integer(basePrice + extra, entry.size + ' 售價', 1000000, 1);
    return {size:entry.size, extra};
  }).filter(entry => entry.extra > 0);
}

export function text(value, label, max = 150) {
  const result = typeof value === 'string' ? value.trim() : '';
  if (!result || result.length > max) throw new AppError(`請填寫有效的${label}`);
  return result;
}

export function validateNewCategory(value, existing) {
  const name = text(value, '分類名稱', 30);
  if (['全部分類','全部選物'].includes(name)) throw new AppError('請使用其他分類名稱');
  if (existing.includes(name)) throw new AppError('這個分類已存在', 409);
  return name;
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
