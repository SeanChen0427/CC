import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { planPromotion,publicPromotion } from '../domain/promotion.mjs';
import { emptyState,operate,upsertCustomer } from '../cloud/core.mjs';
import { startApp } from '../server/index.mjs';

test('promotion requires explicit valid content, boolean and matching version',()=>{
  for(const body of [
    {version:0,enabled:true,text:'  '},
    {version:0,enabled:true,text:'長'.repeat(121)},
    {version:0,enabled:'false',text:'公告'},
    {version:0,enabled:false,text:null},
  ])assert.throws(()=>planPromotion(body),error=>error.status===400);
  assert.throws(()=>planPromotion({enabled:false,text:''}),error=>error.status===409);
  const settings=planPromotion({version:0,enabled:true,text:'  本期優惠\n 詳情洽店主  ',price:0});
  assert.deepEqual(settings,{version:1,enabled:true,text:'本期優惠 詳情洽店主'});
  assert.deepEqual(publicPromotion(settings),{text:settings.text});
  assert.equal(publicPromotion({...settings,enabled:false}),null);
  assert.equal(publicPromotion(undefined),null);
});

test('cloud promotion is owner-only, hides drafts and preserves campaign, prices and existing orders',()=>{
  const s=emptyState(),owner={role:'admin',subject:'owner'},customer={role:'customer',subject:'anna'};
  operate(s,'admin/products','POST',{code:'PROMO',name:'選物',category:'衣著',kind:'vest',price:590,colors:'白',sizes:'S'},owner);
  s.campaign.status='open';s.campaign.closesAt=new Date(Date.now()+86400000).toISOString();
  upsertCustomer(s,{id:'anna',display_name:'隔離會員'});
  operate(s,'customer/preorders','POST',{requestId:randomUUID(),name:'隔離會員',phone:'0900000000',items:[{variantId:1,quantity:1,expectedPrice:590}]},customer);
  const before=structuredClone(s);
  for(const session of [null,customer]){
    assert.throws(()=>operate(s,'admin/promotion','PUT',{version:0,enabled:true,text:'優惠'},session),error=>error.status===401);
    assert.deepEqual(s,before);
  }
  const initial=operate(s,'admin/state','GET',{},owner).promotion;
  assert.deepEqual(initial,{version:0,enabled:false,text:''});assert.equal(s.promotion,undefined);
  operate(s,'admin/promotion','PUT',{version:0,enabled:false,text:'未公開優惠草稿'},owner);
  assert.equal(operate(s,'catalog','GET',{},customer).promotion,null);
  assert.ok(!JSON.stringify(operate(s,'customer/bootstrap','GET',{},customer)).includes('未公開優惠草稿'));
  const saved=operate(s,'admin/promotion','PUT',{version:1,enabled:true,text:'公告 <b>原樣文字</b>'},owner);
  assert.deepEqual(operate(s,'catalog','GET',{},customer).promotion,{text:'公告 <b>原樣文字</b>'});
  assert.deepEqual(operate(s,'customer/bootstrap','GET',{},customer).catalog.promotion,{text:saved.promotion.text});
  const after=structuredClone(s);
  assert.throws(()=>operate(s,'admin/promotion','PUT',{version:1,enabled:false,text:'舊畫面'},owner),error=>error.status===409);
  assert.deepEqual(s,after);
  operate(s,'admin/promotion','PUT',{version:2,enabled:false,text:s.promotion.text},owner);
  assert.equal(operate(s,'catalog','GET',{},customer).promotion,null);assert.equal(s.promotion.text,'公告 <b>原樣文字</b>');
  for(const key of Object.keys(before).filter(k=>!['events','seq'].includes(k)))assert.deepEqual(s[key],before[key],key);
  const withoutPromotion=structuredClone(s);delete withoutPromotion.promotion;
  assert.equal(operate(withoutPromotion,'catalog','GET',{},customer).promotion,null);
});

test('local promotion persists, rejects stale/unauthorized writes and is included in private backups',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'ccbaby-promotion-')),password=randomUUID();
  let app=await startApp({directory,customerPort:0,adminPort:0,seed:true,password,quiet:true});
  const jars={};
  async function call(role,path,{method='GET',body,anonymous=false}={}){
    const base='http://127.0.0.1:'+(role==='admin'?app.adminPort:app.customerPort);
    const response=await fetch(base+'/api/'+path,{method,headers:{Origin:base,'Content-Type':'application/json',...(!anonymous&&jars[role]?{Cookie:jars[role]}:{})},body:body?JSON.stringify(body):undefined});
    if(response.headers.has('set-cookie'))jars[role]=response.headers.get('set-cookie').split(';')[0];
    return {status:response.status,data:await response.json()};
  }
  try{
    const body={version:0,enabled:true,text:'本期優惠公告'};
    assert.equal((await call('admin','admin/promotion',{method:'PUT',body})).status,401);
    assert.equal((await call('customer','admin/promotion',{method:'PUT',body})).status,403);
    assert.equal((await call('admin','admin/login',{method:'POST',body:{username:'hannah',password}})).status,200);
    const before=(await call('admin','admin/state')).data;
    assert.deepEqual(before.promotion,{enabled:false,text:'',version:0});
    assert.equal((await call('admin','admin/promotion',{method:'PUT',body:{...body,text:''}})).status,400);
    assert.equal((await call('admin','admin/promotion',{method:'PUT',body})).status,200);
    assert.deepEqual((await call('customer','catalog')).data.promotion,{text:body.text});
    assert.equal((await call('admin','admin/promotion',{method:'PUT',body})).status,409);
    const after=(await call('admin','admin/state')).data;
    for(const key of ['campaign','products','orders','report','stats','costSettings'])assert.deepEqual(after[key],before[key],key);
    const backup=(await call('admin','admin/backup')).data;
    assert.equal(JSON.parse(backup.tables.promotion_settings[0].data).text,body.text);
    await app.close();app=await startApp({directory,customerPort:0,adminPort:0,seed:true,password,quiet:true});
    assert.equal((await call('admin','admin/state')).data.promotion.text,body.text);
    assert.equal((await call('admin','admin/promotion',{method:'PUT',body:{...body,version:1,enabled:false}})).status,200);
    assert.equal((await call('customer','catalog')).data.promotion,null);
    assert.equal((await call('admin','admin/state')).data.promotion.text,body.text);
    assert.equal((await call('admin','admin/promotion',{method:'PUT',body:{version:2,enabled:false,text:''}})).status,200);
  }finally{await app.close();await rm(directory,{recursive:true,force:true});}
});
