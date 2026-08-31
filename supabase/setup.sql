create extension if not exists pgcrypto;

create table if not exists public.freezer_slots (
  id text primary key,
  occupant text not null default '',
  updated_at timestamptz not null default timezone('utc', now()),
  constraint freezer_slot_id_format check (id ~ '^L[1-4]-C[1-5]-H[1-5]-D[1-4]$'),
  constraint freezer_occupant_length check (char_length(occupant) <= 80)
);

alter table public.freezer_slots enable row level security;

drop policy if exists "Freezer map is publicly readable" on public.freezer_slots;
create policy "Freezer map is publicly readable"
on public.freezer_slots for select
to anon, authenticated
using (true);

revoke insert, update, delete on public.freezer_slots from anon, authenticated;
grant select on public.freezer_slots to anon, authenticated;

create or replace function public.update_freezer_slot(
  p_id text,
  p_occupant text,
  p_code text
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  cleaned_occupant text := btrim(coalesce(p_occupant, ''));
begin
  if encode(digest(coalesce(p_code, ''), 'sha256'), 'hex') <> 'a665a45920422f9d417e4867efdc4fb8a04a1f3fff1fa07e998e86f7f7a27ae3' then
    raise exception 'invalid_edit_code';
  end if;

  if p_id !~ '^L[1-4]-C[1-5]-H[1-5]-D[1-4]$' then
    raise exception 'invalid_freezer_position';
  end if;

  if char_length(cleaned_occupant) > 80 then
    raise exception 'occupant_label_too_long';
  end if;

  insert into public.freezer_slots (id, occupant, updated_at)
  values (p_id, cleaned_occupant, timezone('utc', now()))
  on conflict (id) do update
    set occupant = excluded.occupant,
        updated_at = excluded.updated_at;

  return jsonb_build_object('ok', true, 'id', p_id, 'occupant', cleaned_occupant);
end;
$$;

revoke all on function public.update_freezer_slot(text, text, text) from public;
grant execute on function public.update_freezer_slot(text, text, text) to anon, authenticated;
