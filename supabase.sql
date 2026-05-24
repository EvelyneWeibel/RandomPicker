drop function if exists public.random_picker_load(text);
drop function if exists public.random_picker_save(text, jsonb);
drop table if exists public.random_picker_workspaces;

create table if not exists public.random_picker_user_data (
  user_id uuid primary key references auth.users(id) on delete cascade,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.random_picker_user_data enable row level security;

revoke all on public.random_picker_user_data from anon;
revoke all on public.random_picker_user_data from authenticated;

create or replace function public.random_picker_default_data()
returns jsonb
language sql
immutable
as $$
  select jsonb_build_object(
    'activeListId', 'default',
    'lists', jsonb_build_array(
      jsonb_build_object(
        'id', 'default',
        'name', 'My first list',
        'hideTitles', false,
        'items', jsonb_build_array()
      )
    )
  );
$$;

create or replace function public.random_picker_load()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  saved_data jsonb;
begin
  if current_user_id is null then
    raise exception 'You must be signed in.';
  end if;

  insert into public.random_picker_user_data (user_id, data)
  values (current_user_id, public.random_picker_default_data())
  on conflict (user_id) do nothing;

  select data into saved_data
  from public.random_picker_user_data
  where user_id = current_user_id;

  return saved_data;
end;
$$;

create or replace function public.random_picker_save(p_data jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  saved_data jsonb;
begin
  if current_user_id is null then
    raise exception 'You must be signed in.';
  end if;

  if p_data is null or jsonb_typeof(p_data) <> 'object' then
    raise exception 'Picker data must be a JSON object.';
  end if;

  insert into public.random_picker_user_data (user_id, data, updated_at)
  values (current_user_id, p_data, now())
  on conflict (user_id)
  do update set data = excluded.data, updated_at = now();

  select data into saved_data
  from public.random_picker_user_data
  where user_id = current_user_id;

  return saved_data;
end;
$$;

grant execute on function public.random_picker_load() to authenticated;
grant execute on function public.random_picker_save(jsonb) to authenticated;
