import type { APIRoute } from 'astro';
import { getLocalExperiences } from '@/lib/experiences/catalog';
import type { ExperienceContent, ExperienceDatabaseRow } from '@/lib/experiences/catalog';
import { normalizeExperienceSlug, validateExperienceContent } from '@/lib/experiences/content';
import { ApiError, assertAdmin, errorResponse, json, publicKey, supabaseUrl } from '@/lib/server/supabase-admin';

export const prerender = false;

interface ManifestSummaryRow {
  slot_key: string;
  local_fallback: string | null;
  draft_asset_id: string | null;
  published_asset_id: string | null;
}

async function userFetch(path: string, token: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set('apikey', publicKey());
  headers.set('Authorization', `Bearer ${token}`);
  headers.set('Accept', 'application/json');
  return fetch(`${supabaseUrl()}${path}`, { ...init, headers });
}

async function checkedSupabase(response: Response, action: string): Promise<Response> {
  if (response.ok) return response;
  const detail = await response.text();
  if (detail.includes('Could not find the table') || detail.includes("relation 'public.experiences' does not exist")) {
    throw new ApiError(503, 'Falta aplicar la migración del catálogo de experiencias en Supabase.');
  }
  if (detail.includes('duplicate key') || detail.includes('experiences_slug_key')) {
    throw new ApiError(409, 'Ya existe una experiencia con ese slug.');
  }
  if (detail.includes('invalid_experience_order')) throw new ApiError(409, 'El orden cambió en otra sesión. Actualiza el panel e inténtalo nuevamente.');
  if (detail.includes('invalid_experience_content')) throw new ApiError(422, 'El contenido está incompleto o los idiomas no tienen la misma estructura.');
  throw new ApiError(response.status === 403 ? 403 : 422, `${action}: ${detail}`);
}

export const GET: APIRoute = async ({ request }) => {
  try {
    const { token } = await assertAdmin(request);
    const [databaseResponse, manifestResponse, local] = await Promise.all([
      userFetch('/rest/v1/experiences?select=*&order=draft_order.asc', token),
      userFetch('/rest/v1/landing_admin_manifest?select=slot_key,local_fallback,draft_asset_id,published_asset_id', token),
      getLocalExperiences(),
    ]);
    await checkedSupabase(databaseResponse, 'No se pudo cargar el catálogo');
    await checkedSupabase(manifestResponse, 'No se pudo revisar las portadas');
    const rows = (await databaseResponse.json()) as ExperienceDatabaseRow[];
    const manifest = (await manifestResponse.json()) as ManifestSummaryRow[];
    const localBySlug = new Map(local.map((entry) => [entry.slug, entry.content]));
    const coverBySlot = new Map(manifest.map((entry) => [entry.slot_key, entry]));

    const experiences = rows.map((row) => {
      const content = row.draft_content ?? row.published_content ?? localBySlug.get(row.slug) ?? null;
      const cover = coverBySlot.get(`experience.${row.slug}.cover`);
      return {
        id: row.id,
        slug: row.slug,
        order: row.draft_order,
        publishedOrder: row.published_order,
        status: row.draft_status,
        publishedStatus: row.published_status,
        content,
        localSource: row.local_source,
        hasCover: Boolean(cover?.draft_asset_id || cover?.published_asset_id || cover?.local_fallback),
        dirty: row.draft_order !== row.published_order
          || row.draft_status !== row.published_status
          || (row.draft_content !== null && JSON.stringify(row.draft_content) !== JSON.stringify(row.published_content)),
        updatedAt: row.updated_at,
        publishedAt: row.published_at,
      };
    });
    return json({ experiences });
  } catch (error) {
    return errorResponse(error);
  }
};

export const POST: APIRoute = async ({ request }) => {
  try {
    const { token } = await assertAdmin(request);
    const body = (await request.json().catch(() => ({}))) as { slug?: unknown; content?: unknown };
    let slug: string;
    let content: ExperienceContent;
    try {
      slug = normalizeExperienceSlug(body.slug);
      content = validateExperienceContent(body.content);
    } catch (error) {
      throw new ApiError(422, error instanceof Error ? error.message : 'Contenido inválido.');
    }
    const response = await userFetch('/rest/v1/rpc/admin_create_experience', token, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_slug: slug, p_content: content }),
    });
    await checkedSupabase(response, 'No se pudo crear la experiencia');
    const id = await response.json() as string;
    return json({ ok: true, id, slug }, 201);
  } catch (error) {
    return errorResponse(error);
  }
};

export const PATCH: APIRoute = async ({ request }) => {
  try {
    const { token } = await assertAdmin(request);
    const body = (await request.json().catch(() => ({}))) as {
      action?: unknown;
      id?: unknown;
      ids?: unknown;
      content?: unknown;
      status?: unknown;
    };

    if (body.action === 'reorder') {
      if (!Array.isArray(body.ids) || !body.ids.length || !body.ids.every((id) => typeof id === 'string' && /^[0-9a-f-]{36}$/i.test(id))) {
        throw new ApiError(422, 'El nuevo orden es inválido.');
      }
      const response = await userFetch('/rest/v1/rpc/admin_reorder_experiences', token, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ p_ids: body.ids }),
      });
      await checkedSupabase(response, 'No se pudo guardar el orden');
      return json({ ok: true });
    }

    if (body.action !== 'save' || typeof body.id !== 'string' || !/^[0-9a-f-]{36}$/i.test(body.id)) {
      throw new ApiError(422, 'Solicitud de edición inválida.');
    }
    if (body.status !== 'active' && body.status !== 'archived') throw new ApiError(422, 'Estado inválido.');
    let content: ExperienceContent;
    try {
      content = validateExperienceContent(body.content);
    } catch (error) {
      throw new ApiError(422, error instanceof Error ? error.message : 'Contenido inválido.');
    }
    const response = await userFetch('/rest/v1/rpc/admin_update_experience', token, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_id: body.id, p_content: content, p_status: body.status }),
    });
    await checkedSupabase(response, 'No se pudo guardar la experiencia');
    return json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
};
