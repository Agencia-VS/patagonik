-- Catálogo editorial para los medios de la landing.
-- Ejecutar con `supabase db push` o pegar una vez en el SQL Editor.

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'viewer' check (role in ('viewer', 'admin')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where user_id = auth.uid() and role = 'admin'
  );
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (user_id) values (new.id)
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

create table if not exists public.media_assets (
  id uuid primary key default gen_random_uuid(),
  public_id text not null,
  resource_type text not null check (resource_type in ('image', 'video')),
  version bigint,
  format text,
  width integer check (width is null or width > 0),
  height integer check (height is null or height > 0),
  duration numeric check (duration is null or duration >= 0),
  bytes bigint check (bytes is null or bytes >= 0),
  secure_url text,
  original_filename text,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  unique (resource_type, public_id, version)
);

create table if not exists public.landing_slots (
  slot_key text primary key check (slot_key ~ '^[a-z0-9.-]+$'),
  label text not null,
  preset text not null,
  accepted_types text[] not null default array['image']::text[],
  local_fallback text,
  required boolean not null default true,
  sort_order integer not null,
  created_at timestamptz not null default now()
);

create table if not exists public.landing_slot_assignments (
  slot_key text primary key references public.landing_slots(slot_key) on delete cascade,
  draft_asset_id uuid references public.media_assets(id) on delete set null,
  published_asset_id uuid references public.media_assets(id) on delete set null,
  draft_alt jsonb not null default '{}'::jsonb,
  published_alt jsonb not null default '{}'::jsonb,
  draft_focal_point jsonb not null default '{"x":0.5,"y":0.5}'::jsonb,
  published_focal_point jsonb not null default '{"x":0.5,"y":0.5}'::jsonb,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  published_at timestamptz,
  constraint draft_focal_point_valid check (
    (draft_focal_point->>'x')::numeric between 0 and 1
    and (draft_focal_point->>'y')::numeric between 0 and 1
  ),
  constraint published_focal_point_valid check (
    (published_focal_point->>'x')::numeric between 0 and 1
    and (published_focal_point->>'y')::numeric between 0 and 1
  )
);

create table if not exists public.landing_slot_revisions (
  id bigint generated always as identity primary key,
  batch_id uuid not null,
  slot_key text not null references public.landing_slots(slot_key) on delete restrict,
  asset_id uuid references public.media_assets(id) on delete set null,
  alt jsonb not null,
  focal_point jsonb not null,
  published_by uuid references auth.users(id) on delete set null,
  published_at timestamptz not null default now()
);

