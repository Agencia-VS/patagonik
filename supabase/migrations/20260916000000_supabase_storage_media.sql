-- Migración aditiva a Supabase Storage.
-- Mantiene los campos Cloudinary durante la transición para poder volver atrás
-- sin perder asignaciones, encuadres ni publicaciones existentes.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'patagonik-media',
  'patagonik-media',
  true,
  62914560,
  array[
    'image/jpeg', 'image/png', 'image/webp', 'image/avif',
    'video/mp4', 'video/webm'
  ]::text[]
)
on conflict (id) do update set
  name = excluded.name,
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

alter table public.media_assets
  add column if not exists provider text not null default 'cloudinary'
    check (provider in ('cloudinary', 'supabase')),
  add column if not exists storage_bucket text,
  add column if not exists storage_path text,
  add column if not exists storage_url text,
  add column if not exists mime_type text,
  add column if not exists variants jsonb not null default '{}'::jsonb,
  add column if not exists poster_bucket text,
  add column if not exists poster_path text,
  add column if not exists poster_url text,
  add column if not exists poster_variants jsonb not null default '{}'::jsonb;

create index if not exists media_assets_storage_path_idx
  on public.media_assets (storage_bucket, storage_path)
  where storage_path is not null;

alter table storage.objects enable row level security;

drop policy if exists patagonik_media_public_read on storage.objects;
create policy patagonik_media_public_read on storage.objects
  for select to public
  using (bucket_id = 'patagonik-media');

drop policy if exists patagonik_media_admin_insert on storage.objects;
create policy patagonik_media_admin_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'patagonik-media'
    and name like 'landing/%'
    and public.is_admin()
  );

drop policy if exists patagonik_media_admin_update on storage.objects;
create policy patagonik_media_admin_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'patagonik-media'
    and name like 'landing/%'
    and public.is_admin()
  )
  with check (
    bucket_id = 'patagonik-media'
    and name like 'landing/%'
    and public.is_admin()
  );

drop policy if exists patagonik_media_admin_delete on storage.objects;
create policy patagonik_media_admin_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'patagonik-media'
    and name like 'landing/%'
    and public.is_admin()
  );

-- Las columnas existentes se conservan al principio de las vistas para no
-- romper clientes que todavía consumen el manifiesto antiguo. Las nuevas
-- columnas se agregan al final.
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
  a.updated_at,
  d.provider as draft_provider,
  d.storage_bucket as draft_storage_bucket,
  d.storage_path as draft_storage_path,
  d.storage_url as draft_storage_url,
  d.mime_type as draft_mime_type,
  d.variants as draft_variants,
  d.poster_bucket as draft_poster_bucket,
  d.poster_path as draft_poster_path,
  d.poster_url as draft_poster_url,
  d.poster_variants as draft_poster_variants,
  p.provider as published_provider,
  p.storage_bucket as published_storage_bucket,
  p.storage_path as published_storage_path,
  p.storage_url as published_storage_url,
  p.mime_type as published_mime_type,
  p.variants as published_variants,
  p.poster_bucket as published_poster_bucket,
  p.poster_path as published_poster_path,
  p.poster_url as published_poster_url,
  p.poster_variants as published_poster_variants
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
  null::text as poster_format,
  p.provider,
  p.storage_bucket,
  p.storage_path,
  p.storage_url,
  p.mime_type,
  p.variants,
  p.poster_bucket,
  p.poster_path,
  p.poster_url,
  p.poster_variants,
  p.secure_url as legacy_secure_url
from public.landing_slots s
join public.landing_slot_assignments a using (slot_key)
left join public.media_assets p on p.id = a.published_asset_id
order by s.sort_order;

revoke all on storage.objects from anon;
grant select on storage.objects to anon, authenticated;
grant insert, update, delete on storage.objects to authenticated;
