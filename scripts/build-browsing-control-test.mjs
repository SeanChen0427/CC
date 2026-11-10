import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { resolve, join } from 'node:path';

const root=resolve(import.meta.dirname,'..'), directory=join(root,'supabase/migrations');
const names=readdirSync(directory).filter(name=>name.endsWith('_ccbaby_browsing_controls.sql'));
if(names.length!==1)throw new Error('Expected one browsing controls migration');
const migration=readFileSync(join(directory,names[0]),'utf8');
const observations=readFileSync(join(directory,'20261107164621_ccbaby_browsing.sql'),'utf8').split('create function')[0];
const checks=readFileSync(join(root,'tests/browsing-controls.sql'),'utf8').replace('begin;','');
// Independent schema and function names: no real store, member, session or event is modified.
let sql=`begin;
create schema ccbaby_control_fixture;
grant usage on schema ccbaby_control_fixture to service_role;
create table ccbaby_control_fixture.store(id integer primary key,owner_id uuid,data jsonb);
insert into ccbaby_control_fixture.store values(1,'10000000-0000-4000-8000-000000000000','{"customers":[]}');
create table ccbaby_control_fixture.sessions(hash text primary key check(length(hash)=64),role text,subject text,expires_at timestamptz);
`+observations+'\n'+migration+'\n'+checks;
sql=sql.replaceAll('ccbaby_private','ccbaby_control_fixture').replaceAll('public.ccbaby_','public.ccbaby_fixture_');
sql+="\nselect to_regclass('ccbaby_control_fixture.browsing_controls') is null as isolated_trial_rolled_back;\n";
const target=join(root,'.local/browsing-control-trial.sql');
mkdirSync(join(root,'.local'),{recursive:true});writeFileSync(target,sql);
console.log('Built isolated rollback-only SQL verification: .local/browsing-control-trial.sql');
