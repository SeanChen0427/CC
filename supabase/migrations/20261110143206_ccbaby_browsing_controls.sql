-- Owner-controlled observations only; never modify the revisioned business document.
create table ccbaby_private.browsing_controls (
  customer_id text primary key check(length(customer_id) between 1 and 160),
  excluded boolean not null default false,
  version bigint not null default 0 check(version>=0),
  accept_after timestamptz not null default '-infinity',
  cleared_at timestamptz,
  updated_at timestamptz not null default now()
);
alter table ccbaby_private.browsing_controls enable row level security;
revoke all on ccbaby_private.browsing_controls from public,anon,authenticated;
grant select,insert,update on ccbaby_private.browsing_controls to service_role;

create function public.ccbaby_browsing_manage(p_hash text,p_customer text,p_version bigint,p_action text,p_excluded boolean default null,p_confirm boolean default false)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare control ccbaby_private.browsing_controls%rowtype; cutoff timestamptz; removed bigint=0;
begin
  if not exists(select 1 from ccbaby_private.sessions x join ccbaby_private.store s on s.id=1
    where x.hash=p_hash and x.role='admin' and x.subject=s.owner_id::text and x.expires_at>now()) then
    return '{"unauthorized":true}'::jsonb;
  end if;
  if p_customer is null or length(p_customer) not between 1 and 160 or p_version is null or p_version<0
    or p_action is null or p_action not in ('clear','exclusion')
    or (p_action='clear' and p_confirm is distinct from true)
    or (p_action='exclusion' and p_excluded is null) then raise exception 'INVALID_CONTROL'; end if;
  if not exists(select 1 from ccbaby_private.store s cross join lateral jsonb_array_elements(s.data->'customers') c
    where s.id=1 and c->>'id'=p_customer) then return '{"notFound":true}'::jsonb; end if;
  insert into ccbaby_private.browsing_controls(customer_id) values(p_customer) on conflict do nothing;
  select * into control from ccbaby_private.browsing_controls where customer_id=p_customer for update;
  if control.version<>p_version then return '{"conflict":true}'::jsonb; end if;
  if p_action='clear' then
    select greatest(clock_timestamp(),control.accept_after,coalesce(max(occurred_at),'-infinity'::timestamptz)) into cutoff
      from ccbaby_private.browsing_events where customer_id=p_customer;
    delete from ccbaby_private.browsing_events where customer_id=p_customer;
    get diagnostics removed=row_count;
    update ccbaby_private.browsing_controls set accept_after=cutoff,cleared_at=clock_timestamp(),version=version+1,updated_at=clock_timestamp() where customer_id=p_customer;
  else
    update ccbaby_private.browsing_controls set excluded=p_excluded,
      accept_after=case when control.excluded and not p_excluded then greatest(clock_timestamp(),control.accept_after) else control.accept_after end,
      version=version+1,updated_at=clock_timestamp() where customer_id=p_customer;
  end if;
  return jsonb_build_object('ok',true,'deleted',removed);
end $$;
revoke all on function public.ccbaby_browsing_manage(text,text,bigint,text,boolean,boolean) from public,anon,authenticated;
grant execute on function public.ccbaby_browsing_manage(text,text,bigint,text,boolean,boolean) to service_role;

