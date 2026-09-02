-- Catálogo de experiencias administrable.
--
-- El contenido local sigue siendo el respaldo de las 16 experiencias
-- originales. Esta tabla conserva su orden editorial y permite agregar nuevas
-- experiencias sin recompilar archivos JSON a mano. Borrador y publicado se
-- promueven en la misma transacción que los recursos gráficos.

create table if not exists public.experiences (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  local_source boolean not null default false,
  draft_order integer not null check (draft_order > 0),
  published_order integer check (published_order is null or published_order > 0),
  draft_status text not null default 'active' check (draft_status in ('active', 'archived')),
  published_status text not null default 'archived' check (published_status in ('active', 'archived')),
  draft_content jsonb,
  published_content jsonb,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  updated_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  published_at timestamptz
);

create index if not exists experiences_draft_order_idx on public.experiences (draft_order);
create index if not exists experiences_published_order_idx on public.experiences (published_order)
  where published_status = 'active';

-- Valida la forma que consumen la card, el modal y la página individual.
create or replace function public.experience_content_valid(p_content jsonb)
returns boolean
language plpgsql
immutable
set search_path = public
as $$
declare
  v_locale text;
  v_content jsonb;
  v_fact jsonb;
  v_required_text text[] := array[
    'cardTitle', 'cardSummary', 'cardDetail', 'title', 'lead', 'body',
    'modality', 'note'
  ];
  v_field text;
  v_facts_length integer;
  v_includes_length integer;
  v_excludes_length integer;
  v_base_facts integer;
  v_base_includes integer;
  v_base_excludes integer;
