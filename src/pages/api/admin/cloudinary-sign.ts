import type { APIRoute } from 'astro';
import { createHash } from 'node:crypto';
import { ApiError, assertAdmin, env, errorResponse, json, requiredEnv } from '@/lib/server/supabase-admin';

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  try {
    await assertAdmin(request);
    const body = (await request.json().catch(() => ({}))) as { resourceType?: string };
    const resourceType = body.resourceType === 'video' ? 'video' : 'image';
    if (!['image', 'video'].includes(resourceType)) throw new ApiError(400, 'Tipo de archivo inválido.');

    const timestamp = Math.floor(Date.now() / 1000);
    const folder = env('CLOUDINARY_ASSET_FOLDER') ?? 'patagonik/landing';
    const apiSecret = requiredEnv('CLOUDINARY_API_SECRET');
    const params = { folder, overwrite: 'false', timestamp: String(timestamp), unique_filename: 'true', use_filename: 'true' };
    const toSign = Object.entries(params)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => `${key}=${value}`)
      .join('&');
    const signature = createHash('sha1').update(`${toSign}${apiSecret}`).digest('hex');

    return json({
      signature,
      timestamp,
      folder,
      resourceType,
      apiKey: requiredEnv('CLOUDINARY_API_KEY'),
      cloudName: requiredEnv('PUBLIC_CLOUDINARY_CLOUD_NAME'),
      overwrite: false,
      uniqueFilename: true,
      useFilename: true,
    });
  } catch (error) {
    return errorResponse(error);
  }
};
