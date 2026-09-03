-- Eliminación editorial de experiencias.
--
-- Se conserva una marca en la base de datos para que las experiencias que
-- originalmente viven en JSON no vuelvan a aparecer como fallback. El borrado
-- se publica junto con el resto del catálogo y mantiene el historial de medios.

alter table public.experiences
  add column if not exists draft_deleted boolean not null default false,
  add column if not exists published_deleted boolean not null default false;

create or replace function public.admin_create_experience(
  p_slug text,
  p_content jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_order integer;
  v_title text;
  v_slot_key text;
begin
  if not public.is_admin() then
    raise exception 'admin_required' using errcode = '42501';
  end if;
  if p_slug is null or p_slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' then
    raise exception 'invalid_experience_slug' using errcode = '23514';
  end if;
  if not public.experience_content_valid(p_content) then
    raise exception 'invalid_experience_content' using errcode = '23514';
  end if;

  lock table public.experiences in share row exclusive mode;
  select coalesce(max(draft_order), 0) + 1
    into v_order
  from public.experiences
  where not draft_deleted;
  v_title := p_content -> 'es' ->> 'cardTitle';
  v_slot_key := 'experience.' || p_slug || '.cover';

  insert into public.experiences
    (slug, local_source, draft_order, draft_status, published_status,
     draft_content, created_by, updated_by)
  values
    (p_slug, false, v_order, 'active', 'archived', p_content, auth.uid(), auth.uid())
  returning id into v_id;

  insert into public.landing_slots
    (slot_key, label, preset, accepted_types, local_fallback, required, sort_order)
  values
    (v_slot_key, 'Experiencia ' || lpad(v_order::text, 2, '0') || ' · ' || v_title,
     'experience-card', array['image']::text[], null, false, 100 + v_order);

  insert into public.landing_slot_assignments (slot_key, updated_by)
  values (v_slot_key, auth.uid());

  return v_id;
end;
$$;

create or replace function public.admin_reorder_experiences(p_ids uuid[])
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_total integer;
  v_distinct integer;
begin
  if not public.is_admin() then
    raise exception 'admin_required' using errcode = '42501';
  end if;
  lock table public.experiences in share row exclusive mode;
  select count(*) into v_total from public.experiences where not draft_deleted;
  select count(distinct item.id) into v_distinct from unnest(p_ids) as item(id);
  if coalesce(array_length(p_ids, 1), 0) <> v_total or v_distinct <> v_total
     or exists (
       select 1
       from unnest(p_ids) as item(id)
       left join public.experiences e on e.id = item.id and not e.draft_deleted
       where e.id is null
     ) then
    raise exception 'invalid_experience_order' using errcode = '23514';
  end if;

  update public.experiences e
  set draft_order = ordered.position,
      updated_by = auth.uid(),
      updated_at = now()
  from (
    select id, ordinality::integer as position
    from unnest(p_ids) with ordinality as items(id, ordinality)
  ) ordered
  where e.id = ordered.id and not e.draft_deleted;

  update public.landing_slots s
  set sort_order = 100 + e.draft_order,
      label = regexp_replace(s.label, '^Experiencia [0-9]+ · ',
        'Experiencia ' || lpad(e.draft_order::text, 2, '0') || ' · ')
  from public.experiences e
  where not e.draft_deleted
    and s.slot_key = 'experience.' || e.slug || '.cover';
end;
$$;

create or replace function public.admin_delete_experience(p_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_slug text;
  v_order integer;
begin
  if not public.is_admin() then
    raise exception 'admin_required' using errcode = '42501';
  end if;

  lock table public.experiences in share row exclusive mode;
  select slug, draft_order
    into v_slug, v_order
  from public.experiences
  where id = p_id and not draft_deleted
  for update;

  if v_slug is null then
    raise exception 'experience_not_found' using errcode = 'P0002';
  end if;

  update public.experiences
  set draft_deleted = true,
      draft_status = 'archived',
      updated_by = auth.uid(),
      updated_at = now()
  where id = p_id;

  with ordered as (
    select id, row_number() over (order by draft_order, created_at, id)::integer as position
    from public.experiences
    where not draft_deleted
  )
  update public.experiences e
  set draft_order = ordered.position,
      updated_by = auth.uid(),
      updated_at = now()
  from ordered
  where e.id = ordered.id
    and e.draft_order is distinct from ordered.position;

  update public.landing_slots
  set preset = 'experience-deleted',
      required = false,
      sort_order = 10000 + v_order
  where slot_key = 'experience.' || v_slug || '.cover';

  update public.landing_slots s
  set sort_order = 100 + e.draft_order,
      label = regexp_replace(s.label, '^Experiencia [0-9]+ · ',
        'Experiencia ' || lpad(e.draft_order::text, 2, '0') || ' · ')
  from public.experiences e
  where not e.draft_deleted
    and s.slot_key = 'experience.' || e.slug || '.cover';

  return v_slug;
end;
$$;

-- Publica medios, contenido, estado, orden y eliminaciones como una versión.
create or replace function public.publish_landing_assets()
returns table (job_id uuid, batch_id uuid, asset_count integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job_id uuid := gen_random_uuid();
  v_batch_id uuid := gen_random_uuid();
  v_media_count integer := 0;
  v_experience_count integer := 0;
  v_count integer := 0;
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

  if exists (
    select 1 from public.experiences e
    where not e.draft_deleted
      and e.draft_status = 'active'
      and not e.local_source
      and not public.experience_content_valid(coalesce(e.draft_content, e.published_content))
  ) then
    raise exception 'experience_content_missing' using errcode = '23514';
  end if;

  if exists (
    select 1
    from public.experiences e
    left join public.landing_slots s on s.slot_key = 'experience.' || e.slug || '.cover'
    left join public.landing_slot_assignments a on a.slot_key = s.slot_key
    where not e.draft_deleted
      and e.draft_status = 'active'
      and (
        s.slot_key is null
        or a.slot_key is null
        or (
          coalesce(a.draft_asset_id, a.published_asset_id) is null
          and s.local_fallback is null
        )
      )
  ) then
    raise exception 'experience_cover_missing' using errcode = '23514';
  end if;

  if exists (
    select draft_order from public.experiences
    where not draft_deleted
    group by draft_order having count(*) > 1
  ) then
    raise exception 'experience_order_duplicate' using errcode = '23514';
  end if;

  update public.landing_slot_assignments
  set published_asset_id = case
        when slot_key = 'landing.experiences-background' then draft_asset_id
        else coalesce(draft_asset_id, published_asset_id)
      end,
      draft_asset_id = case
        when slot_key = 'landing.experiences-background' then draft_asset_id
        else coalesce(draft_asset_id, published_asset_id)
      end,
      published_alt = draft_alt,
      published_focal_point = draft_focal_point,
      published_at = now(),
      updated_by = auth.uid(),
      updated_at = now()
  where published_at is null
     or draft_asset_id is distinct from published_asset_id
     or draft_alt is distinct from published_alt
     or draft_focal_point is distinct from published_focal_point;
  get diagnostics v_media_count = row_count;

  update public.experiences
  set published_order = case when draft_deleted then null else draft_order end,
      published_status = case when draft_deleted then 'archived' else draft_status end,
      published_deleted = draft_deleted,
      published_content = coalesce(draft_content, published_content),
      published_at = now(),
      updated_by = auth.uid(),
      updated_at = now()
  where published_at is null
     or published_order is distinct from (case when draft_deleted then null else draft_order end)
     or published_status is distinct from (case when draft_deleted then 'archived' else draft_status end)
     or published_deleted is distinct from draft_deleted
     or published_content is distinct from coalesce(draft_content, published_content);
  get diagnostics v_experience_count = row_count;
  v_count := v_media_count + v_experience_count;

  insert into public.landing_slot_revisions
    (batch_id, slot_key, asset_id, alt, focal_point, published_by)
  select v_batch_id, slot_key, published_asset_id, published_alt, published_focal_point, auth.uid()
  from public.landing_slot_assignments;

  insert into public.publish_jobs (id, batch_id, status, asset_count, requested_by)
  values (v_job_id, v_batch_id, 'pending', v_count, auth.uid());

  return query select v_job_id, v_batch_id, v_count;
end;
$$;

revoke all on function public.admin_create_experience(text, jsonb) from public, anon;
revoke all on function public.admin_reorder_experiences(uuid[]) from public, anon;
revoke all on function public.admin_delete_experience(uuid) from public, anon;
revoke all on function public.publish_landing_assets() from public, anon;
grant execute on function public.admin_create_experience(text, jsonb) to authenticated;
grant execute on function public.admin_reorder_experiences(uuid[]) to authenticated;
grant execute on function public.admin_delete_experience(uuid) to authenticated;
grant execute on function public.publish_landing_assets() to authenticated;
