import test from 'node:test';
import assert from 'node:assert/strict';
import { validateSizeSurcharges } from '../domain/validation.mjs';
import { editorPricing } from '../shared/product-pricing.js';

test('larger sizes have explicit independent extras without charging XL automatically',()=>{
  const sizes=['S','XL','2XL','3XL','4XL'];
  const sizeSurcharges=[{size:'2XL',extra:50},{size:'3XL',extra:100},{size:'4XL',extra:150}];
  assert.deepEqual(validateSizeSurcharges({sizeSurcharges},sizes,590),sizeSurcharges);
  assert.deepEqual(validateSizeSurcharges({sizeSurcharges:[]},sizes,590),[]);
  assert.deepEqual(validateSizeSurcharges({extra:25,sizeSurcharges},sizes,590),sizeSurcharges);
});
test('invalid size pricing cannot silently change product prices',()=>{
  for(const sizeSurcharges of [[{size:'不存在',extra:10}],[{size:'2XL',extra:-1}],[{size:'2XL',extra:1.5}],[{size:'2XL',extra:100001}],[{size:'2XL',extra:1},{size:'2XL',extra:2}],null]) {
    assert.throws(()=>validateSizeSurcharges({sizeSurcharges},['2XL'],590));
  }
  assert.throws(()=>validateSizeSurcharges({sizeSurcharges:[{size:'2XL',extra:50}]},['2XL'],999999));
});
test('editor preserves legacy prices and stored base when every size has a surcharge',()=>{
  const variants=[{size:'2XL',price:640,active:true},{size:'3XL',price:690,active:true}];
  const legacy=editorPricing({variants});
  assert.equal(legacy.basePrice,640);assert.deepEqual(legacy.sizeSurcharges,[{size:'3XL',extra:50}]);
  const configured={basePrice:590,sizeSurcharges:[{size:'2XL',extra:50},{size:'3XL',extra:100}],variants};
  assert.deepEqual(editorPricing(configured),{basePrice:590,sizeSurcharges:configured.sizeSurcharges});
  assert.equal(editorPricing().basePrice,590);
});
