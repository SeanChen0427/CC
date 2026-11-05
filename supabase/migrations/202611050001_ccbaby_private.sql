-- CCBABY annual, low-volume preorder store. Never expose the private document.
create schema if not exists ccbaby_private;
revoke all on schema ccbaby_private from public, anon, authenticated;
grant usage on schema ccbaby_private to service_role;

create table ccbaby_private.store (
  id integer primary key check (id = 1),
  revision bigint not null default 0,
  owner_id uuid references auth.users(id),
  data jsonb not null check (jsonb_typeof(data) = 'object'),
  updated_at timestamptz not null default now()
);
insert into ccbaby_private.store(id,data) values(1,jsonb_build_object(
  'schemaVersion',1,'seq','{}'::jsonb,
  'campaign',jsonb_build_object('id',1,'name','CCBABY 韓國預購','status','draft','closesAt',now(),'description','韓國親自採買，到台後再通知付款。'),
  'products','[]'::jsonb,'variants','[]'::jsonb,'customers','[]'::jsonb,
  'preorders','[]'::jsonb,'items','[]'::jsonb,'procurement','[]'::jsonb,
  'submissions','[]'::jsonb,'events','[]'::jsonb,'closing_snapshots','[]'::jsonb
));
create table ccbaby_private.sessions (
  hash text primary key check(length(hash)=64),
  role text not null check(role in ('admin','customer')),
  subject text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index ccbaby_session_expiry on ccbaby_private.sessions(expires_at);
create table ccbaby_private.login_limits (
  bucket text primary key, count integer not null, until_at timestamptz not null
);
alter table ccbaby_private.store enable row level security;
alter table ccbaby_private.sessions enable row level security;
alter table ccbaby_private.login_limits enable row level security;
revoke all on all tables in schema ccbaby_private from public, anon, authenticated;
grant all on all tables in schema ccbaby_private to service_role;

create function public.ccbaby_load(p_hash text default '',p_role text default 'customer')
returns jsonb language sql security definer set search_path = '' as $$
  select jsonb_build_object('revision',s.revision,'data',s.data,'owner_id',s.owner_id,
    'session',(select jsonb_build_object('role',x.role,'subject',x.subject) from ccbaby_private.sessions x
      where x.hash=p_hash and x.role=p_role and x.expires_at>now()
      and (x.role<>'admin' or x.subject=s.owner_id::text)))
  from ccbaby_private.store s where s.id=1
$$;
create function public.ccbaby_commit(p_revision bigint,p_data jsonb,p_hash text,p_role text)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  if not exists(select 1 from ccbaby_private.sessions x join ccbaby_private.store s on s.id=1
    where x.hash=p_hash and x.role=p_role and x.expires_at>now()
      and (x.role<>'admin' or x.subject=s.owner_id::text)) then
    raise exception 'SESSION_EXPIRED';
  end if;
  if octet_length(p_data::text)>16777216 then raise exception 'STORE_LIMIT'; end if;
  update ccbaby_private.store set data=p_data,revision=revision+1,updated_at=now()
    where id=1 and revision=p_revision;
  return found;
end $$;
create function public.ccbaby_owner(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update ccbaby_private.store set owner_id=p_id where id=1 and owner_id is null;
  if not found then raise exception 'OWNER_ALREADY_EXISTS'; end if;
end $$;
create function public.ccbaby_session_create(p_hash text,p_role text,p_subject text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_role='admin' and not exists(select 1 from ccbaby_private.store where id=1 and owner_id::text=p_subject) then raise exception 'INVALID_OWNER'; end if;
  if p_role='customer' and not exists(select 1 from ccbaby_private.store s,jsonb_array_elements(s.data->'customers') c where c->>'id'=p_subject) then raise exception 'INVALID_CUSTOMER'; end if;
  delete from ccbaby_private.sessions where expires_at<=now();
  insert into ccbaby_private.sessions(hash,role,subject,expires_at) values(p_hash,p_role,p_subject,now()+interval '12 hours');
end $$;
create function public.ccbaby_revoke(p_hash text default '',p_all_admin boolean default false)
returns void language sql security definer set search_path = '' as $$
  delete from ccbaby_private.sessions where hash=p_hash or (p_all_admin and role='admin')
$$;
create function public.ccbaby_login_attempt(p_bucket text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare n integer;
begin
  delete from ccbaby_private.login_limits where until_at<=now();
  insert into ccbaby_private.login_limits(bucket,count,until_at) values(p_bucket,1,now()+interval '5 minutes')
    on conflict(bucket) do update set count=ccbaby_private.login_limits.count+1 returning count into n;
  return n<=8;
end $$;
-- LINE identity is obtained from a verified ID token by the Edge Function only.
create function public.ccbaby_line_customer(p_id text,p_name text)
returns void language plpgsql security definer set search_path = '' as $$
declare d jsonb; cs jsonb;
begin
  select data into d from ccbaby_private.store where id=1 for update;
  select coalesce(jsonb_agg(case when c->>'id'=p_id then c||jsonb_build_object('display_name',left(p_name,80)) else c end),'[]'::jsonb)
    into cs from jsonb_array_elements(d->'customers') c;
  if not exists(select 1 from jsonb_array_elements(cs) c where c->>'id'=p_id) then
    cs=cs||jsonb_build_array(jsonb_build_object('id',p_id,'display_name',left(p_name,80),'name','','phone','','delivery',''));
  end if;
  update ccbaby_private.store set data=jsonb_set(d,'{customers}',cs),revision=revision+1,updated_at=now() where id=1;
end $$;
revoke all on function public.ccbaby_load(text,text),public.ccbaby_commit(bigint,jsonb,text,text),public.ccbaby_owner(uuid),public.ccbaby_session_create(text,text,text),public.ccbaby_revoke(text,boolean),public.ccbaby_login_attempt(text),public.ccbaby_line_customer(text,text) from public,anon,authenticated;
grant execute on function public.ccbaby_load(text,text),public.ccbaby_commit(bigint,jsonb,text,text),public.ccbaby_owner(uuid),public.ccbaby_session_create(text,text,text),public.ccbaby_revoke(text,boolean),public.ccbaby_login_attempt(text),public.ccbaby_line_customer(text,text) to service_role;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('ccbaby-products','ccbaby-products',true,1400000,array['image/png','image/jpeg','image/webp']);
-- Public product photos only. Uploads require the authenticated owner Edge API.
