create table if not exists public.random_picker_workspaces (
  access_code text primary key,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.random_picker_workspaces enable row level security;

revoke all on public.random_picker_workspaces from anon;
revoke all on public.random_picker_workspaces from authenticated;

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

create or replace function public.random_picker_load(p_access_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  clean_code text := nullif(trim(p_access_code), '');
  saved_data jsonb;
begin
  if clean_code is null then
    raise exception 'Access code is required.';
  end if;

  insert into public.random_picker_workspaces (access_code, data)
  values (clean_code, public.random_picker_default_data())
  on conflict (access_code) do nothing;

  select data into saved_data
  from public.random_picker_workspaces
  where access_code = clean_code;

  return saved_data;
end;
$$;

create or replace function public.random_picker_save(p_access_code text, p_data jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  clean_code text := nullif(trim(p_access_code), '');
  saved_data jsonb;
begin
  if clean_code is null then
    raise exception 'Access code is required.';
  end if;

  if p_data is null or jsonb_typeof(p_data) <> 'object' then
    raise exception 'Picker data must be a JSON object.';
  end if;

  insert into public.random_picker_workspaces (access_code, data, updated_at)
  values (clean_code, p_data, now())
  on conflict (access_code)
  do update set data = excluded.data, updated_at = now();

  select data into saved_data
  from public.random_picker_workspaces
  where access_code = clean_code;

  return saved_data;
end;
$$;

grant execute on function public.random_picker_load(text) to anon;
grant execute on function public.random_picker_save(text, jsonb) to anon;
