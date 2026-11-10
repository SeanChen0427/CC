import { AppError } from './validation.mjs';

export function previewProductId(value) {
  const id = typeof value === 'string' && /^[1-9]\d{0,15}$/.test(value) ? Number(value) : NaN;
  if (!Number.isSafeInteger(id)) throw new AppError('找不到商品', 404);
  return id;
}

// Explicit projection: this public response must never contain a catalog or private fields.
export function productPreview(products, id, imagePrefix) {
  const product = products.find(p => p.id === id && p.active);
  if (!product) throw new AppError('找不到商品', 404);
  const cover = product.images?.[0];
  const image = typeof cover === 'string' && cover.startsWith(imagePrefix)
    && /^[a-f0-9-]+\.(png|jpg|webp|gif)$/.test(cover.slice(imagePrefix.length)) ? cover : null;
  return { id: product.id, code: product.code, name: product.name, image };
}
