import { AppError, text, csvRows } from './validation.mjs';
import { editorPricing } from '../shared/product-pricing.js';
import { unitCostTwd } from '../shared/costing.js';

const fields = [
  ['code','商品編號','必填，英文、數字、底線或連字號；匯入僅新增，須改成未使用的編號'],
  ['name','商品名稱','必填，最多 80 字'],
  ['category','商品分類','必填，最多 30 字'],
  ['price','基本售價（台幣）','必填，1～1000000 的整數，尺寸售價＝基本售價＋該尺寸加價'],
  ['colors','顏色','必填，多個顏色用逗號分隔'],
  ['sizes','尺寸／規格','必填，多個尺寸用逗號分隔'],
  ['description','商品說明','選填，最多 3000 字，可換行'],
  ['badge','商品標籤','選填，最多 20 字'],
  ['active','上架狀態','true 為上架，false 為下架；空白預設上架，也接受 1／0'],
  ['kind','示意圖類型','選填，vest、coat、bag、bowl、bed、toy、scarf；空白為 vest'],
  ['tone','示意圖色碼','選填，例如 #b9a38b'],
  ['images','照片網址','選填，JSON 陣列，最多 8 張；沿用本站既有照片，留白可稍後上傳'],
  ['imageBindings','顏色照片綁定','選填，JSON 陣列，例如 [{"color":"白","url":"照片網址"}]；留白為獨立相簿'],
  ['sourceUrl','韓國商品連結','選填，完整 http 或 https 網址，最多 2048 字；僅供店主採購記錄'],
];
const fixedHeaders = fields.map(([key]) => key);
const required = fixedHeaders.slice(0, 6);
const activeVariants = p => p.variants.filter(v => v.active);
const sizesFor = p => [...new Set(activeVariants(p).map(v => v.size))];

export function productTable(products) {
  const sizes = [...new Set(products.flatMap(sizesFor))];
  const headers = [...required, ...sizes.map(size => 'extra:' + size), ...fixedHeaders.slice(6)];
  const rows = products.map(p => {
    const variants = activeVariants(p), pricing = editorPricing(p), ownSizes = sizesFor(p);
    const values = {code:p.code, name:p.name, category:p.category, price:pricing.basePrice,
      colors:[...new Set(variants.map(v => v.color))].join(','), sizes:ownSizes.join(','),
      description:p.description || '', badge:p.badge || '', active:p.active ? 'true' : 'false',
      kind:p.kind, tone:p.tone, images:JSON.stringify(p.images || []), imageBindings:JSON.stringify(p.imageBindings || []), sourceUrl:p.sourceUrl || ''};
    for (const size of sizes) values['extra:' + size] = ownSizes.includes(size) ? pricing.sizeSurcharges.find(e => e.size === size)?.extra || 0 : '';
    return headers.map(key => values[key]);
  });
  return [headers, ...rows];
}

