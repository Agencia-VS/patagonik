import { LOCAL_LANDING_ASSETS } from './landing-assets.local';
import type { LandingAsset, LandingAssetMap, MediaResourceType } from './types';

interface PublishedManifestRow {
  slot_key: string;
  label: string;
  preset: string;
  local_fallback: string | null;
  public_id: string | null;
  resource_type: MediaResourceType | null;
  format: string | null;
  version: number | null;
  width: number | null;
  height: number | null;
  duration: number | null;
  alt: Record<string, string> | null;
  focal_point: { x?: number; y?: number } | null;
  poster_public_id: string | null;
  poster_version: number | null;
  poster_format: string | null;
}

let manifestPromise: Promise<LandingAssetMap> | undefined;

function env(name: string): string | undefined {
  const value = import.meta.env[name];
  return typeof value === 'string' && value.length ? value : undefined;
}

function normalizedPoint(point: PublishedManifestRow['focal_point']): LandingAsset['focalPoint'] {
  if (!point) return undefined;
  return {
    x: Math.min(1, Math.max(0, Number(point.x ?? 0.5))),
    y: Math.min(1, Math.max(0, Number(point.y ?? 0.5))),
  };
}

async function loadManifest(): Promise<LandingAssetMap> {
  const fallback = structuredClone(LOCAL_LANDING_ASSETS);
  const supabaseUrl = env('SUPABASE_URL') ?? env('PUBLIC_SUPABASE_URL');
  const secretKey = env('SUPABASE_SECRET_KEY') ?? env('SUPABASE_SERVICE_ROLE_KEY');
  const cloudName = env('PUBLIC_CLOUDINARY_CLOUD_NAME');
  const requireRemote = env('MEDIA_REMOTE_REQUIRED') === 'true';

  if (!supabaseUrl || !secretKey || !cloudName) {
    if (requireRemote) throw new Error('Faltan SUPABASE_URL, SUPABASE_SECRET_KEY o PUBLIC_CLOUDINARY_CLOUD_NAME para cargar los assets publicados.');
    return fallback;
  }

  try {
    const headers: Record<string, string> = { apikey: secretKey, Accept: 'application/json' };
    // service_role legacy = JWT; sb_secret_* moderna se usa sólo como apikey.
    if (secretKey.split('.').length === 3) headers.Authorization = `Bearer ${secretKey}`;
    const response = await fetch(
      `${supabaseUrl.replace(/\/$/, '')}/rest/v1/landing_published_manifest?select=*`,
      { headers },
    );
    if (!response.ok) throw new Error(`Supabase respondió ${response.status}: ${await response.text()}`);

    const rows = (await response.json()) as PublishedManifestRow[];
    for (const row of rows) {
      if (!row.public_id || !row.resource_type) continue;
      const local = fallback[row.slot_key];
      fallback[row.slot_key] = {
        slotKey: row.slot_key,
        label: row.label,
        preset: row.preset,
        resourceType: row.resource_type,
        publicId: row.public_id,
        version: row.version ?? undefined,
        format: row.format ?? undefined,
        width: row.width ?? undefined,
        height: row.height ?? undefined,
        duration: row.duration ?? undefined,
        alt: row.alt ?? undefined,
        focalPoint: normalizedPoint(row.focal_point) ?? local?.focalPoint,
        posterPublicId: row.poster_public_id ?? undefined,
        posterVersion: row.poster_version ?? undefined,
        posterFormat: row.poster_format ?? undefined,
        fallback: row.local_fallback ?? local?.fallback,
      };
    }
    return fallback;
  } catch (error) {
    if (requireRemote) throw error;
    console.warn('[media] No se pudo cargar Supabase; se usarán los assets locales.', error);
    return fallback;
  }
}

export function getLandingAssets(): Promise<LandingAssetMap> {
  manifestPromise ??= loadManifest();
  return manifestPromise;
}
