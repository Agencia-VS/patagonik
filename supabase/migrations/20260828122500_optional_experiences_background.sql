-- El fondo de la sección de experiencias pasa a ser verde por defecto.
-- La fotografía se conserva como recurso opcional y se activa desde el admin.

update public.landing_slots
set label = 'Fondo fotográfico de experiencias (opcional)',
    local_fallback = null,
    required = false
where slot_key = 'landing.experiences-background';

update public.landing_slot_assignments
set draft_alt = coalesce(draft_alt, '{}'::jsonb) || '{"_backgroundMode":"green"}'::jsonb,
    published_alt = coalesce(published_alt, '{}'::jsonb) || '{"_backgroundMode":"green"}'::jsonb,
    updated_at = now()
where slot_key = 'landing.experiences-background';

-- Permite publicar un asset nulo únicamente en el fondo opcional. Así el
-- botón "Usar bloque verde" puede retirar la fotografía sin borrar el medio.
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

revoke all on function public.publish_landing_assets() from public, anon;
grant execute on function public.publish_landing_assets() to authenticated;
