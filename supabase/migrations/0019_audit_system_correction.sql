-- A data correction made through the app's update path is already logged by
-- the row trigger. This lets the app add one more row beside it saying it
-- was a system correction and why, with the same before and after.
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
  if p_action::text = 'update' and p_entity_type = 'system_correction' then
    if not is_admin() then
      raise exception 'only an admin may note a system correction';
    end if;
  elsif p_action::text not in ('confirm_import', 'confirm_payout', 'export', 'denied') then
    raise exception 'row-level changes are recorded by triggers, not by the app';
  elsif p_action::text <> 'denied' and p_entity_type not in ('report', 'payout') then
    raise exception 'unexpected entity type %', p_entity_type;
  end if;
  insert into audit_log (business_id, actor_user_id, action, entity_type, entity_id, before, after)
  values (current_business_id(), auth.uid(), p_action, left(p_entity_type, 40), left(p_entity_id, 200), p_before, p_after)
  returning id into new_id;
  return new_id;
end;
$$;
