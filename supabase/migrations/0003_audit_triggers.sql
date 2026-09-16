-- Audit log written by the database itself.
-- A signed-in founder holds the anon key and a JWT, so anything the app can do
-- through PostgREST they can do directly. Row-level triggers make every
-- insert, update and delete on the domain tables land in audit_log no matter
-- which path wrote it. The app keeps only the semantic actions
-- (confirm_import, confirm_payout, export) and records them through an RPC
-- that stamps the actor itself; direct inserts into audit_log are no longer allowed.

-- Service-role scripts (seed, reset) have no auth.uid(); keep their rows, actor unknown.
alter table audit_log alter column actor_user_id drop not null;

create or replace function audit_row_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  entity text := tg_argv[0];
  b jsonb := null;
  a jsonb := null;
  biz uuid;
  eid text;
  k text;
  old_j jsonb;
  new_j jsonb;
begin
  if tg_op = 'INSERT' then
    new_j := to_jsonb(new);
    a := new_j - 'business_id';
    biz := new.business_id;
    eid := coalesce(new_j->>'id', new_j->>'platform');
  elsif tg_op = 'DELETE' then
    old_j := to_jsonb(old);
    b := old_j - 'business_id';
    biz := old.business_id;
    eid := coalesce(old_j->>'id', old_j->>'platform');
  else
    old_j := to_jsonb(old);
    new_j := to_jsonb(new);
    b := '{}'::jsonb;
    a := '{}'::jsonb;
    for k in select jsonb_object_keys(new_j) loop
      if k <> 'business_id' and (new_j -> k) is distinct from (old_j -> k) then
        b := b || jsonb_build_object(k, old_j -> k);
        a := a || jsonb_build_object(k, new_j -> k);
      end if;
    end loop;
    if a = '{}'::jsonb then
      return null;
    end if;
    biz := new.business_id;
    eid := coalesce(new_j->>'id', new_j->>'platform');
  end if;

  insert into audit_log (business_id, actor_user_id, action, entity_type, entity_id, before, after)
  values (
    biz,
    auth.uid(),
    case tg_op when 'INSERT' then 'create'::audit_action when 'UPDATE' then 'update'::audit_action else 'delete'::audit_action end,
    entity,
    eid,
    b,
    a
  );
  return null;
end;
$$;

create trigger transactions_audit after insert or update or delete on transactions
  for each row execute function audit_row_change('transaction');
create trigger settlements_audit after insert or update or delete on settlements
  for each row execute function audit_row_change('settlement');
create trigger payouts_audit after insert or update or delete on payouts
  for each row execute function audit_row_change('payout');
create trigger internal_transfers_audit after insert or update or delete on internal_transfers
  for each row execute function audit_row_change('internal_transfer');
create trigger customers_audit after insert or update or delete on customers
  for each row execute function audit_row_change('customer');
create trigger platform_settings_audit after insert or update or delete on platform_settings
  for each row execute function audit_row_change('platform_setting');

-- Semantic actions the app records itself. The function fixes the actor and
-- business from the session, so a caller cannot write rows for anyone else.
create or replace function record_action(p_action audit_action, p_entity_type text, p_entity_id text, p_before jsonb, p_after jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_id uuid;
begin
  if auth.uid() is null then
    raise exception 'not signed in';
  end if;
  if p_action not in ('confirm_import', 'confirm_payout', 'export') then
    raise exception 'row-level changes are recorded by triggers, not by the app';
  end if;
  if p_entity_type not in ('report', 'payout') then
    raise exception 'unexpected entity type %', p_entity_type;
  end if;
  insert into audit_log (business_id, actor_user_id, action, entity_type, entity_id, before, after)
  values (current_business_id(), auth.uid(), p_action, p_entity_type, left(p_entity_id, 200), p_before, p_after)
  returning id into new_id;
  return new_id;
end;
$$;

revoke all on function record_action(audit_action, text, text, jsonb, jsonb) from public;
grant execute on function record_action(audit_action, text, text, jsonb, jsonb) to authenticated;

-- No more direct inserts: only the triggers and record_action() may write.
drop policy "members append audit log" on audit_log;
