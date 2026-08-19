import type { APIRoute } from 'astro';
import { ApiError, env, errorResponse, json, serviceFetch } from '@/lib/server/supabase-admin';

export const prerender = false;

export const GET: APIRoute = async ({ request }) => {
  try {
    const expected = env('CRON_SECRET');
    if (!expected || request.headers.get('authorization') !== `Bearer ${expected}`) {
      throw new ApiError(401, 'No autorizado.');
    }

    const response = await serviceFetch('/rest/v1/landing_slots?select=slot_key&limit=1', {
      headers: { 'Cache-Control': 'no-cache' },
    });
    if (!response.ok) throw new ApiError(502, `Supabase respondió ${response.status}.`);
    const rows = (await response.json()) as { slot_key: string }[];
    return json({ ok: true, checkedAt: new Date().toISOString(), rows: rows.length });
  } catch (error) {
    return errorResponse(error);
  }
};
