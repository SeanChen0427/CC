-- Build the isolated runnable transaction with scripts/build-browsing-control-test.mjs.
-- Always roll back synthetic identities, sessions, observations and control settings.
begin;
do $$
declare owner_hash text=repeat('a',64); member_hash text=repeat('b',64);
  a text='fixture-browsing-a'; b text='fixture-browsing-b';
  event_a jsonb; event_b jsonb; fresh jsonb; result jsonb; business_hash text; rejected boolean; n bigint;
begin
  if exists(select 1 from ccbaby_private.store s cross join lateral jsonb_array_elements(s.data->'customers') c where c->>'id' in (a,b)) then raise exception 'FIXTURE_ALREADY_EXISTS'; end if;
  if has_table_privilege('anon','ccbaby_private.browsing_controls','SELECT')
    or has_table_privilege('authenticated','ccbaby_private.browsing_controls','UPDATE')
    or has_function_privilege('anon','public.ccbaby_browsing_manage(text,text,bigint,text,boolean,boolean)','EXECUTE')
    or has_function_privilege('authenticated','public.ccbaby_browsing_manage(text,text,bigint,text,boolean,boolean)','EXECUTE') then raise exception 'PUBLIC_PRIVILEGES'; end if;
  update ccbaby_private.store set data=jsonb_set(data,'{customers}',(data->'customers')||jsonb_build_array(jsonb_build_object('id',a,'display_name','Fixture A'),jsonb_build_object('id',b,'display_name','Fixture B'))) where id=1;
  insert into ccbaby_private.sessions(hash,role,subject,expires_at)
    select owner_hash,'admin',owner_id::text,now()+interval '1 hour' from ccbaby_private.store where id=1;
  insert into ccbaby_private.sessions(hash,role,subject,expires_at) values(member_hash,'customer',a,now()+interval '1 hour');
  select md5(data::text) into business_hash from ccbaby_private.store where id=1;
  event_a=jsonb_build_object('id','10000000-0000-4000-8000-000000000001','visitId','20000000-0000-4000-8000-000000000001','at',clock_timestamp()-interval '1 minute','type','page_view','page','product','productId',999999,'activeMs',1000);
  event_b=event_a||jsonb_build_object('id','10000000-0000-4000-8000-000000000002');
  perform public.ccbaby_browsing_write(member_hash,jsonb_build_array(event_a));
  insert into ccbaby_private.browsing_events(customer_id,id,visit_id,occurred_at,event) values(b,(event_b->>'id')::uuid,(event_b->>'visitId')::uuid,(event_b->>'at')::timestamptz,event_b);
  if not (public.ccbaby_browsing_manage('',a,0,'clear',null,true)->>'unauthorized')::boolean then raise exception 'ANONYMOUS_ACCEPTED'; end if;
  if not (public.ccbaby_browsing_manage(member_hash,a,0,'clear',null,true)->>'unauthorized')::boolean then raise exception 'CUSTOMER_ACCEPTED'; end if;
  if not (public.ccbaby_browsing_manage(owner_hash,'fixture-missing',0,'clear',null,true)->>'notFound')::boolean then raise exception 'UNKNOWN_CUSTOMER'; end if;
  if not (public.ccbaby_browsing_manage(owner_hash,a,1,'clear',null,true)->>'conflict')::boolean then raise exception 'STALE_VERSION'; end if;
  rejected=false;
  begin perform public.ccbaby_browsing_manage(owner_hash,a,0,'clear',null,false); exception when others then rejected=true; end;
  if not rejected then raise exception 'MISSING_CONFIRMATION'; end if;
  result=public.ccbaby_browsing_manage(owner_hash,a,0,'exclusion',true,false);
  if not (result->>'ok')::boolean then raise exception 'EXCLUSION_FAILED'; end if;
  result=public.ccbaby_merchandising_read(owner_hash,30);
  select (p->>'viewers')::bigint into n from jsonb_array_elements(result->'products') p where p->>'productId'='999999';
  if n is distinct from 1 then raise exception 'TEST_ACCOUNT_STILL_IN_RANKING'; end if;
  fresh=event_a||jsonb_build_object('id','10000000-0000-4000-8000-000000000003','at',clock_timestamp());
  perform public.ccbaby_browsing_write(member_hash,jsonb_build_array(fresh));
  if (select count(*) from ccbaby_private.browsing_events where customer_id=a)<>1 then raise exception 'EXCLUDED_WRITE_SAVED'; end if;
  result=public.ccbaby_browsing_manage(owner_hash,a,1,'clear',null,true);
  if (result->>'deleted')::bigint<>1 then raise exception 'CLEAR_COUNT'; end if;
  if exists(select 1 from ccbaby_private.browsing_events where customer_id=a) then raise exception 'CLEAR_REMAINS'; end if;
  if (select count(*) from ccbaby_private.browsing_events where customer_id=b)<>1 then raise exception 'PEER_DELETED'; end if;
  if not (public.ccbaby_browsing_manage(owner_hash,a,1,'clear',null,true)->>'conflict')::boolean then raise exception 'CLEAR_REPLAY_ACCEPTED'; end if;
  perform public.ccbaby_browsing_manage(owner_hash,a,2,'exclusion',false,false);
  perform public.ccbaby_browsing_write(member_hash,jsonb_build_array(event_a,fresh));
  if exists(select 1 from ccbaby_private.browsing_events where customer_id=a) then raise exception 'OLD_QUEUE_RESURRECTED'; end if;
  fresh=fresh||jsonb_build_object('at',clock_timestamp()+interval '1 second');
  perform public.ccbaby_browsing_write(member_hash,jsonb_build_array(fresh));
  if (select count(*) from ccbaby_private.browsing_events where customer_id=a)<>1 then raise exception 'RESTORED_WRITE_MISSING'; end if;
  result=public.ccbaby_browsing_read(owner_hash,30,a);
  if jsonb_array_length(result->'events')<>1 then raise exception 'READ_COUNT'; end if;
  perform public.ccbaby_browsing_manage(owner_hash,a,3,'clear',null,true);
  perform public.ccbaby_browsing_write(member_hash,jsonb_build_array(fresh));
  if exists(select 1 from ccbaby_private.browsing_events where customer_id=a) then raise exception 'FUTURE_CLOCK_REPLAY'; end if;
  if (select md5(data::text) from ccbaby_private.store where id=1)<>business_hash then raise exception 'BUSINESS_DOCUMENT_CHANGED'; end if;
end $$;
rollback;
