import test from 'node:test';
import assert from 'node:assert/strict';
import { productSheets } from '../domain/product-transfer.mjs';
import { productWorkbook } from '../server/product-workbook.mjs';
import { thumbnail } from './fixtures/product-thumbnail.mjs';

function entries(buffer) {
  const files = {};
  for(let at=0;buffer.readUInt32LE(at)===0x04034b50;) {
    const length=buffer.readUInt32LE(at+18),nameLength=buffer.readUInt16LE(at+26),extra=buffer.readUInt16LE(at+28);
    const name=buffer.subarray(at+30,at+30+nameLength).toString(),start=at+30+nameLength+extra;
    files[name]=buffer.subarray(start,start+length);at=start+length;
  }
  return files;
}
const p=(id,cost,images=[])=>({id,code:'PIC'+id,name:'商品'+id,category:'衣著',basePrice:590,sizeSurcharges:[],active:true,images,variants:[{id:id*10,color:'白',size:'S',price:590,active:true,cost}]});
test('product summary keeps missing costs blank, preserves zero and defers mixed costs to variants',()=>{
  const products=[p(1,null),p(2,{unitKrw:0,exchangeRate:.024}),p(3,{unitKrw:10000,exchangeRate:.024})];
  const mixed=p(4,null);mixed.variants.push({...mixed.variants[0],id:41,size:'M',cost:{unitKrw:20000,exchangeRate:.024}});products.push(mixed);
  const sheets=productSheets(products);
  assert.deepEqual(sheets[0].rows.slice(1).map(r=>r.slice(7,10)),[['','',''],[0,0,.024],[10000,240,.024],['','','']]);
  assert.match(sheets[0].rows[4][11],/規格進價/);
  assert.deepEqual(sheets[3].rows[1].slice(6,9),['','','']);
  assert.deepEqual(sheets[3].rows[2].slice(6,9),[0,.024,0]);
});
test('workbook embeds first-photo JPEG bytes, leaves products without photos blank and binds each drawing to its product row',()=>{
  const products=[p(1,null,['first','second']),p(2,null),p(3,{unitKrw:0,exchangeRate:.024},['third'])];
  const thumbs=[{productId:3,url:'third',data:thumbnail},{productId:1,url:'first',data:thumbnail}];
  const files=entries(productWorkbook(products,thumbs));
  assert.equal(Object.keys(files).filter(k=>k.startsWith('xl/media/')).length,2);
  assert.deepEqual(files['xl/media/image1.jpg'],Buffer.from(thumbnail.slice(23),'base64'));
  const drawing=files['xl/drawings/drawing1.xml'].toString();
  assert.match(drawing,/<xdr:row>3<\/xdr:row>/);assert.match(drawing,/<xdr:row>1<\/xdr:row>/);assert.doesNotMatch(drawing,/<xdr:row>2<\/xdr:row>/);
  assert.match(files['xl/worksheets/sheet1.xml'].toString(),/drawing r:id="rId1"/);
  assert.match(files['[Content_Types].xml'].toString(),/image\/jpeg/);
  for(const file of Object.values(files)) assert.doesNotMatch(file.toString(),/<f>|TargetMode="External"/);
  const plain=entries(productWorkbook([p(1,null)]));
  assert.ok(!Object.keys(plain).some(k=>k.startsWith('xl/media/')));
});
test('export rejects missing, stale, duplicate, foreign, oversized or invalid thumbnails without writing data',()=>{
  const products=[p(1,null,['first','second'])],good={productId:1,url:'first',data:thumbnail};
  for(const thumbs of [[],[good,good],[{...good,url:'second'}],[{...good,productId:2}],[{...good,data:'data:image/jpeg;base64,AAAA'}],[{...good,data:thumbnail+'A'.repeat(9000)}]]) {
    const before=structuredClone(products);assert.throws(()=>productWorkbook(products,thumbs));assert.deepEqual(products,before);
  }
});

test('source hyperlinks and embedded first-photo drawings coexist without formulas',()=>{
  const product={...p(1,null,['first']),sourceUrl:'https://example.test/item?color=white&size=M'};
  const files=entries(productWorkbook([product],[{productId:1,url:'first',data:thumbnail}]));
  const sheet=files['xl/worksheets/sheet1.xml'].toString(),rels=files['xl/worksheets/_rels/sheet1.xml.rels'].toString();
  assert.match(sheet,/<hyperlink ref="M2"/);assert.match(sheet,/<drawing r:id="rId1"/);
  assert.match(rels,/relationships\/drawing/);assert.match(rels,/relationships\/hyperlink/);assert.match(rels,/white&amp;size=M/);
  assert.ok(files['xl/media/image1.jpg']);assert.doesNotMatch(sheet,/<f>/);
});
