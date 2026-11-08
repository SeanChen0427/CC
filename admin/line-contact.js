export const officialAccountId='@445yxcey';
export const validContactCode=value=>typeof value==='string'&&/^CC-[A-F0-9]{12}$/.test(value);

export function lineContactMessage(code,{product,order}={}){
  if(code!==null&&!validContactCode(code))throw new Error('聯繫資料無效，請重新開啟聯繫入口');
  const lines=['你好，我是 CCBABY 網站會員'];
  if(code)lines.push('聯繫碼：'+code);
  if(order)lines.push('預購編號：'+order.code,'我已送出預購，想和店主建立後續聯繫，謝謝');
  else if(product)lines.push('想詢問：'+product.code+' '+product.name,'想請你協助確認商品細節，謝謝');
  else lines.push('想請你協助確認選物或預購問題，謝謝');
  return lines.join('\n');
}

export function lineContactURL(code,context){
  return 'https://line.me/R/oaMessage/'+encodeURIComponent(officialAccountId)+'/?'+encodeURIComponent(lineContactMessage(code,context));
}