create or replace function public.ccbaby_browsing_write(p_hash text,p_events jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare who text; e jsonb; control ccbaby_private.browsing_controls%rowtype;
begin
  select subject into who from ccbaby_private.sessions
    where hash=p_hash and role='customer' and expires_at>now();
  if who is null then return '{"unauthorized":true}'::jsonb; end if;
  if jsonb_typeof(p_events)<>'array' or jsonb_array_length(p_events) not between 1 and 20 then raise exception 'INVALID_BATCH'; end if;
  insert into ccbaby_private.browsing_controls(customer_id) values(who) on conflict do nothing;
  select * into control from ccbaby_private.browsing_controls where customer_id=who for update;
  if control.excluded then return '{"ok":true}'::jsonb; end if;
  if (select count(*) from ccbaby_private.browsing_events where customer_id=who and received_at>now()-interval '1 minute')>200 then return '{"rateLimited":true}'::jsonb; end if;
  delete from ccbaby_private.browsing_events where occurred_at<now()-interval '180 days';
  for e in select value from jsonb_array_elements(p_events) loop
    if (e->>'at')::timestamptz<=control.accept_after then continue; end if;
    insert into ccbaby_private.browsing_events(customer_id,id,visit_id,occurred_at,event)
      values(who,(e->>'id')::uuid,(e->>'visitId')::uuid,(e->>'at')::timestamptz,e)
      on conflict(customer_id,id) do update set
        event=jsonb_set(ccbaby_private.browsing_events.event,'{activeMs}',to_jsonb(greatest((ccbaby_private.browsing_events.event->>'activeMs')::bigint,(excluded.event->>'activeMs')::bigint))),
        received_at=now();
  end loop;
  return '{"ok":true}'::jsonb;
end $$;

create or replace function public.ccbaby_browsing_read(p_hash text,p_days integer default 30,p_customer text default '',p_before_at timestamptz default null,p_before_id uuid default null)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare result jsonb; detail jsonb='[]'; interests jsonb='[]'; controls jsonb='[]'; since_at timestamptz;
begin
  if not exists(select 1 from ccbaby_private.sessions x join ccbaby_private.store s on s.id=1
    where x.hash=p_hash and x.role='admin' and x.subject=s.owner_id::text and x.expires_at>now()) then return '{"unauthorized":true}'::jsonb; end if;
  if p_days not in (7,30,180) then raise exception 'INVALID_DAYS'; end if;
  since_at=now()-make_interval(days=>p_days);
  select coalesce(jsonb_agg(m),'[]') into result from (
    select customer_id as "customerId",count(distinct visit_id) as visits,
      count(*) filter(where event->>'type'='page_view') as "pageViews",
      count(*) filter(where event->>'type'='page_view' and event->>'page'='product') as "productViews",
      coalesce(sum((event->>'activeMs')::bigint) filter(where event->>'type'='page_view'),0) as "activeMs",
      count(*) filter(where event->>'action'='cart_add') as "cartAdds",
      count(*) filter(where event->>'action'='submit_success') as submits,
      to_char(max(received_at) at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as "lastSeen"
    from ccbaby_private.browsing_events where occurred_at>=since_at group by customer_id
  ) m;
  if p_customer<>'' then
    select coalesce(jsonb_agg(r.event order by r.occurred_at desc,r.id desc),'[]') into detail from (
      select event,occurred_at,id from ccbaby_private.browsing_events
      where customer_id=p_customer and occurred_at>=since_at
        and (p_before_at is null or (occurred_at,id)<(p_before_at,p_before_id))
      order by occurred_at desc,id desc limit 201
    ) r;
    select coalesce(jsonb_agg(p order by p.views desc,p."activeMs" desc),'[]') into interests from (
      select (event->>'productId')::integer as "productId",max(event->>'productCode') as "productCode",max(event->>'productName') as "productName",
        count(*) filter(where event->>'type'='page_view') as views,
        coalesce(sum((event->>'activeMs')::bigint) filter(where event->>'type'='page_view'),0) as "activeMs",
        count(*) filter(where event->>'action'='cart_add') as "cartAdds"
      from ccbaby_private.browsing_events where customer_id=p_customer and occurred_at>=since_at and event ? 'productId'
      group by event->>'productId'
    ) p;
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('customerId',c->>'id','excluded',coalesce(b.excluded,false),'version',coalesce(b.version,0),
    'recordCount',(select count(*) from ccbaby_private.browsing_events e where e.customer_id=c->>'id'))),'[]'::jsonb) into controls
    from ccbaby_private.store s cross join lateral jsonb_array_elements(s.data->'customers') c
    left join ccbaby_private.browsing_controls b on b.customer_id=c->>'id' where s.id=1;
  return jsonb_build_object('metrics',result,'events',detail,'interests',interests,'controls',controls);
end $$;
revoke all on function public.ccbaby_browsing_write(text,jsonb),public.ccbaby_browsing_read(text,integer,text,timestamptz,uuid) from public,anon,authenticated;
grant execute on function public.ccbaby_browsing_write(text,jsonb),public.ccbaby_browsing_read(text,integer,text,timestamptz,uuid) to service_role;

-- Aggregate observations for the owner only. No customer-level output or business writes.
create or replace function public.ccbaby_merchandising_read(p_hash text,p_days integer default 30)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare since_at timestamptz; result jsonb; people bigint;
begin
  if not exists(select 1 from ccbaby_private.sessions x join ccbaby_private.store s on s.id=1
    where x.hash=p_hash and x.role='admin' and x.subject=s.owner_id::text and x.expires_at>now()) then
    return '{"unauthorized":true}'::jsonb;
  end if;
  if p_days not in (7,30,180) then raise exception 'INVALID_DAYS'; end if;
  since_at=now()-make_interval(days=>p_days);
  select count(distinct customer_id) into people from ccbaby_private.browsing_events e where e.occurred_at>=since_at and not exists(select 1 from ccbaby_private.browsing_controls c where c.customer_id=e.customer_id and c.excluded);
  select coalesce(jsonb_agg(p),'[]'::jsonb) into result from (
    select (event->>'productId')::integer as "productId",
      count(distinct customer_id) filter(where event->>'type'='page_view' and event->>'page'='product') as viewers,
      count(distinct customer_id) filter(where event->>'action'='cart_add') as "cartPeople"
    from ccbaby_private.browsing_events e where e.occurred_at>=since_at and not exists(select 1 from ccbaby_private.browsing_controls c where c.customer_id=e.customer_id and c.excluded) and event ? 'productId'
    group by event->>'productId'
  ) p;
  return jsonb_build_object('observedPeople',people,'products',result);
end $$;
revoke all on function public.ccbaby_merchandising_read(text,integer) from public,anon,authenticated;
grant execute on function public.ccbaby_merchandising_read(text,integer) to service_role;
