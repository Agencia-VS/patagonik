import type { APIRoute } from 'astro';
import { ApiError, assertAdmin, env, errorResponse, json, publicKey, serviceFetch, supabaseUrl } from '@/lib/server/supabase-admin';

export const prerender = false;

interface PublishResult {
  job_id: string;
  batch_id: string;
  asset_count: number;
}

async function updateJob(jobId: string, status: 'triggered' | 'failed', detail: string): Promise<void> {
  await serviceFetch(`/rest/v1/publish_jobs?id=eq.${encodeURIComponent(jobId)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' },
    body: JSON.stringify({ status, detail: detail.slice(0, 1000), updated_at: new Date().toISOString() }),
  });
}

export const POST: APIRoute = async ({ request }) => {
  try {
    const { token } = await assertAdmin(request);
    const deployHook = env('VERCEL_DEPLOY_HOOK_URL');
    if (!deployHook) throw new ApiError(503, 'Falta configurar VERCEL_DEPLOY_HOOK_URL; no se publicó nada.');

    const rpcResponse = await fetch(`${supabaseUrl()}/rest/v1/rpc/publish_landing_assets`, {
      method: 'POST',
      headers: {
        apikey: publicKey(),
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: '{}',
    });
    if (!rpcResponse.ok) {
      const detail = await rpcResponse.text();
      if (detail.includes('UPDATE requires a WHERE clause')) {
        throw new ApiError(409, 'Supabase todavía usa la función de publicación anterior. Aplica la migración 20260819210000_fix_publish_safe_update.sql y vuelve a intentar.');
      }
      throw new ApiError(rpcResponse.status === 403 ? 403 : 422, `No se pudo publicar: ${detail}`);
    }
    const [result] = (await rpcResponse.json()) as PublishResult[];
    if (!result) throw new ApiError(502, 'Supabase no devolvió el trabajo de publicación.');

    let deployResponse: Response;
    try {
      deployResponse = await fetch(deployHook, { method: 'POST', headers: { 'Content-Type': 'application/json' } });
    } catch (error) {
      await updateJob(result.job_id, 'failed', error instanceof Error ? error.message : 'No se pudo contactar Vercel.');
      throw new ApiError(502, 'Los cambios quedaron guardados, pero no se pudo contactar Vercel. Reintenta publicar.');
    }
    const deployDetail = await deployResponse.text();
    if (!deployResponse.ok) {
      await updateJob(result.job_id, 'failed', deployDetail || `Vercel ${deployResponse.status}`);
      throw new ApiError(502, 'Los cambios quedaron guardados, pero Vercel no aceptó el despliegue. Reintenta publicar.');
    }

    await updateJob(result.job_id, 'triggered', deployDetail || 'Deploy hook aceptado.').catch((error) => {
      console.error('[publish] No se pudo actualizar publish_jobs.', error);
    });
    return json({ ok: true, ...result, message: 'Publicación enviada a Vercel.' });
  } catch (error) {
    return errorResponse(error);
  }
};
