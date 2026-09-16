-- MikiSai Accounting v2.1: roles, created_by, soft delete, transfer kind,
-- payout timing settings and the exposure limit for My Balance.

-- ---------------------------------------------------------------------------
-- 1. Roles
-- ---------------------------------------------------------------------------
create type user_role as enum ('admin', 'contributor');
alter table profiles add column role user_role not null default 'contributor';
update profiles set role = 'admin' where display_name = 'Mike';

create or replace function is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select role = 'admin' from profiles where id = auth.uid()), false);
$$;
revoke all on function is_admin() from public;
grant execute on function is_admin() to authenticated;

-- ---------------------------------------------------------------------------
-- 2. New columns
-- ---------------------------------------------------------------------------
create type transfer_kind as enum ('settlement', 'capital');
alter table internal_transfers add column kind transfer_kind not null default 'settlement';

alter table platform_settings
  add column settlement_lag_days integer not null default 10 check (settlement_lag_days between 0 and 120),
  add column daily_payout_pct numeric(5, 2) not null default 100 check (daily_payout_pct >= 0 and daily_payout_pct <= 100);

alter table businesses add column exposure_limit numeric(12, 2) not null default 3000 check (exposure_limit >= 0);

-- Who created each row. Defaults to the signed-in user so every app insert is stamped without code changes.
alter table transactions add column created_by uuid references auth.users (id) on delete set null default auth.uid();
alter table settlements add column created_by uuid references auth.users (id) on delete set null default auth.uid();
alter table payouts add column created_by uuid references auth.users (id) on delete set null default auth.uid();
alter table internal_transfers add column created_by uuid references auth.users (id) on delete set null default auth.uid();
alter table customers add column created_by uuid references auth.users (id) on delete set null default auth.uid();
alter table report_uploads add column created_by uuid references auth.users (id) on delete set null default auth.uid();

-- Soft delete. Rows are never removed through the API; they are hidden and can be restored.
alter table transactions add column deleted_at timestamptz null, add column deleted_by uuid references auth.users (id) on delete set null;
alter table payouts add column deleted_at timestamptz null, add column deleted_by uuid references auth.users (id) on delete set null;
alter table internal_transfers add column deleted_at timestamptz null, add column deleted_by uuid references auth.users (id) on delete set null;
alter table customers add column deleted_at timestamptz null, add column deleted_by uuid references auth.users (id) on delete set null;

create index transactions_live_idx on transactions (business_id, date desc) where deleted_at is null;
create index payouts_live_idx on payouts (business_id, date desc) where deleted_at is null;
create index internal_transfers_live_idx on internal_transfers (business_id, date desc) where deleted_at is null;
create index customers_live_idx on customers (business_id) where deleted_at is null;

-- ---------------------------------------------------------------------------
-- 3. Audit: distinct actions for soft delete, restore and refused attempts
-- ---------------------------------------------------------------------------
alter type audit_action add value if not exists 'soft_delete';
alter type audit_action add value if not exists 'restore';
alter type audit_action add value if not exists 'denied';

create or replace function audit_row_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  entity text := tg_argv[0];
  act text;
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
    act := 'create';
  elsif tg_op = 'DELETE' then
    old_j := to_jsonb(old);
    b := old_j - 'business_id';
    biz := old.business_id;
    eid := coalesce(old_j->>'id', old_j->>'platform');
    act := 'delete';
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
    if (old_j ? 'deleted_at') and (old_j->>'deleted_at') is null and (new_j->>'deleted_at') is not null then
      act := 'soft_delete';
    elsif (old_j ? 'deleted_at') and (old_j->>'deleted_at') is not null and (new_j->>'deleted_at') is null then
      act := 'restore';
    else
      act := 'update';
    end if;
  end if;

  insert into audit_log (business_id, actor_user_id, action, entity_type, entity_id, before, after)
  values (biz, auth.uid(), act::audit_action, entity, eid, b, a);
  return null;
end;
$$;

-- Settings changes and the exposure limit are audited too.
create trigger businesses_audit after update on businesses
  for each row execute function audit_row_change('business');

-- Refused attempts are recorded by the app through record_action().
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
  if p_action::text not in ('confirm_import', 'confirm_payout', 'export', 'denied') then
    raise exception 'row-level changes are recorded by triggers, not by the app';
  end if;
  if p_action::text <> 'denied' and p_entity_type not in ('report', 'payout') then
    raise exception 'unexpected entity type %', p_entity_type;
  end if;
  insert into audit_log (business_id, actor_user_id, action, entity_type, entity_id, before, after)
  values (current_business_id(), auth.uid(), p_action, left(p_entity_type, 40), left(p_entity_id, 200), p_before, p_after)
  returning id into new_id;
  return new_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Row level security by role. No DELETE policy exists on any table.
