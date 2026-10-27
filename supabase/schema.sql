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

create table public.exercise_catalog (
  id text primary key,
  pl text not null,
  en text not null,
  category text not null,
  description text not null,
  created_by uuid references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now(),
  constraint exercise_catalog_name_pl_not_empty check (length(trim(pl)) > 0),
  constraint exercise_catalog_name_en_not_empty check (length(trim(en)) > 0),
  constraint exercise_catalog_description_not_empty check (length(trim(description)) > 0)
);

create index exercise_catalog_category_name_idx on public.exercise_catalog (category, pl);
alter table public.exercise_catalog enable row level security;

create policy "Authenticated users can read exercise catalog" on public.exercise_catalog
  for select to authenticated using (true);

create policy "Trainers can add exercise catalog entries" on public.exercise_catalog
  for insert to authenticated with check (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'trainer')
  );

create policy "Trainers can edit exercise catalog entries" on public.exercise_catalog
  for update to authenticated using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'trainer')
  ) with check (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'trainer')
  );


-- Journal writes use compare-and-swap revisions. The same operation can be retried safely.
create table public.workout_checkpoints (
  id text primary key,
  trainee_id uuid not null references public.profiles(id) on delete cascade,
  writer_id text not null,
  revision integer not null default 1,
  client_sequence bigint not null default 0,
  operation_id text not null,
  state text not null check (state in ('active', 'completed')),
  payload jsonb not null,
  session_data jsonb,
  updated_at timestamptz not null default now()
);
create unique index one_active_workout_per_trainee on public.workout_checkpoints(trainee_id) where state = 'active';
alter table public.workout_checkpoints enable row level security;
revoke all on public.workout_checkpoints from anon, authenticated;
grant select on public.workout_checkpoints to authenticated;
create policy "Read own or coached workout checkpoint" on public.workout_checkpoints
  for select to authenticated using (
    trainee_id = (select auth.uid()) or exists (
      select 1 from public.trainer_clients tc where tc.trainer_id = (select auth.uid()) and tc.trainee_id = workout_checkpoints.trainee_id
    )
  );

