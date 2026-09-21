import type { APIRoute } from 'astro';
import { randomUUID } from 'node:crypto';
import { ApiError, assertAdmin, errorResponse, json, serviceFetch, storageBucket, supabaseUrl } from '@/lib/server/supabase-admin';

export const prerender = false;

const MAX_FILE_SIZE = 50 * 1024 * 1024;
const MAX_SIGNED_FILES = 8;
const MIME_EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/avif': 'avif',
  'video/mp4': 'mp4',
  'video/webm': 'webm',
};
interface SignFileInput {
  name?: string;
  contentType?: string;
  size?: number;
  key?: string;
}

function encodeStoragePath(path: string): string {
  return path.split('/').map(encodeURIComponent).join('/');
}

function safeSegment(value: string, fallback: string): string {
  const segment = value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return segment || fallback;
}

function publicUrl(bucket: string, path: string): string {
  return `${supabaseUrl()}/storage/v1/object/public/${encodeURIComponent(bucket)}/${encodeStoragePath(path)}`;
}

async function signPath(bucket: string, path: string): Promise<{ token: string; signedUrl: string }> {
  const response = await serviceFetch(
    `/storage/v1/object/upload/sign/${encodeStoragePath(`${bucket}/${path}`)}`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' },
  );
  if (!response.ok) {
    const detail = await response.text();
    throw new ApiError(502, `Supabase no pudo crear la subida firmada (${response.status}): ${detail}`);
  }
  const body = await response.json() as { url?: string };
  if (!body.url) throw new ApiError(502, 'Supabase no devolvió la URL de subida firmada.');
  const signedUrl = /^https?:/i.test(body.url) ? body.url : `${supabaseUrl()}${body.url}`;
  const token = new URL(signedUrl).searchParams.get('token');
  if (!token) throw new ApiError(502, 'Supabase no devolvió el token de subida.');
  return { token, signedUrl };
}

export const POST: APIRoute = async ({ request }) => {
  try {
    await assertAdmin(request);
    const body = await request.json().catch(() => ({})) as {
      slotKey?: string;
      resourceType?: string;
      files?: SignFileInput[];
    };
    const resourceType = body.resourceType === 'video' ? 'video' : body.resourceType === 'image' ? 'image' : null;
    if (!resourceType) throw new ApiError(400, 'Tipo de archivo inválido.');
    if (!body.slotKey || !/^([a-z0-9-]+\.)+[a-z0-9-]+$/i.test(body.slotKey)) {
      throw new ApiError(400, 'Espacio de contenido inválido.');
    }
    if (!Array.isArray(body.files) || body.files.length < 1 || body.files.length > MAX_SIGNED_FILES) {
      throw new ApiError(400, 'Cantidad de archivos inválida.');
    }

    const bucket = storageBucket();
    const slot = safeSegment(body.slotKey.replace(/\./g, '-'), 'slot');
    const batch = randomUUID();
    const files = [] as Array<{
      key: string;
      bucket: string;
      path: string;
      token: string;
      signedUrl: string;
      publicUrl: string;
      contentType: string;
    }>;

    for (const [index, input] of body.files.entries()) {
      const contentType = typeof input.contentType === 'string' ? input.contentType.toLowerCase() : '';
      const extension = MIME_EXTENSIONS[contentType];
      if (!extension || (resourceType === 'image' ? !contentType.startsWith('image/') : !contentType.startsWith('video/'))) {
        throw new ApiError(400, `Tipo MIME no permitido: ${contentType || 'desconocido'}.`);
      }
      const size = Number(input.size);
      if (!Number.isFinite(size) || size <= 0 || size > MAX_FILE_SIZE) {
        throw new ApiError(400, 'El archivo supera el límite del plan Free de Supabase: 50 MB.');
      }
      const key = typeof input.key === 'string' && /^[a-z0-9-]+$/.test(input.key) ? input.key : index === 0 ? 'original' : `variant-${index}`;
      const name = safeSegment(typeof input.name === 'string' ? input.name.replace(/\.[^.]+$/, '') : '', 'asset');
      const path = `landing/${slot}/${batch}/${key}-${name}.${extension}`;
      const signed = await signPath(bucket, path);
      files.push({ key, bucket, path, token: signed.token, signedUrl: signed.signedUrl, publicUrl: publicUrl(bucket, path), contentType });
    }

    return json({ bucket, files });
  } catch (error) {
    return errorResponse(error);
  }
};
