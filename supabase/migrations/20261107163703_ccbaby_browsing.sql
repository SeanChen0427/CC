-- Observations are separate from the revisioned preorder document.
create table ccbaby_private.browsing_events (
  customer_id text not null,
  id uuid not null,
  visit_id uuid not null,
  occurred_at timestamptz not null,
  received_at timestamptz not null default now(),
  event jsonb not null check(jsonb_typeof(event)='object'),
  primary key(customer_id,id)
);
create index browsing_time on ccbaby_private.browsing_events(occurred_at);
create index browsing_customer_time on ccbaby_private.browsing_events(customer_id,occurred_at desc,id desc);
alter table ccbaby_private.browsing_events enable row level security;
revoke all on ccbaby_private.browsing_events from public,anon,authenticated;
grant all on ccbaby_private.browsing_events to service_role;

create function public.ccbaby_browsing_write(p_hash text,p_events jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare who text; e jsonb;
begin
  select subject into who from ccbaby_private.sessions
    where hash=p_hash and role='customer' and expires_at>now();
  if who is null then return '{"unauthorized":true}'::jsonb; end if;
  if jsonb_typeof(p_events)<>'array' or jsonb_array_length(p_events) not between 1 and 20 then raise exception 'INVALID_BATCH'; end if;
  if (select count(*) from ccbaby_private.browsing_events where customer_id=who and received_at>now()-interval '1 minute')>200 then return '{"rateLimited":true}'::jsonb; end if;
  delete from ccbaby_private.browsing_events where occurred_at<now()-interval '180 days';
  for e in select value from jsonb_array_elements(p_events) loop
    insert into ccbaby_private.browsing_events(customer_id,id,visit_id,occurred_at,event)
      values(who,(e->>'id')::uuid,(e->>'visitId')::uuid,(e->>'at')::timestamptz,e)
      on conflict(customer_id,id) do update set
        event=jsonb_set(ccbaby_private.browsing_events.event,'{activeMs}',to_jsonb(greatest((ccbaby_private.browsing_events.event->>'activeMs')::bigint,(excluded.event->>'activeMs')::bigint))),
        received_at=now();
  end loop;
  return '{"ok":true}'::jsonb;
end $$;

create function public.ccbaby_browsing_read(p_hash text,p_days integer default 30,p_customer text default '',p_before_at timestamptz default null,p_before_id uuid default null)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare result jsonb; detail jsonb='[]'; interests jsonb='[]'; since_at timestamptz;
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
  return jsonb_build_object('metrics',result,'events',detail,'interests',interests);
end $$;
revoke all on function public.ccbaby_browsing_write(text,jsonb),public.ccbaby_browsing_read(text,integer,text,timestamptz,uuid) from public,anon,authenticated;
grant execute on function public.ccbaby_browsing_write(text,jsonb),public.ccbaby_browsing_read(text,integer,text,timestamptz,uuid) to service_role;