-- ---------------------------------------------------------------------------
-- The audit trigger writes on behalf of the business and needs to see the business row.
-- businesses trigger is fine (security definer).

drop policy "members manage transactions" on transactions;
drop policy "members manage settlements" on settlements;
drop policy "members manage payouts" on payouts;
drop policy "members manage internal transfers" on internal_transfers;
drop policy "members manage customers" on customers;
drop policy "members manage platform settings" on platform_settings;
drop policy "members manage report uploads" on report_uploads;
drop policy "members read audit log" on audit_log;

-- Everyone in the business can read everything except the audit log (admin only).
create policy "members read transactions" on transactions for select to authenticated using (business_id = current_business_id());
create policy "members read settlements" on settlements for select to authenticated using (business_id = current_business_id());
create policy "members read payouts" on payouts for select to authenticated using (business_id = current_business_id());
create policy "members read internal transfers" on internal_transfers for select to authenticated using (business_id = current_business_id());
create policy "members read customers" on customers for select to authenticated using (business_id = current_business_id());
create policy "members read platform settings" on platform_settings for select to authenticated using (business_id = current_business_id());
create policy "members read report uploads" on report_uploads for select to authenticated using (business_id = current_business_id());
create policy "admin reads audit log" on audit_log for select to authenticated using (business_id = current_business_id() and is_admin());

-- Both roles may add rows, stamped with themselves, never pre-deleted.
create policy "members insert transactions" on transactions for insert to authenticated
  with check (business_id = current_business_id() and created_by = auth.uid() and deleted_at is null);
create policy "members insert settlements" on settlements for insert to authenticated
  with check (business_id = current_business_id() and created_by = auth.uid());
create policy "members insert payouts" on payouts for insert to authenticated
  with check (business_id = current_business_id() and created_by = auth.uid() and deleted_at is null);
create policy "members insert internal transfers" on internal_transfers for insert to authenticated
  with check (business_id = current_business_id() and created_by = auth.uid() and deleted_at is null);
create policy "members insert customers" on customers for insert to authenticated
  with check (business_id = current_business_id() and created_by = auth.uid() and deleted_at is null);
create policy "members insert report uploads" on report_uploads for insert to authenticated
  with check (business_id = current_business_id() and created_by = auth.uid());

-- Updates: admin anywhere in the business; contributor only own rows created in the last 24 hours.
create policy "role-based update transactions" on transactions for update to authenticated
  using (business_id = current_business_id() and (is_admin() or (created_by = auth.uid() and created_at > now() - interval '24 hours')))
  with check (business_id = current_business_id() and (is_admin() or created_by = auth.uid()));
create policy "role-based update settlements" on settlements for update to authenticated
  using (business_id = current_business_id() and (is_admin() or (created_by = auth.uid() and created_at > now() - interval '24 hours')))
  with check (business_id = current_business_id() and (is_admin() or created_by = auth.uid()));
create policy "role-based update payouts" on payouts for update to authenticated
  using (business_id = current_business_id() and (is_admin() or (created_by = auth.uid() and created_at > now() - interval '24 hours')))
  with check (business_id = current_business_id() and (is_admin() or created_by = auth.uid()));
create policy "role-based update internal transfers" on internal_transfers for update to authenticated
  using (business_id = current_business_id() and (is_admin() or (created_by = auth.uid() and created_at > now() - interval '24 hours')))
  with check (business_id = current_business_id() and (is_admin() or created_by = auth.uid()));
create policy "role-based update customers" on customers for update to authenticated
  using (business_id = current_business_id() and (is_admin() or (created_by = auth.uid() and created_at > now() - interval '24 hours')))
  with check (business_id = current_business_id() and (is_admin() or created_by = auth.uid()));
create policy "role-based update report uploads" on report_uploads for update to authenticated
  using (business_id = current_business_id() and (is_admin() or (created_by = auth.uid() and uploaded_at > now() - interval '24 hours')))
  with check (business_id = current_business_id() and (is_admin() or created_by = auth.uid()));

-- Settings and the business row: admin only.
create policy "admin writes platform settings" on platform_settings for insert to authenticated
  with check (business_id = current_business_id() and is_admin());
create policy "admin updates platform settings" on platform_settings for update to authenticated
  using (business_id = current_business_id() and is_admin())
  with check (business_id = current_business_id() and is_admin());
create policy "admin updates business" on businesses for update to authenticated
  using (id = current_business_id() and is_admin())
  with check (id = current_business_id() and is_admin());
