create extension if not exists pgcrypto;

create type public.account_role as enum ('trainer', 'trainee');

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null default '',
  email text not null default '',
  role public.account_role not null default 'trainee',
  trainer_code text unique,
  created_at timestamptz not null default now(),
  constraint trainer_code_matches_role check (
    (role = 'trainer' and trainer_code is not null)
    or (role = 'trainee' and trainer_code is null)
  )
);

create table public.trainer_clients (
  trainer_id uuid not null references public.profiles (id) on delete cascade,
  trainee_id uuid primary key references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint trainer_cannot_link_self check (trainer_id <> trainee_id)
);

create table public.training_plans (
  id text primary key,
  owner_id uuid not null references public.profiles (id) on delete cascade,
  assigned_to uuid references public.profiles (id) on delete set null,
  name text not null,
  plan_data jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.training_sessions (
  id text primary key,
  plan_id text not null references public.training_plans (id) on delete cascade,
  trainee_id uuid not null references public.profiles (id) on delete cascade,
  session_data jsonb not null,
  completed_at timestamptz not null
);

create table public.training_reports (
  id text primary key,
  trainee_id uuid not null references public.profiles (id) on delete cascade,
  trainer_id uuid not null references public.profiles (id) on delete cascade,
  plan_id text not null references public.training_plans (id) on delete cascade,
  report_data jsonb not null,
  created_at timestamptz not null default now(),
  constraint training_report_sender_recipient_differ check (trainee_id <> trainer_id)
);

create index training_plans_owner_idx on public.training_plans (owner_id);
create index training_plans_assigned_idx on public.training_plans (assigned_to);
create index training_sessions_trainee_idx on public.training_sessions (trainee_id, completed_at desc);
create index training_reports_trainer_created_idx on public.training_reports (trainer_id, created_at desc);
create index training_reports_trainee_created_idx on public.training_reports (trainee_id, created_at desc);

create or replace function public.create_profile_for_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  selected_role public.account_role;
begin
  selected_role := case
    when new.raw_user_meta_data ->> 'role' = 'trainer' then 'trainer'::public.account_role
    else 'trainee'::public.account_role
  end;

  insert into public.profiles (id, full_name, role, trainer_code, email)
  values (
    new.id,
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''), split_part(new.email, '@', 1)),
    selected_role,
    case when selected_role = 'trainer' then upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10)) else null end,
    coalesce(new.email, '')
  );
  return new;
end;
$$;

create trigger on_auth_user_created_profile
  after insert on auth.users
  for each row execute procedure public.create_profile_for_new_user();

create or replace function public.prevent_profile_role_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.role is distinct from old.role or new.trainer_code is distinct from old.trainer_code then
    raise exception 'Account role and trainer code cannot be changed from the profile screen.';
  end if;
  return new;
end;
$$;

create trigger profile_role_is_immutable
  before update on public.profiles
  for each row execute procedure public.prevent_profile_role_change();

