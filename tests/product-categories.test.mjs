import test from 'node:test';
import assert from 'node:assert/strict';
import { categoryNames, categoryCounts } from '../shared/product-categories.js';

test('registered empty categories coexist with unchanged legacy product categories',()=>{
  const products=[{category:'衣著'},{category:'衣著'},{category:'用品'}],before=structuredClone(products);
  assert.deepEqual(categoryNames(undefined,products),['衣著','用品']);
  assert.deepEqual(categoryCounts(['玩具','衣著'],products),[['玩具',0],['衣著',2],['用品',1]]);
  assert.deepEqual(products,before);
});
test('category names are safe dictionary keys and duplicate names are merged',()=>{
  const products=[{category:'__proto__'},{category:'constructor'},{category:'constructor'}];
  assert.deepEqual(categoryCounts(['__proto__','constructor','__proto__'],products),[['__proto__',1],['constructor',2]]);
});
