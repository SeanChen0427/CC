export function categoryNames(registered = [], products = []) {
  return [...new Set([
    ...(Array.isArray(registered) ? registered : []),
    ...products.map(product => product.category),
  ].filter(name => typeof name === 'string' && name.trim()))];
}

export function categoryCounts(registered, products) {
  const counts = new Map();
  for (const product of products) counts.set(product.category, (counts.get(product.category) || 0) + 1);
  return categoryNames(registered, products).map(name => [name, counts.get(name) || 0]);
}
