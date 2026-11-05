import { readFileSync, writeFileSync, mkdirSync, rmSync, cpSync } from 'node:fs';
import { resolve, join } from 'node:path';
const root=resolve(import.meta.dirname,'..'),dist=join(root,'dist');
const deployment=JSON.parse(readFileSync(join(root,'deployment.json'),'utf8'));
if(!deployment.apiURL.startsWith('https://')||!deployment.publishableKey.startsWith('sb_publishable_'))throw new Error('Missing public deployment config');
rmSync(dist,{recursive:true,force:true});mkdirSync(dist,{recursive:true});
for(const role of ['customer','admin']){
  const target=role==='customer'?dist:join(dist,'admin');
  cpSync(join(root,'apps',role+'-web'),target,{recursive:true});
  cpSync(join(root,'shared/runtime.js'),join(target,'runtime.js'));
  cpSync(join(root,'server/art.mjs'),join(target,'product-art.js'));
  writeFileSync(join(target,'config.json'),JSON.stringify({...deployment,mode:'cloud',role},null,2)+'\n');
}
writeFileSync(join(dist,'.nojekyll'),'');
if(deployment.customDomain)writeFileSync(join(dist,'CNAME'),deployment.customDomain+'\n');
console.log('Built GitHub Pages: /CC/ and /CC/admin/ (static public assets only)');
