create table if not exists public.training_reports (
  id text primary key,
  trainee_id uuid not null references public.profiles (id) on delete cascade,
  trainer_id uuid not null references public.profiles (id) on delete cascade,
  plan_id text not null references public.training_plans (id) on delete cascade,
  report_data jsonb not null,
  created_at timestamptz not null default now(),
  constraint training_report_sender_recipient_differ check (trainee_id <> trainer_id)
);

create index if not exists training_reports_trainer_created_idx
  on public.training_reports (trainer_id, created_at desc);
create index if not exists training_reports_trainee_created_idx
  on public.training_reports (trainee_id, created_at desc);

alter table public.training_reports enable row level security;

create policy "Trainees and their trainer can read reports" on public.training_reports
  for select to authenticated
  using (
    trainee_id = auth.uid()
    or exists (
      select 1 from public.trainer_clients tc
      where tc.trainer_id = auth.uid()
        and tc.trainee_id = training_reports.trainee_id
        and tc.trainer_id = training_reports.trainer_id
    )
  );

create policy "Trainees can send reports to their connected trainer" on public.training_reports
  for insert to authenticated
  with check (
    trainee_id = auth.uid()
    and exists (
      select 1 from public.trainer_clients tc
      where tc.trainer_id = training_reports.trainer_id
        and tc.trainee_id = auth.uid()
    )
    and exists (
      select 1 from public.training_plans p
      where p.id = training_reports.plan_id
        and (p.owner_id = auth.uid() or p.assigned_to = auth.uid() or p.owner_id = training_reports.trainer_id)
    )
  );
