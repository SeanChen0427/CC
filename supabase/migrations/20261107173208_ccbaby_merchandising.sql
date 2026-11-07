-- Aggregate observations for the owner only. No customer-level output or business writes.
create function public.ccbaby_merchandising_read(p_hash text,p_days integer default 30)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare since_at timestamptz; result jsonb; people bigint;
begin
  if not exists(select 1 from ccbaby_private.sessions x join ccbaby_private.store s on s.id=1
    where x.hash=p_hash and x.role='admin' and x.subject=s.owner_id::text and x.expires_at>now()) then
    return '{"unauthorized":true}'::jsonb;
  end if;
  if p_days not in (7,30,180) then raise exception 'INVALID_DAYS'; end if;
  since_at=now()-make_interval(days=>p_days);
  select count(distinct customer_id) into people from ccbaby_private.browsing_events where occurred_at>=since_at;
  select coalesce(jsonb_agg(p),'[]'::jsonb) into result from (
    select (event->>'productId')::integer as "productId",
      count(distinct customer_id) filter(where event->>'type'='page_view' and event->>'page'='product') as viewers,
      count(distinct customer_id) filter(where event->>'action'='cart_add') as "cartPeople"
    from ccbaby_private.browsing_events where occurred_at>=since_at and event ? 'productId'
    group by event->>'productId'
  ) p;
  return jsonb_build_object('observedPeople',people,'products',result);
end $$;
revoke all on function public.ccbaby_merchandising_read(text,integer) from public,anon,authenticated;
grant execute on function public.ccbaby_merchandising_read(text,integer) to service_role;