begin
  if p_content is null or jsonb_typeof(p_content) is distinct from 'object' then return false; end if;

  foreach v_locale in array array['es', 'en', 'pt'] loop
    v_content := p_content -> v_locale;
    if v_content is null or jsonb_typeof(v_content) is distinct from 'object' then return false; end if;

    foreach v_field in array v_required_text loop
      if jsonb_typeof(v_content -> v_field) is distinct from 'string'
         or coalesce(btrim(v_content ->> v_field), '') = '' then
        return false;
      end if;
    end loop;

    if v_content ? 'cardCategory'
       and jsonb_typeof(v_content -> 'cardCategory') is distinct from 'string' then
      return false;
    end if;
    if jsonb_typeof(v_content -> 'facts') is distinct from 'array'
       or jsonb_typeof(v_content -> 'includes') is distinct from 'array'
       or jsonb_typeof(v_content -> 'excludes') is distinct from 'array' then
      return false;
    end if;
    if jsonb_array_length(v_content -> 'facts') < 1 then
      return false;
    end if;

    for v_fact in select value from jsonb_array_elements(v_content -> 'facts') loop
      if jsonb_typeof(v_fact) is distinct from 'array' then
        return false;
      end if;
      if jsonb_array_length(v_fact) <> 2
         or jsonb_typeof(v_fact -> 0) is distinct from 'string'
         or jsonb_typeof(v_fact -> 1) is distinct from 'string'
         or btrim(v_fact ->> 0) = ''
         or btrim(v_fact ->> 1) = '' then
        return false;
      end if;
    end loop;

    if exists (
      select 1 from jsonb_array_elements(v_content -> 'includes') as item(value)
      where jsonb_typeof(item.value) is distinct from 'string' or btrim(item.value #>> '{}') = ''
    ) or exists (
      select 1 from jsonb_array_elements(v_content -> 'excludes') as item(value)
      where jsonb_typeof(item.value) is distinct from 'string' or btrim(item.value #>> '{}') = ''
    ) then
      return false;
    end if;

    v_facts_length := jsonb_array_length(v_content -> 'facts');
    v_includes_length := jsonb_array_length(v_content -> 'includes');
    v_excludes_length := jsonb_array_length(v_content -> 'excludes');
    if v_locale = 'es' then
      v_base_facts := v_facts_length;
      v_base_includes := v_includes_length;
      v_base_excludes := v_excludes_length;
    elsif v_facts_length <> v_base_facts
       or v_includes_length <> v_base_includes
       or v_excludes_length <> v_base_excludes then
      return false;
    end if;
  end loop;

  return true;
end;
$$;

-- Las experiencias históricas mantienen sus JSON como respaldo; la tabla
-- agrega orden y estado publicable sin duplicar contenido en la migración.
insert into public.experiences
  (slug, local_source, draft_order, published_order, draft_status, published_status)
values
  ('base-torres-amanecer-regular', true, 1, 1, 'active', 'active'),
  ('valle-del-frances', true, 2, 2, 'active', 'active'),
  ('glaciar-grey-navegacion', true, 3, 3, 'active', 'active'),
  ('excursiones-especiales', true, 4, 4, 'active', 'active'),
  ('avistamiento-de-fauna', true, 5, 5, 'active', 'active'),
  ('chorrillo-los-salmones', true, 6, 6, 'active', 'active'),
  ('aonikenk-laguna-azul', true, 7, 7, 'active', 'active'),
  ('balmaceda-serrano', true, 8, 8, 'active', 'active'),
  ('full-day-perspectivas-cueva-del-milodon', true, 9, 9, 'active', 'active'),
  ('laguna-cebolla-avistamiento-de-fauna', true, 10, 10, 'active', 'active'),
  ('lazo-weber', true, 11, 11, 'active', 'active'),
  ('trekking-escenico-torres-del-paine', true, 12, 12, 'active', 'active'),
  ('mirador-ferrier', true, 13, 13, 'active', 'active'),
  ('paso-la-feria-weber', true, 14, 14, 'active', 'active'),
  ('full-day-perito-moreno', true, 15, 15, 'active', 'active'),
  ('astrofotografia', true, 16, 16, 'active', 'active')
on conflict (slug) do nothing;

alter table public.experiences enable row level security;

drop policy if exists experiences_admin_read on public.experiences;
create policy experiences_admin_read on public.experiences
  for select to authenticated using (public.is_admin());

-- Crea el contenido y su espacio gráfico en una sola transacción.
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
  select coalesce(max(draft_order), 0) + 1 into v_order from public.experiences;
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
  set label = 'Experiencia ' || lpad(v_order::text, 2, '0') || ' · ' || v_title,
      sort_order = 100 + v_order
  where slot_key = 'experience.' || v_slug || '.cover';
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
  select count(*) into v_total from public.experiences;
  select count(distinct item.id) into v_distinct from unnest(p_ids) as item(id);
  if coalesce(array_length(p_ids, 1), 0) <> v_total or v_distinct <> v_total
     or exists (
       select 1
       from unnest(p_ids) as item(id)
       left join public.experiences e on e.id = item.id
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
  where e.id = ordered.id;

  update public.landing_slots s
  set sort_order = 100 + e.draft_order,
      label = regexp_replace(s.label, '^Experiencia [0-9]+ · ',
        'Experiencia ' || lpad(e.draft_order::text, 2, '0') || ' · ')
  from public.experiences e
  where s.slot_key = 'experience.' || e.slug || '.cover';
end;
$$;

-- Publica medios, contenido, estado y orden como una sola versión.
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
    where e.draft_status = 'active'
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
    where e.draft_status = 'active'
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
  set published_order = draft_order,
      published_status = draft_status,
      published_content = coalesce(draft_content, published_content),
      published_at = now(),
      updated_by = auth.uid(),
      updated_at = now()
  where published_at is null
     or published_order is distinct from draft_order
     or published_status is distinct from draft_status
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

revoke all on public.experiences from anon;
grant select on public.experiences to authenticated;
grant select on public.experiences to service_role;
revoke all on function public.experience_content_valid(jsonb) from public, anon;
revoke all on function public.admin_create_experience(text, jsonb) from public, anon;
revoke all on function public.admin_update_experience(uuid, jsonb, text) from public, anon;
revoke all on function public.admin_reorder_experiences(uuid[]) from public, anon;
revoke all on function public.publish_landing_assets() from public, anon;
grant execute on function public.experience_content_valid(jsonb) to authenticated, service_role;
grant execute on function public.admin_create_experience(text, jsonb) to authenticated;
grant execute on function public.admin_update_experience(uuid, jsonb, text) to authenticated;
grant execute on function public.admin_reorder_experiences(uuid[]) to authenticated;
grant execute on function public.publish_landing_assets() to authenticated;
