import test from 'node:test';
import assert from 'node:assert/strict';
import { imageForColor, photoIndexForColor } from '../shared/product-gallery.js';

test('unbound color changes preserve the selected photo, including older products',()=>{
  const product={images:['front','back','detail']};
  assert.equal(imageForColor(product,'白'),null);
  assert.equal(photoIndexForColor(product,'白',2),2);
});
test('explicit color binding follows its photo through reorder and ignores removed photos',()=>{
  const product={images:['detail','back','front'],imageBindings:[{color:'白',url:'front'}]};
  assert.equal(imageForColor(product,'白'),'front');
  assert.equal(photoIndexForColor(product,'白',1),2);
  assert.equal(photoIndexForColor(product,'棕',1),1);
  product.images=['detail','back'];
  assert.equal(imageForColor(product,'白'),null);
  assert.equal(photoIndexForColor(product,'白',1),1);
});
