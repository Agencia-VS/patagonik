-- Roles gráficos de cada experiencia: card, modal y galería.
--
-- La portada/card ya existía como experience.<slug>.cover. Esta migración
-- agrega una imagen independiente para el modal y hasta cuatro imágenes
-- adicionales para la galería de la página individual. Las imágenes de galería
-- son opcionales; publicar sigue exigiendo solamente la imagen del card.

insert into public.landing_slots
  (slot_key, label, preset, accepted_types, local_fallback, required, sort_order)
select
  'experience.' || e.slug || '.modal',
  'Experiencia ' || lpad(e.draft_order::text, 2, '0') || ' · Imagen del modal',
  'experience-modal',
  array['image']::text[],
  cover.local_fallback,
  false,
  10000 + (e.draft_order * 10) + 1
from public.experiences e
left join public.landing_slots cover
  on cover.slot_key = 'experience.' || e.slug || '.cover'
on conflict (slot_key) do update
set label = excluded.label,
    preset = excluded.preset,
    accepted_types = excluded.accepted_types,
    required = false,
    sort_order = excluded.sort_order;

insert into public.landing_slots
  (slot_key, label, preset, accepted_types, local_fallback, required, sort_order)
select
  'experience.' || e.slug || '.gallery.' || lpad(gallery_index::text, 2, '0'),
  'Experiencia ' || lpad(e.draft_order::text, 2, '0') || ' · Galería ' || lpad(gallery_index::text, 2, '0'),
  'experience-gallery',
  array['image']::text[],
  null,
  false,
  10000 + (e.draft_order * 10) + 1 + gallery_index
from public.experiences e
cross join generate_series(1, 4) as series(gallery_index)
on conflict (slot_key) do update
set label = excluded.label,
    preset = excluded.preset,
    accepted_types = excluded.accepted_types,
    required = false,
    sort_order = excluded.sort_order;

insert into public.landing_slot_assignments (slot_key)
select slot_key
from public.landing_slots
where slot_key like 'experience.%.modal'
   or slot_key like 'experience.%.gallery.%'
on conflict (slot_key) do nothing;

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

  insert into public.experiences
    (slug, local_source, draft_order, published_order, draft_status, published_status,
     draft_content, created_by, updated_by)
  values
    (p_slug, false, v_order, null, 'active', 'archived',
     p_content, auth.uid(), auth.uid())
  returning id into v_id;

  insert into public.landing_slots
    (slot_key, label, preset, accepted_types, local_fallback, required, sort_order)
  values
    ('experience.' || p_slug || '.cover',
     'Experiencia ' || lpad(v_order::text, 2, '0') || ' · ' || v_title,
     'experience-card', array['image']::text[], null, false, 100 + v_order),
    ('experience.' || p_slug || '.modal',
     'Experiencia ' || lpad(v_order::text, 2, '0') || ' · Imagen del modal',
     'experience-modal', array['image']::text[], null, false, 10000 + (v_order * 10) + 1);

  insert into public.landing_slots
    (slot_key, label, preset, accepted_types, local_fallback, required, sort_order)
  select
    'experience.' || p_slug || '.gallery.' || lpad(gallery_index::text, 2, '0'),
    'Experiencia ' || lpad(v_order::text, 2, '0') || ' · Galería ' || lpad(gallery_index::text, 2, '0'),
    'experience-gallery', array['image']::text[], null, false,
    10000 + (v_order * 10) + 1 + gallery_index
  from generate_series(1, 4) as series(gallery_index);

  insert into public.landing_slot_assignments (slot_key)
  select slot_key
  from public.landing_slots
  where slot_key = 'experience.' || p_slug || '.cover'
     or slot_key = 'experience.' || p_slug || '.modal'
     or slot_key like 'experience.' || p_slug || '.gallery.%';

  return v_id;
end;
$$;

create or replace function public.admin_update_experience(
  p_id uuid,
  p_content jsonb,
  p_status text default 'active'
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_slug text;
  v_order integer;
  v_title text;
begin
  if not public.is_admin() then
    raise exception 'admin_required' using errcode = '42501';
  end if;
  if p_status is null or p_status not in ('active', 'archived') then
    raise exception 'invalid_experience_status' using errcode = '23514';
  end if;
  if not public.experience_content_valid(p_content) then
    raise exception 'invalid_experience_content' using errcode = '23514';
  end if;

  update public.experiences
  set draft_content = p_content,
      draft_status = p_status,
      updated_by = auth.uid(),
      updated_at = now()
  where id = p_id
  returning slug, draft_order into v_slug, v_order;

  if v_slug is null then raise exception 'experience_not_found' using errcode = 'P0002'; end if;
  v_title := p_content -> 'es' ->> 'cardTitle';

  update public.landing_slots
  set label = 'Experiencia ' || lpad(v_order::text, 2, '0') || ' · ' || v_title
  where slot_key = 'experience.' || v_slug || '.cover';

  update public.landing_slots
  set label = regexp_replace(label, '^Experiencia [0-9]+ · ',
      'Experiencia ' || lpad(v_order::text, 2, '0') || ' · '),
      sort_order = case
        when slot_key like '%.cover' then 100 + v_order
        when slot_key like '%.modal' then 10000 + (v_order * 10) + 1
        else 10000 + (v_order * 10) + 1
          + coalesce(substring(slot_key from '\.gallery\.([0-9]+)$')::integer, 1)
      end
  where slot_key like 'experience.' || v_slug || '.%';
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
  set sort_order = case
        when s.slot_key like '%.cover' then 100 + e.draft_order
        when s.slot_key like '%.modal' then 10000 + (e.draft_order * 10) + 1
        else 10000 + (e.draft_order * 10) + 1
          + coalesce(substring(s.slot_key from '\.gallery\.([0-9]+)$')::integer, 1)
      end,
      label = regexp_replace(s.label, '^Experiencia [0-9]+ · ',
        'Experiencia ' || lpad(e.draft_order::text, 2, '0') || ' · ')
  from public.experiences e
  where not e.draft_deleted
    and s.slot_key like 'experience.' || e.slug || '.%';

  return;
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
  where slot_key like 'experience.' || v_slug || '.%';

  update public.landing_slots s
  set sort_order = case
        when s.slot_key like '%.cover' then 100 + e.draft_order
        when s.slot_key like '%.modal' then 10000 + (e.draft_order * 10) + 1
        else 10000 + (e.draft_order * 10) + 1
          + coalesce(substring(s.slot_key from '\.gallery\.([0-9]+)$')::integer, 1)
      end,
      label = regexp_replace(s.label, '^Experiencia [0-9]+ · ',
        'Experiencia ' || lpad(e.draft_order::text, 2, '0') || ' · ')
  from public.experiences e
  where not e.draft_deleted
    and s.slot_key like 'experience.' || e.slug || '.%';

  return v_slug;
end;
$$;