create or replace function public.save_workout_checkpoint(
  p_owner uuid, p_writer text, p_expected_revision integer, p_operation text, p_payload jsonb, p_session jsonb default null
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  existing public.workout_checkpoints;
  other_active public.workout_checkpoints;
  workout_id text := p_payload->>'id';
  plan_id_value text := p_payload->'plan'->>'id';
  client_seq bigint := substring(p_operation from ':([0-9]+)$')::bigint;
  result_state text := case when p_session is null then 'active' else 'completed' end;
begin
  if auth.uid() is null or not (p_owner = auth.uid() or exists (
    select 1 from public.trainer_clients tc where tc.trainer_id = auth.uid() and tc.trainee_id = p_owner
  )) then raise exception 'Workout access denied' using errcode = '42501'; end if;
  if client_seq is null or client_seq < 1 or coalesce(workout_id, '') = '' or coalesce(p_writer, '') = '' or coalesce(p_operation, '') = ''
    or pg_column_size(p_payload) > 1048576 or coalesce(pg_column_size(p_session), 0) > 1048576
    or jsonb_typeof(p_payload->'values') is distinct from 'object'
    or jsonb_typeof(p_payload->'counts') is distinct from 'object'
    or jsonb_typeof(p_payload->'day') is distinct from 'object'
    or jsonb_typeof(p_payload->'targetDay') is distinct from 'object'
    or not exists (select 1 from public.training_plans p where p.id = plan_id_value
      and (p.owner_id = p_owner or p.assigned_to = p_owner))
  then raise exception 'Invalid workout or inaccessible plan' using errcode = '22023'; end if;
  if p_session is not null and (
    p_session->>'id' is distinct from workout_id or p_session->>'planId' is distinct from plan_id_value
    or p_session->>'dayId' is distinct from p_payload->'day'->>'id'
    or jsonb_typeof(p_session->'exercises') is distinct from 'array'
    or p_session->'planSnapshot' is distinct from p_payload->'plan'
    or p_session->'targetDay' is distinct from p_payload->'targetDay'
  ) then raise exception 'Invalid session snapshot' using errcode = '22023'; end if;

  -- Serialize both starting another day and saving the current one for this trainee.
  perform pg_advisory_xact_lock(hashtextextended(p_owner::text, 0));
  select * into existing from public.workout_checkpoints where id = workout_id for update;
  if found then
    if existing.trainee_id <> p_owner then raise exception 'Workout access denied' using errcode = '42501'; end if;
    if existing.operation_id = p_operation and existing.writer_id = p_writer then
      return jsonb_build_object('ok', true, 'record', to_jsonb(existing));
    end if;
    if existing.writer_id <> p_writer or existing.state = 'completed' then
      return jsonb_build_object('ok', false, 'record', to_jsonb(existing));
    end if;
    -- Same writer may advance after a lost response. Older retries never replace newer data.
    if client_seq <= existing.client_sequence then return jsonb_build_object('ok', true, 'record', to_jsonb(existing)); end if;
    if p_expected_revision > existing.revision then return jsonb_build_object('ok', false, 'record', to_jsonb(existing)); end if;
  elsif p_expected_revision <> 0 then
    raise exception 'Workout checkpoint was removed' using errcode = '22023';
  end if;
  select * into other_active from public.workout_checkpoints where trainee_id = p_owner and state = 'active' and id <> workout_id;
  if found then return jsonb_build_object('ok', false, 'record', to_jsonb(other_active)); end if;

  if p_session is not null then
    if exists (select 1 from public.training_sessions s where s.id = workout_id and (s.trainee_id <> p_owner or s.session_data <> p_session)) then
      raise exception 'Completed session already exists with different results' using errcode = '23505';
    end if;
    insert into public.training_sessions(id, plan_id, trainee_id, session_data, completed_at)
      values (workout_id, plan_id_value, p_owner, p_session, (p_session->>'completedAt')::timestamptz)
      on conflict (id) do nothing;
  end if;
  insert into public.workout_checkpoints(id, trainee_id, writer_id, revision, client_sequence, operation_id, state, payload, session_data)
    values (workout_id, p_owner, p_writer, coalesce(existing.revision, 0) + 1, client_seq, p_operation, result_state, p_payload, p_session)
    on conflict (id) do update set revision = excluded.revision, client_sequence = excluded.client_sequence, operation_id = excluded.operation_id,
      state = excluded.state, payload = excluded.payload, session_data = excluded.session_data, updated_at = now()
    returning * into existing;
  return jsonb_build_object('ok', true, 'record', to_jsonb(existing));
end;
$$;

create or replace function public.claim_workout_checkpoint(p_id text, p_expected_revision integer, p_writer text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare existing public.workout_checkpoints;
begin
  select * into existing from public.workout_checkpoints where id = p_id;
  if not found or auth.uid() is null or not (existing.trainee_id = auth.uid() or exists (
    select 1 from public.trainer_clients tc where tc.trainer_id = auth.uid() and tc.trainee_id = existing.trainee_id
  )) then raise exception 'Workout access denied' using errcode = '42501'; end if;
  if coalesce(p_writer, '') = '' then raise exception 'Writer is required'; end if;
  perform pg_advisory_xact_lock(hashtextextended(existing.trainee_id::text, 0));
  select * into existing from public.workout_checkpoints where id = p_id for update;
  if existing.revision <> p_expected_revision then return jsonb_build_object('ok', false, 'record', to_jsonb(existing)); end if;
  update public.workout_checkpoints set writer_id = p_writer, revision = revision + 1, client_sequence = 0, operation_id = 'claim:' || gen_random_uuid()::text, updated_at = now()
    where id = p_id returning * into existing;
  return jsonb_build_object('ok', true, 'record', to_jsonb(existing));
end;
$$;

revoke all on function public.save_workout_checkpoint(uuid, text, integer, text, jsonb, jsonb) from public;
revoke all on function public.claim_workout_checkpoint(text, integer, text) from public;
grant execute on function public.save_workout_checkpoint(uuid, text, integer, text, jsonb, jsonb) to authenticated;
grant execute on function public.claim_workout_checkpoint(text, integer, text) to authenticated;

-- New historical snapshots are immutable, even if an older APK tries to update the session.
create or replace function public.protect_session_snapshot() returns trigger language plpgsql set search_path = '' as $$
begin
  if old.session_data ? 'planSnapshot' and (
    new.session_data is distinct from old.session_data or new.plan_id is distinct from old.plan_id
    or new.trainee_id is distinct from old.trainee_id or new.completed_at is distinct from old.completed_at
  ) then raise exception 'Historical session snapshots cannot be changed' using errcode = '22023'; end if;
  return new;
end;
$$;
create trigger protect_historical_session_snapshot before update on public.training_sessions
  for each row execute function public.protect_session_snapshot();
