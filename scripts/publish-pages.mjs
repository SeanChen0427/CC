import { execFileSync } from 'node:child_process';
import { mkdirSync, cpSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
const root=resolve(import.meta.dirname,'..'),target=join(root,'.local/pages');
const run=(cmd,args,cwd=root)=>execFileSync(cmd,args,{cwd,stdio:'inherit'});
run(process.execPath,['scripts/build-pages.mjs']);
mkdirSync(target,{recursive:true});
if(!existsSync(join(target,'.git'))){
  run('git',['init','-b','gh-pages'],target);
  run('git',['remote','add','origin','https://github.com/SeanChen0427/CC.git'],target);
}else{
  run('git',['pull','--rebase','origin','gh-pages'],target);
}
// Empty only the deployment worktree's tracked/untracked files; preserve its .git.
run('git',['rm','-r','--ignore-unmatch','.'],target);
run('git',['clean','-fd'],target);
cpSync(join(root,'dist'),target,{recursive:true});
run('git',['add','-A'],target);
let changed=true;
try{execFileSync('git',['diff','--cached','--quiet'],{cwd:target});changed=false;}catch{}
if(changed)run('git',['commit','-m','Deploy CCBABY static website'],target);
run('git',['push','origin','gh-pages'],target);
