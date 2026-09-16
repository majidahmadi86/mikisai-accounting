-- Data health runs: one row each time the checks run (page load or the daily
-- cron), so Home can show when the books were last checked and how many
-- issues were open. Members read and add; nobody updates or deletes.
create table health_runs (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  ran_at timestamptz not null default now(),
  issues integer not null check (issues >= 0),
  summary jsonb not null default '{}'::jsonb,
  source text not null check (source in ('page', 'daily')),
  created_by uuid null references auth.users(id)
);
create index health_runs_business_ran_at on health_runs (business_id, ran_at desc);

alter table health_runs enable row level security;
create policy "members read health runs" on health_runs for select to authenticated using (business_id = current_business_id());
create policy "members add health runs" on health_runs for insert to authenticated with check (business_id = current_business_id() and created_by = auth.uid());
