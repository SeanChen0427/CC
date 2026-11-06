import { Buffer } from 'node:buffer';
import { AppError } from '../domain/validation.mjs';
import { productSheets } from '../domain/product-transfer.mjs';
import { workbook } from './xlsx.mjs';

function jpegThumbnail(value) {
  if (typeof value !== 'string' || value.length > 8023 || !/^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(value)) throw new AppError('商品縮圖格式無效');
  const bytes = Buffer.from(value.slice(23),'base64');
  if (bytes.length < 4 || bytes.length > 6000 || bytes.readUInt16BE(0) !== 0xffd8 || bytes.readUInt16BE(bytes.length - 2) !== 0xffd9) throw new AppError('商品縮圖無效或過大');
  let offset = 2;
  while (offset + 8 < bytes.length) {
    if (bytes[offset] !== 0xff) break;
    const marker = bytes[offset + 1], length = bytes.readUInt16BE(offset + 2);
    if (length < 2 || offset + length + 2 > bytes.length) break;
    if ([0xc0,0xc1,0xc2].includes(marker)) {
      if (length < 8 || bytes.readUInt16BE(offset + 5) !== 144 || bytes.readUInt16BE(offset + 7) !== 144) break;
      return bytes;
    }
    offset += length + 2;
  }
  throw new AppError('商品縮圖尺寸無效');
}

export function productWorkbook(products, thumbnails = []) {
  if (!Array.isArray(thumbnails) || thumbnails.length > products.length) throw new AppError('商品縮圖清單無效');
  const seen = new Set(), images = [];
  for (const item of thumbnails) {
    const index = products.findIndex(p => p.id === item?.productId);
    const product = products[index];
    if (!product || seen.has(product.id) || !product.images?.[0] || item.url !== product.images[0]) throw new AppError('商品照片已更新，請重新整理後再匯出',409);
    seen.add(product.id);
    images.push({row:index + 1,col:0,name:product.code+' 第一張照片',data:jpegThumbnail(item.data)});
  }
  if (products.some(p => p.images?.[0] && !seen.has(p.id))) throw new AppError('請重新整理選物管理，再下載含圖 Excel',409);
  const sheets = productSheets(products);
  sheets[0].images = images;
  return workbook(sheets);
}
