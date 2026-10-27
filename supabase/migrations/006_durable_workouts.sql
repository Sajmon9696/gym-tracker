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