create or replace function public.connect_trainee_to_trainer(p_code text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  trainer_profile_id uuid;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in.';
  end if;

  if not exists (select 1 from public.profiles where id = auth.uid() and role = 'trainee') then
    raise exception 'Only trainee accounts can connect to a trainer.';
  end if;

  select id into trainer_profile_id
  from public.profiles
  where trainer_code = upper(trim(p_code)) and role = 'trainer';

  if trainer_profile_id is null then
    raise exception 'Trainer code was not found.';
  end if;

  insert into public.trainer_clients (trainer_id, trainee_id)
  values (trainer_profile_id, auth.uid())
  on conflict (trainee_id) do update set trainer_id = excluded.trainer_id, created_at = now();
end;
$$;

revoke all on function public.connect_trainee_to_trainer(text) from public;
grant execute on function public.connect_trainee_to_trainer(text) to authenticated;

create or replace function public.sync_profile_email()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.profiles set email = coalesce(new.email, '') where id = new.id;
  return new;
end;
$$;

create trigger on_auth_user_email_changed
  after update of email on auth.users
  for each row execute procedure public.sync_profile_email();

alter table public.profiles enable row level security;
alter table public.trainer_clients enable row level security;
alter table public.training_plans enable row level security;
alter table public.training_sessions enable row level security;
alter table public.training_reports enable row level security;

create policy "Read own or connected profiles" on public.profiles
  for select to authenticated
  using (
    id = auth.uid()
    or exists (select 1 from public.trainer_clients tc where tc.trainer_id = auth.uid() and tc.trainee_id = id)
    or exists (select 1 from public.trainer_clients tc where tc.trainee_id = auth.uid() and tc.trainer_id = id)
  );

create policy "Update own profile name" on public.profiles
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

create policy "Read own trainer relationships" on public.trainer_clients
  for select to authenticated
  using (trainer_id = auth.uid() or trainee_id = auth.uid());

create policy "Delete own trainer relationships" on public.trainer_clients
  for delete to authenticated
  using (trainer_id = auth.uid() or trainee_id = auth.uid());

create policy "Read own, assigned, or linked plans" on public.training_plans
  for select to authenticated
  using (
    owner_id = auth.uid()
    or assigned_to = auth.uid()
    or exists (select 1 from public.trainer_clients tc where tc.trainer_id = auth.uid() and tc.trainee_id = owner_id)
  );

create policy "Create own plans and assign to connected trainees" on public.training_plans
  for insert to authenticated
  with check (
    owner_id = auth.uid()
    and (assigned_to is null or exists (
      select 1 from public.profiles p
      join public.trainer_clients tc on tc.trainee_id = p.id
      where p.id = assigned_to and p.role = 'trainee' and tc.trainer_id = auth.uid()
    ))
  );

create policy "Update own plans and assignments" on public.training_plans
  for update to authenticated
  using (owner_id = auth.uid())
  with check (
    owner_id = auth.uid()
    and (assigned_to is null or exists (
      select 1 from public.trainer_clients tc where tc.trainer_id = auth.uid() and tc.trainee_id = assigned_to
    ))
  );


create policy "Trainers edit connected trainee plans" on public.training_plans
  for update to authenticated
  using (
    owner_id <> auth.uid()
    and exists (select 1 from public.trainer_clients tc where tc.trainer_id = auth.uid() and tc.trainee_id = owner_id)
  )
  with check (
    owner_id <> auth.uid()
    and exists (select 1 from public.trainer_clients tc where tc.trainer_id = auth.uid() and tc.trainee_id = owner_id)
    and (assigned_to is null or assigned_to = owner_id)
  );

create policy "Delete own plans" on public.training_plans
  for delete to authenticated
  using (owner_id = auth.uid());

create policy "Read own and connected trainees sessions" on public.training_sessions
  for select to authenticated
  using (
    trainee_id = auth.uid()
    or exists (select 1 from public.trainer_clients tc where tc.trainer_id = auth.uid() and tc.trainee_id = training_sessions.trainee_id)
  );

create policy "Create own or coached sessions for accessible plans" on public.training_sessions
  for insert to authenticated
  with check (
    (
      trainee_id = auth.uid()
      or exists (
        select 1 from public.trainer_clients tc
        where tc.trainer_id = auth.uid() and tc.trainee_id = training_sessions.trainee_id
      )
    )
    and exists (
      select 1 from public.training_plans p
      where p.id = plan_id and (p.owner_id = auth.uid() or p.assigned_to = trainee_id or p.owner_id = trainee_id)
    )
  );

create policy "Update own or coached sessions" on public.training_sessions
  for update to authenticated
  using (
    trainee_id = auth.uid()
    or exists (
      select 1 from public.trainer_clients tc
      where tc.trainer_id = auth.uid() and tc.trainee_id = training_sessions.trainee_id
    )
  )
  with check (
    trainee_id = auth.uid()
    or exists (
      select 1 from public.trainer_clients tc
      where tc.trainer_id = auth.uid() and tc.trainee_id = training_sessions.trainee_id
    )
  );

create policy "Delete own sessions" on public.training_sessions
  for delete to authenticated
  using (trainee_id = auth.uid());

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