create table if not exists public.publish_jobs (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null,
  status text not null default 'pending' check (status in ('pending', 'triggered', 'failed')),
  asset_count integer not null default 0,
  detail text,
  requested_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.landing_slots (slot_key, label, preset, accepted_types, local_fallback, required, sort_order)
values
  ('landing.hero', 'Hero principal', 'hero', array['image','video'], null, false, 10),
  ('landing.band-valle', 'Franja Valle', 'band', array['image'], '/images/band-valle.webp', true, 20),
  ('landing.experiences-background', 'Fondo de experiencias', 'experience-background', array['image'], '/images/exp-bg-extended.webp', true, 30),
  ('landing.final-cta', 'CTA final', 'final-cta', array['image'], '/images/final-band.webp', true, 40),
  ('about.essence', 'Nuestra esencia', 'essence', array['image'], '/images/esc-main.webp', true, 50),
  ('experience.base-torres-amanecer-regular.cover', 'Experiencia 01 · Base Torres', 'experience-card', array['image'], '/images/exp-1.webp', true, 101),
  ('experience.valle-del-frances.cover', 'Experiencia 02 · Valle del Francés', 'experience-card', array['image'], '/images/exp-2.webp', true, 102),
  ('experience.glaciar-grey-navegacion.cover', 'Experiencia 03 · Glaciar Grey', 'experience-card', array['image'], '/images/exp-3.webp', true, 103),
  ('experience.excursiones-especiales.cover', 'Experiencia 04 · Excursiones especiales', 'experience-card', array['image'], '/images/exp-4.webp', true, 104),
  ('experience.avistamiento-de-fauna.cover', 'Experiencia 05 · Avistamiento de fauna', 'experience-card', array['image'], '/images/exp-5.webp', true, 105),
  ('experience.chorrillo-los-salmones.cover', 'Experiencia 06 · Chorrillo Los Salmones', 'experience-card', array['image'], '/images/exp-6.webp', true, 106),
  ('experience.aonikenk-laguna-azul.cover', 'Experiencia 07 · Aonikenk + Laguna Azul', 'experience-card', array['image'], '/images/exp-7.webp', true, 107),
  ('experience.balmaceda-serrano.cover', 'Experiencia 08 · Balmaceda & Serrano', 'experience-card', array['image'], '/images/exp-8.webp', true, 108),
  ('experience.full-day-perspectivas-cueva-del-milodon.cover', 'Experiencia 09 · Perspectivas + Milodón', 'experience-card', array['image'], '/images/exp-9.webp', true, 109),
  ('experience.laguna-cebolla-avistamiento-de-fauna.cover', 'Experiencia 10 · Laguna Cebolla', 'experience-card', array['image'], '/images/exp-10.webp', true, 110),
  ('experience.lazo-weber.cover', 'Experiencia 11 · Lazo – Weber', 'experience-card', array['image'], '/images/exp-11.webp', true, 111),
  ('experience.trekking-escenico-torres-del-paine.cover', 'Experiencia 12 · Trekking escénico', 'experience-card', array['image'], '/images/exp-12.webp', true, 112),
  ('experience.mirador-ferrier.cover', 'Experiencia 13 · Mirador Ferrier', 'experience-card', array['image'], '/images/exp-13.webp', true, 113),
  ('experience.paso-la-feria-weber.cover', 'Experiencia 14 · Paso La Feria – Weber', 'experience-card', array['image'], '/images/exp-14.webp', true, 114),
  ('experience.full-day-perito-moreno.cover', 'Experiencia 15 · Perito Moreno', 'experience-card', array['image'], '/images/exp-15.webp', true, 115),
  ('experience.astrofotografia.cover', 'Experiencia 16 · Astrofotografía', 'experience-card', array['image'], '/images/exp-16.webp', true, 116)
on conflict (slot_key) do update set
  label = excluded.label,
  preset = excluded.preset,
  accepted_types = excluded.accepted_types,
  local_fallback = excluded.local_fallback,
  required = excluded.required,
  sort_order = excluded.sort_order;

insert into public.landing_slot_assignments (slot_key)
select slot_key from public.landing_slots
on conflict (slot_key) do nothing;

alter table public.profiles enable row level security;
alter table public.media_assets enable row level security;
alter table public.landing_slots enable row level security;
alter table public.landing_slot_assignments enable row level security;
alter table public.landing_slot_revisions enable row level security;
alter table public.publish_jobs enable row level security;

drop policy if exists profiles_read_self_or_admin on public.profiles;
create policy profiles_read_self_or_admin on public.profiles
  for select to authenticated using (user_id = auth.uid() or public.is_admin());

drop policy if exists profiles_admin_write on public.profiles;
create policy profiles_admin_write on public.profiles
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists media_assets_admin_all on public.media_assets;
create policy media_assets_admin_all on public.media_assets
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists landing_slots_admin_read on public.landing_slots;
create policy landing_slots_admin_read on public.landing_slots
  for select to authenticated using (public.is_admin());

drop policy if exists assignments_admin_all on public.landing_slot_assignments;
create policy assignments_admin_all on public.landing_slot_assignments
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists revisions_admin_read on public.landing_slot_revisions;
create policy revisions_admin_read on public.landing_slot_revisions
  for select to authenticated using (public.is_admin());

drop policy if exists publish_jobs_admin_read on public.publish_jobs;
create policy publish_jobs_admin_read on public.publish_jobs
  for select to authenticated using (public.is_admin());

create or replace view public.landing_admin_manifest
with (security_invoker = true)
as
select
  s.slot_key,
  s.label,
  s.preset,
  s.accepted_types,
  s.local_fallback,
  s.required,
  s.sort_order,
  a.draft_asset_id,
  d.public_id as draft_public_id,
  d.resource_type as draft_resource_type,
  d.version as draft_version,
  d.format as draft_format,
  d.width as draft_width,
  d.height as draft_height,
  d.duration as draft_duration,
  d.secure_url as draft_secure_url,
  a.draft_alt,
  a.draft_focal_point,
  a.published_asset_id,
  p.public_id as published_public_id,
  p.resource_type as published_resource_type,
  p.secure_url as published_secure_url,
  a.published_alt,
  a.published_focal_point,
  a.published_at,
  a.updated_at
from public.landing_slots s
join public.landing_slot_assignments a using (slot_key)
left join public.media_assets d on d.id = a.draft_asset_id
left join public.media_assets p on p.id = a.published_asset_id
order by s.sort_order;

create or replace view public.landing_published_manifest
with (security_invoker = true)
as
select
  s.slot_key,
  s.label,
  s.preset,
  s.local_fallback,
  p.public_id,
  p.resource_type,
  p.format,
  p.version,
  p.width,
  p.height,
  p.duration,
  a.published_alt as alt,
  a.published_focal_point as focal_point,
  null::text as poster_public_id,
  null::bigint as poster_version,
  null::text as poster_format
from public.landing_slots s
join public.landing_slot_assignments a using (slot_key)
left join public.media_assets p on p.id = a.published_asset_id
order by s.sort_order;

create or replace function public.publish_landing_assets()
returns table (job_id uuid, batch_id uuid, asset_count integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job_id uuid := gen_random_uuid();
  v_batch_id uuid := gen_random_uuid();
  v_count integer;
begin
  if not public.is_admin() then
    raise exception 'admin_required' using errcode = '42501';
  end if;

  if exists (
    select 1
    from public.landing_slots s
    join public.landing_slot_assignments a using (slot_key)
    where s.required
      and coalesce(a.draft_asset_id, a.published_asset_id) is null
      and s.local_fallback is null
  ) then
    raise exception 'required_asset_missing' using errcode = '23514';
  end if;

  if exists (
    select 1
    from public.landing_slots s
    join public.landing_slot_assignments a using (slot_key)
    join public.media_assets m on m.id = coalesce(a.draft_asset_id, a.published_asset_id)
    where not (m.resource_type = any(s.accepted_types))
  ) then
    raise exception 'asset_type_not_allowed' using errcode = '23514';
  end if;

  update public.landing_slot_assignments
  set published_asset_id = coalesce(draft_asset_id, published_asset_id),
      draft_asset_id = coalesce(draft_asset_id, published_asset_id),
      published_alt = draft_alt,
      published_focal_point = draft_focal_point,
      published_at = now(),
      updated_by = auth.uid(),
      updated_at = now();

  get diagnostics v_count = row_count;

  insert into public.landing_slot_revisions
    (batch_id, slot_key, asset_id, alt, focal_point, published_by)
  select v_batch_id, slot_key, published_asset_id, published_alt, published_focal_point, auth.uid()
  from public.landing_slot_assignments;

  insert into public.publish_jobs (id, batch_id, status, asset_count, requested_by)
  values (v_job_id, v_batch_id, 'pending', v_count, auth.uid());

  return query select v_job_id, v_batch_id, v_count;
end;
$$;

revoke all on public.profiles, public.media_assets, public.landing_slots,
  public.landing_slot_assignments, public.landing_slot_revisions, public.publish_jobs
  from anon;
grant select on public.profiles, public.landing_slots, public.landing_slot_revisions, public.publish_jobs
  to authenticated;
grant select, insert on public.media_assets to authenticated;
grant select, update on public.landing_slot_assignments to authenticated;
grant select on public.landing_admin_manifest to authenticated;
grant select on public.landing_published_manifest to service_role;
revoke all on function public.is_admin() from public, anon;
revoke all on function public.handle_new_user() from public, anon, authenticated;
revoke all on function public.publish_landing_assets() from public, anon;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.publish_landing_assets() to authenticated;

revoke all on public.landing_admin_manifest from anon;
revoke all on public.landing_published_manifest from anon, authenticated;
