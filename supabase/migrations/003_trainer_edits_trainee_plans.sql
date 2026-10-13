drop policy if exists "Trainers edit connected trainee plans" on public.training_plans;

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
