export const parseSizes = value => [...new Set(value.split(/[,，]/).map(size => size.trim()).filter(Boolean))];

export function editorPricing(product) {
  const variants = product?.variants.filter(variant => variant.active) || [];
  const basePrice = product?.basePrice ?? (variants.length ? Math.min(...variants.map(variant => variant.price)) : 590);
  const sizeSurcharges = product?.sizeSurcharges ?? [...new Set(variants.map(variant => variant.size))].map(size => ({
    size, extra:Math.max(0, Math.max(...variants.filter(variant => variant.size === size).map(variant => variant.price)) - basePrice),
  })).filter(entry => entry.extra > 0);
  return {basePrice, sizeSurcharges};
}