// Escape spreadsheet formulas while retaining exact text on a later CSV import.
function csvCell(value) {
  let cell = String(value ?? '');
  if (typeof value !== 'number' && /^[=+\-@\t\r\n']/.test(cell)) cell = "'" + cell;
  return /[",\r\n]/.test(cell) ? '"' + cell.replaceAll('"','""') + '"' : cell;
}
const decodeCell = value => /^'[=+\-@\t\r\n']/.test(value) ? value.slice(1) : value;
export const productCsv = products => '\uFEFF' + productTable(products).map(row => row.map(csvCell).join(',')).join('\r\n') + '\r\n';

// Merge only rectangles of actual variants with identical selling price and
// purchase cost. This also handles color-specific costs without inventing pairs.
export function productDisplayRows(products) {
  return products.flatMap(product => {
    const variants=activeVariants(product),pricing=editorPricing(product),groups=new Map();
    for(const v of variants){
      const price=v.price ?? pricing.basePrice+(pricing.sizeSurcharges.find(e=>e.size===v.size)?.extra || 0);
      const key=JSON.stringify([price,v.cost?.unitKrw ?? null,v.cost?.exchangeRate ?? null]);
      if(!groups.has(key))groups.set(key,{product,price,cost:v.cost || null,variants:[]});
      groups.get(key).variants.push(v);
    }
    if(!variants.length)return [{product,price:pricing.basePrice,cost:null,colors:[],sizes:[]}];
    return [...groups.values()].sort((a,b)=>(a.price!==pricing.basePrice)-(b.price!==pricing.basePrice)).flatMap(group=>{
      const rectangles=new Map();
      for(const size of [...new Set(group.variants.map(v=>v.size))]){
        const colors=group.variants.filter(v=>v.size===size).map(v=>v.color),key=JSON.stringify([...colors].sort());
        if(!rectangles.has(key))rectangles.set(key,{...group,colors,sizes:[]});
        rectangles.get(key).sizes.push(size);
      }
      return [...rectangles.values()];
    });
  });
}

export function productSheets(products) {
  const table = productTable(products);
  const displayRows = productDisplayRows(products);
  const sourceLinks = (rows,col) => rows.flatMap((p,index) => p.sourceUrl ? [{row:index + 1,col,url:p.sourceUrl}] : []);
  const variantRows = products.flatMap(p => activeVariants(p).map(v => ({p,v})));
  return [
    {name:'商品清單', formatted:true, rowHeight:114, widths:[23,18,30,18,22,22,19,19,19,16,12,30,40],links:sourceLinks(displayRows.map(row=>row.product),12),
      rows:[['商品圖','商品編號','商品名稱','分類','顏色','尺寸／規格','售價（台幣）','單件進價（韓幣）','單件進價（台幣）','採用匯率','上架狀態','進價說明','韓國商品連結'],
        ...displayRows.map(({product:p,price,cost,colors,sizes}) => {
          return ['',p.code,p.name,p.category,colors.join('、'),sizes.join('、'),price,
            cost?.unitKrw ?? '',unitCostTwd(cost) ?? '',cost?.exchangeRate ?? '',p.active?'上架':'下架','',p.sourceUrl || ''];
        })]},
    {name:'匯入底稿', rows:table,links:sourceLinks(products,table[0].indexOf('sourceUrl'))},
    {name:'欄位說明', rows:[['欄位','中文名稱','填寫方式'], ...fields,
      ...table[0].filter(key => key.startsWith('extra:')).map(key => [key,key.slice(6)+' 尺寸加價','選填，0～100000 的整數；空白視為 0，沒有該尺寸的商品請留白']),
      ['操作流程','批量新增','複製匯入底稿列 → 改成新商品編號 → 編輯 → 另存 CSV UTF-8 → CSV 批次匯入 → 預覽並檢查 → 確認匯入'],
      ['匯入範圍','僅新增商品','既有編號會報錯，不覆寫既有商品；不直接匯入 XLSX'],
      ['售價與進價','不同尺寸拆列','商品清單依相同售價、韓幣進價與採用匯率合併規格；不同價格緊接於同商品下方，尺寸與顏色標示適用範圍；未填留空，0 保留'],
      ['進價','韓幣及台幣','可在商品編輯填共用進價，個別尺寸填完整韓幣進價；CSV 不匯入進價，匯入底稿仍一款一列，避免重複商品編號'],
      ['照片','第一張照片','商品清單每個價格列都嵌入同商品第一張照片，無照片留空；匯入底稿仍只存網址，新照片於商品編輯上傳'],
      ['CSV 文字','試算表安全處理','公式開頭文字會加單引號，本站匯入時自動還原；純數字編號在 Excel 請設文字格式'],
    ]},
    {name:'規格進價',links:sourceLinks(variantRows.map(row=>row.p),9), rows:[['商品編號','商品名稱','上架狀態','顏色','尺寸／規格','售價（台幣）','單件進價（韓幣）','採用匯率','單件進價（台幣）','韓國商品連結'],
      ...variantRows.map(({p,v}) => [p.code,p.name,p.active?'上架':'下架',v.color,v.size,v.price,v.cost?.unitKrw ?? '',v.cost?.exchangeRate ?? '',unitCostTwd(v.cost) ?? '',p.sourceUrl || ''])]},
  ];
}

export function previewProductImport(csv, validate, exists) {
  const rows = csvRows(text(csv,'CSV 內容',1000000));
  const headers = rows.shift()?.map(x => x.trim()) || [];
  if (required.some(key => !headers.includes(key))) throw new AppError('CSV 欄位需包含 code,name,category,price,colors,sizes');
  if (new Set(headers).size !== headers.length) throw new AppError('CSV 欄位名稱不可重複');
  const unknown = headers.filter(key => !fixedHeaders.includes(key) && key !== 'extra' && !/^extra:.+/.test(key));
  if (unknown.length) throw new AppError('無法辨識 CSV 欄位：' + unknown.join('、'));
  if (!rows.length) throw new AppError('請至少填寫一筆商品');
  const seen = new Set(), products = [], errors = [];
  rows.forEach((cells,index) => {
    try {
      if (cells.length !== headers.length) throw new AppError('欄位數量不符，含逗號或換行的內容請用雙引號包住');
      const p = Object.fromEntries(headers.map((key,i) => [key,decodeCell(cells[i])]));
      p.kind ||= 'vest'; p.tone ||= '#b9a38b';
      if (p.active !== undefined && !['','true','false','1','0'].includes(p.active.trim().toLowerCase())) throw new AppError('active 請填 true 或 false');
      p.active = !['false','0'].includes(p.active?.trim().toLowerCase());
      for (const key of ['images','imageBindings']) {
        if (p[key]) {try {p[key] = JSON.parse(p[key]);} catch {throw new AppError(key + ' 請填有效的 JSON 陣列');}}
        else p[key] = [];
        if (!Array.isArray(p[key])) throw new AppError(key + ' 請填 JSON 陣列');
      }
      const extraHeaders = headers.filter(key => key.startsWith('extra:'));
      if (extraHeaders.length) {
        p.sizeSurcharges = extraHeaders.filter(key => p[key].trim() !== '').map(key => ({size:key.slice(6),extra:p[key]}));
      }
      const valid = validate(p);
      if (seen.has(valid.code) || exists(valid.code)) throw new AppError('商品編號重複：' + valid.code + '，批次匯入僅新增，請改用新編號');
      seen.add(valid.code); products.push({...p, line:index + 2});
    } catch (error) {errors.push({line:index + 2,message:error.message});}
  });
  return {products,errors,count:rows.length};
}

export const templateProducts = [{code:'NEW001',name:'範例背心',category:'毛孩衣著',basePrice:590,sizeSurcharges:[{size:'2XL',extra:50}],kind:'vest',tone:'#b9a38b',active:true,
  description:'請修改範例後匯入',images:[],imageBindings:[],variants:['S','M','2XL'].map(size => ({color:'奶油白',size,active:true}))}];
