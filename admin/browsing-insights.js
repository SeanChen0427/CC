// Explainable owner guidance from observed facts; no conversion probability or private profiling.
const day=86400000;
const time=value=>Number.isFinite(Date.parse(value))?Date.parse(value):null;
const latest=(events,actions)=>events.filter(e=>actions.includes(e.action)&&time(e.at)!==null).sort((a,b)=>time(b.at)-time(a.at)||(a.action==='submit_success'?-1:b.action==='submit_success'?1:0))[0];
export function analyzeJourney({person,interests=[],events=[],campaign,orders,now=Date.now(),partial=false}){
  const ownOrders=(orders||[]).filter(o=>o.customer_id===person.customerId&&o.quantity>0);
  const hasOrder=orders?ownOrders.length>0:Boolean(person.hasPreorder);
  const lastSeen=time(person.lastSeen),age=lastSeen===null?null:Math.max(0,now-lastSeen);
  const recent=age!==null&&age<=3*day,stale=age!==null&&age>7*day;
  const open=campaign?.status==='open'&&time(campaign.closesAt)>now;
  const focus=[...interests].filter(p=>p.views>0||p.cartAdds>0).sort((a,b)=>b.cartAdds-a.cartAdds||b.views-a.views||b.activeMs-a.activeMs).slice(0,3);
  const outcome=latest(events,['submit_failure','submit_success']);
  const failure=outcome?.action==='submit_failure'&&now-time(outcome.at)<=3*day&&time(outcome.at)<=now+300000?outcome:null;
  const resolved=failure&&ownOrders.some(o=>time(o.updated_at)>=time(failure.at));
  const cart=latest(events,['cart_add']);
  const selection=latest(events,['select_color','select_size']);
  const shortage=ownOrders.reduce((n,o)=>n+o.items.reduce((sum,i)=>sum+(i.shortage||0),0),0);
  const facts=[];
  const result={key:'observe',priority:10,label:'先觀察',title:'先累積選購訊號',next:'等出現商品瀏覽、回訪或加購後，再決定是否需要協助',steps:['保留目前紀錄','有新活動時再更新判斷'],facts,focus,hasOrder,orderId:ownOrders[0]?.id||null,draft:'',partial,recent,stale};
  const choose=(key,priority,label,title,next,steps)=>Object.assign(result,{key,priority,label,title,next,steps});
  if(hasOrder){
    facts.push(`目前有 ${ownOrders.length||1} 份有效預購`);
    if(shortage>0){
      facts.push(`預購明細已有 ${shortage} 件確認缺貨`);
      choose('shortage',100,'優先處理','先確認缺貨與分配結果','打開客戶預購核對缺貨品項，整理可告知客戶的採購結果',['查看缺貨品項及已分配數量','確認可提供的處理方式，再人工通知']);
      result.draft='嗨～想和你確認這次預購的採購結果，我會先整理品項與數量，再和你說明需要確認的部分';
    }else if(failure&&!resolved){
      facts.push('近期有一筆送單未成功紀錄，時間晚於目前預購更新');
      choose('addition_check',90,'先確認','已有預購，先核對是否還有追加需求','比對已成立明細與客戶原本想追加的品項，確認後再協助',['先查看目前已成立的預購','詢問是否還有未列入的追加品項']);
      result.draft='嗨～你已成立的預購可以在「我的預購」確認，若還有想追加、但未列在明細的品項，可以告訴我，我幫你一起核對';
    }else{
      choose('ordered',35,'既有預購服務','已有預購，先核對現有需求',campaign?.status==='arrived'?'先查看已分配結果，確認到台品項與人工通知內容':'先查看已成立明細與採購進度，有需要時再提供商品或追加協助',['查看客戶預購明細','依實際採購階段整理需要確認的事項']);
    }
  }else if(!(person.visits>0)){
    facts.push('所選期間沒有可用的造訪紀錄','目前沒有有效預購');
    choose('no_data',0,'資料待累積','目前還無法判斷需求','等客戶再次進站後更新紀錄，再決定下一步',['保留會員資料','出現新紀錄後再查看']);
  }else if(!open){
    facts.push('目前未開放新增預購','目前沒有有效預購');
    choose('not_open',5,'先保留需求','本期未開放，先整理關注商品','保存這位客戶看過的款式，等活動允許新增時再確認需求',['整理關注商品','開放前先確認商品與規格資訊']);
  }else if(failure){
    facts.push('近 3 天有送單未成功紀錄','目前沒有有效預購');
    choose('submit_check',95,'優先確認','先確認預購是否需要協助','先核對客戶預購，再詢問送出時是否遇到問題',['確認目前沒有已成立的預購','如可聯繫，詢問是否需要送單協助']);
    result.draft='嗨～如果這次選物在送出預購時有遇到問題，可以把畫面或想選的品項告訴我，我可以幫你確認；以網站「我的預購」列出的明細為準';
  }else if(stale){
    facts.push('最近一次活動已超過 7 天','目前沒有有效預購');
    choose('stale',10,'等新互動','先等新的選購訊號','先保留關注商品，等客戶再回來或主動詢問時再協助',['查看原本關注的商品','有新活動時重新評估']);
  }else if(person.cartAdds>0){
    facts.push(`所選期間曾加購 ${person.cartAdds} 次`,'目前沒有有效預購');
    choose('cart_help',recent?80:60,recent?'優先了解':'可準備協助','曾加購，先了解是否需要協助','先確認商品規格與送單方式，視需要做一次簡短詢問',['準備關注商品的規格與商品資訊','如可聯繫，詢問尺寸或預購操作是否需要幫忙']);
    const item=focus[0]?.productName;
    result.draft=`嗨～${item?'這期「'+item+'」':'這期選物'}如果有尺寸、商品細節或預購操作想確認，都可以問我，我可以幫你整理資訊；商品需在網站送出後才會成立預購，下單後 24 小時內須透過 LINE 完成付款，確認付款後才安排採購`;
  }else if(selection&&now-time(selection.at)<=3*day){
    facts.push(`近期曾選擇${selection.action==='select_size'?'尺寸':'顏色'}${selection.option?'「'+selection.option+'」':''}`,'所選期間尚無加購紀錄');
    choose('spec_help',55,'可準備協助','已選過規格，可準備商品說明','先整理該款的尺寸、材質與照片，視需要提供選擇協助',['確認商品說明與尺寸資訊齊全','若客戶詢問，優先回應這款的規格']);
    result.draft='嗨～這期選物如果有尺寸、材質或款式想確認，可以告訴我，我可以協助你整理商品資訊';
  }else if(person.visits>=2&&person.productViews>=3){
    facts.push(`造訪 ${person.visits} 次、商品瀏覽 ${person.productViews} 次`,'所選期間尚無加購紀錄');
    choose('returning',50,'可準備協助','多次回來看商品，先準備選物資訊','先整理常看的款式與規格，讓下一次詢問能直接回應',['查看關注商品，確認說明與照片','有新互動或詢問時，再了解需要哪種協助']);
  }else{
    facts.push(`造訪 ${person.visits} 次、商品瀏覽 ${person.productViews} 次`,'目前沒有有效預購');
  }
  if(recent&&person.visits>0)facts.push('近 3 天仍有活動紀錄');
  if(cart?.productId)result.lastCart={productCode:cart.productCode,productName:cart.productName,color:cart.color,size:cart.size,quantity:cart.quantity,at:cart.at};
  result.limit=partial?'全期間彙總搭配最近 200 筆操作；載入較早紀錄可補充判斷':'依所選期間與已取得的操作紀錄整理';
  return result;
}

export function prioritizeJourneys(people,context){
  return people.map(person=>({person,insight:analyzeJourney({...context,person})})).sort((a,b)=>b.insight.priority-a.insight.priority||(time(b.person.lastSeen)||0)-(time(a.person.lastSeen)||0));
}
