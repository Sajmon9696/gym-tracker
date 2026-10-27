create table if not exists public.exercise_catalog (
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

create index if not exists exercise_catalog_category_name_idx
  on public.exercise_catalog (category, pl);

alter table public.exercise_catalog enable row level security;

create policy "Authenticated users can read exercise catalog" on public.exercise_catalog
  for select to authenticated
  using (true);

create policy "Trainers can add exercise catalog entries" on public.exercise_catalog
  for insert to authenticated
  with check (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'trainer')
  );

create policy "Trainers can edit exercise catalog entries" on public.exercise_catalog
  for update to authenticated
  using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'trainer')
  )
  with check (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'trainer')
  );
