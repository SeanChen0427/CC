import { readFileSync, writeFileSync, mkdirSync, rmSync, cpSync, readdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
const root=resolve(import.meta.dirname,'..'),dist=join(root,'dist');
const deployment=JSON.parse(readFileSync(join(root,'deployment.json'),'utf8'));
const version=JSON.parse(readFileSync(join(root,'package.json'),'utf8')).version;
if(!deployment.apiURL.startsWith('https://')||!deployment.publishableKey.startsWith('sb_publishable_'))throw new Error('Missing public deployment config');
rmSync(dist,{recursive:true,force:true});mkdirSync(dist,{recursive:true});
for(const role of ['customer','admin']){
  const target=role==='customer'?dist:join(dist,'admin');
  cpSync(join(root,'apps',role+'-web'),target,{recursive:true});
  const index=join(target,'index.html');
  const publicConfig={...deployment,mode:'cloud',role};
  const embeddedConfig=JSON.stringify(publicConfig).replace(/</g,'\\u003c');
  writeFileSync(index,readFileSync(index,'utf8').replace(/src="\.\/(app|login-animation)\.js"/g,(_,name)=>`src="./${name}.js?v=${version}"`).replace('href="./style.css"',`href="./style.css?v=${version}"`)
    .replace(/(rel="modulepreload" href="\.\/[^"?]+\.js)(")/g,`$1?v=${version}$2`)
    .replace('<!-- CCBABY_PUBLIC_CONFIG -->',`<script type="application/json" id="ccbaby-config">${embeddedConfig}</script>`));
  cpSync(join(root,'shared/runtime.js'),join(target,'runtime.js'));
  cpSync(join(root,'shared/line-auth.js'),join(target,'line-auth.js'));
  cpSync(join(root,'shared/product-gallery.js'),join(target,'product-gallery.js'));
  cpSync(join(root,'shared/product-pricing.js'),join(target,'product-pricing.js'));
  cpSync(join(root,'shared/product-categories.js'),join(target,'product-categories.js'));
  cpSync(join(root,'shared/line-contact.js'),join(target,'line-contact.js'));
  cpSync(join(root,'shared/youtube.js'),join(target,'youtube.js'));
  if(role==='admin')cpSync(join(root,'shared/costing.js'),join(target,'costing.js'));
  if(role==='admin')cpSync(join(root,'shared/product-costing.js'),join(target,'product-costing.js'));
  cpSync(join(root,'server/art.mjs'),join(target,'product-art.js'));
  for(const name of readdirSync(target).filter(name=>name.endsWith('.js'))){
    const path=join(target,name);
    writeFileSync(path,readFileSync(path,'utf8').replace(/(from\s+['"]|import\s*['"])(\.\/[^'"]+\.js)(['"])/g,`$1$2?v=${version}$3`));
  }
  writeFileSync(join(target,'config.json'),JSON.stringify(publicConfig,null,2)+'\n');
}
writeFileSync(join(dist,'.nojekyll'),'');
if(deployment.customDomain)writeFileSync(join(dist,'CNAME'),deployment.customDomain+'\n');
console.log('Built GitHub Pages: /CC/ and /CC/admin/ (static public assets only)');
