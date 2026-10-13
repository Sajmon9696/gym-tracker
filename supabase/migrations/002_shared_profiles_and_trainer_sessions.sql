-- Apply this migration to existing projects after schema.sql.
alter table public.profiles
  add column if not exists email text not null default '';

update public.profiles as profile
set email = auth_user.email
from auth.users as auth_user
where auth_user.id = profile.id
  and profile.email = '';

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

drop trigger if exists on_auth_user_email_changed on auth.users;
create trigger on_auth_user_email_changed
  after update of email on auth.users
  for each row execute procedure public.sync_profile_email();

drop policy if exists "Create own sessions for accessible plans" on public.training_sessions;
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

drop policy if exists "Update own sessions" on public.training_sessions;
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
