// Photos keep their own order. Color selection only changes a photo when explicitly bound.
export function imageForColor(product, color) {
  const binding = product.imageBindings?.find(binding => binding.color === color);
  return binding && product.images?.includes(binding.url) ? binding.url : null;
}

export function photoIndexForColor(product, color, current = 0) {
  const url = imageForColor(product, color);
  return url ? product.images.indexOf(url) : current;
}
