const money=value=>'NT$ '+Number(value).toLocaleString('en-US');
export function wrapCardText(value,width,measure){
  return String(value??'').split('\n').flatMap(paragraph=>{
    const lines=[];let line='';
    for(const char of Array.from(paragraph)){
      if(line&&measure(line+char)>width){lines.push(line);line=char;}else line+=char;
    }
    lines.push(line);return lines;
  });
}

export function layoutOrderCards(order,notice,measure){
  const names=wrapCardText('客戶：'+(order.name||'預購會員'),940,text=>measure(text,26));
  const top=252+names.length*34,pages=[];let rows=[],height=top;
  for(const item of order.items.filter(i=>i.quantity>0)){
    const name=wrapCardText(item.product_code+' '+item.product_name,940,text=>measure(text,28));
    const spec=wrapCardText(item.color+' / '+item.size,940,text=>measure(text,24));
    const status=notice.kind==='thanks'?`預購 ${item.quantity} 件 · 單價 ${money(item.price)}`:`預購 ${item.quantity} 件 · 已買到 ${item.bought} 件 · 缺貨 ${item.shortage} 件 · 待確認 ${Math.max(0,item.quantity-item.bought-item.shortage)} 件`;
    const statusLines=wrapCardText(status,940,text=>measure(text,22));
    const rowHeight=28+name.length*38+spec.length*32+statusLines.length*30+36;
    if(rows.length&&height+rowHeight>1230){pages.push(rows);rows=[];height=top;}
    rows.push({name,spec,status:statusLines,amount:money((notice.kind==='thanks'?item.quantity:item.bought)*item.price),height:rowHeight});height+=rowHeight;
  }
  if(rows.length)pages.push(rows);
  return {names,top,pages};
}

export async function renderOrderCards(order,notice,{document:doc=document,now=Date.now()}={}){
  if(!notice.eligible)throw new Error(notice.blocked||'目前沒有可產生圖卡的有效品項');
  const probe=doc.createElement('canvas'),ctx=probe.getContext('2d');
  const font=(c,size,weight=400)=>{c.font=`${weight} ${size}px -apple-system,BlinkMacSystemFont,"PingFang TC","Microsoft JhengHei",sans-serif`;};
  const layout=layoutOrderCards(order,notice,(text,size)=>{font(ctx,size);return ctx.measureText(text).width;});
  const output=[];
  for(let index=0;index<layout.pages.length;index++){
    const canvas=doc.createElement('canvas');canvas.width=1080;canvas.height=1600;
    const c=canvas.getContext('2d');
    c.fillStyle='#f6f4ed';c.fillRect(0,0,1080,1600);c.fillStyle='#fff';c.fillRect(36,36,1008,1528);
    c.fillStyle='#314f3b';c.fillRect(36,36,1008,12);
    font(c,50,600);c.fillText('CCBABY',70,116);font(c,22);c.fillStyle='#77836b';c.fillText('韓國親自選物 · 預購與採購進度',70,156);
    font(c,32,600);c.fillStyle='#314f3b';c.fillText(notice.title,70,218);
    font(c,25);c.fillStyle='#384238';c.fillText('預購編號：'+order.code,70,258);
    font(c,26);layout.names.forEach((line,i)=>c.fillText(line,70,292+i*34));
    let y=layout.top+34;
    for(const row of layout.pages[index]){
      c.strokeStyle='#e5e8df';c.beginPath();c.moveTo(70,y-18);c.lineTo(1010,y-18);c.stroke();
      c.fillStyle='#2b3b32';font(c,28,500);for(const line of row.name){c.fillText(line,70,y+20);y+=38;}
      c.fillStyle='#69765f';font(c,24);for(const line of row.spec){c.fillText(line,70,y+16);y+=32;}
      c.fillStyle='#69765f';font(c,22);for(const line of row.status){c.fillText(line,70,y+14);y+=30;}
      c.fillStyle='#314f3b';font(c,24,500);c.textAlign='right';c.fillText(row.amount,1010,y+16);c.textAlign='left';y+=64;
    }
    c.fillStyle='#eef2e7';c.fillRect(70,1280,940,114);c.fillStyle='#52664a';font(c,23);
    c.fillText(notice.kind==='thanks'?'整份預購商品小計':'整份已分配買到商品小計',94,1323);
    c.fillStyle='#314f3b';font(c,34,600);c.fillText(money(notice.kind==='thanks'?notice.progress.total:notice.progress.boughtTotal),94,1370);
    font(c,24,500);c.fillText(notice.kind==='thanks'?'謝謝你的預購，讓我們一起期待這趟選物':notice.kind==='payment'?'請核對收款資料與總額後，再安排匯款':'謝謝你的等待，有進度會再和你說明',70,1440);
    c.fillStyle='#77836b';font(c,20);c.fillText(notice.kind==='payment'?'以上為商品金額，運費與最終匯款總額另行確認':'代購登記不代表現貨保證 · 到台後另行確認付款與交付',70,1484);
    const date=new Intl.DateTimeFormat('zh-TW',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}).format(now);
    font(c,18);c.fillText('圖卡製作 '+date,70,1530);c.textAlign='right';c.fillText(`${index+1} / ${layout.pages.length} 張`,1010,1530);
    const blob=await new Promise((resolve,reject)=>canvas.toBlob(value=>value?resolve(value):reject(new Error('圖卡產生失敗')),'image/png'));
    output.push({blob,name:`ccbaby-${order.code}-${notice.kind}-${index+1}.png`});canvas.width=0;canvas.height=0;
  }
  return output;
}

export function downloadOrderCard(card){
  const url=URL.createObjectURL(card.blob),a=document.createElement('a');a.href=url;a.download=card.name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
