import type { LandingAsset } from './types';

export const IMAGE_WIDTHS = [480, 720, 960, 1280, 1600, 1920] as const;

export interface ImagePreset {
  sizes: string;
  widths: readonly number[];
}

export const IMAGE_PRESETS: Record<string, ImagePreset> = {
  hero: { sizes: '100vw', widths: IMAGE_WIDTHS },
  band: { sizes: '100vw', widths: [480, 720, 960, 1280, 1600] },
  'experience-background': { sizes: '100vw', widths: IMAGE_WIDTHS },
  'experience-card': { sizes: '(max-width: 720px) 78vw, (max-width: 1200px) 34vw, 390px', widths: [480, 720, 960] },
  'experience-index': { sizes: '(max-width: 640px) 100vw, (max-width: 1100px) 50vw, 33vw', widths: [480, 720, 960] },
  essence: { sizes: '(max-width: 860px) 100vw, 58vw', widths: [480, 720, 960, 1280, 1600] },
  'final-cta': { sizes: '100vw', widths: IMAGE_WIDTHS },
};

function encodeStoragePath(path: string): string {
  return path.split('/').map(encodeURIComponent).join('/');
}

function configuredSupabaseUrl(): string | undefined {
  const value = import.meta.env.PUBLIC_SUPABASE_URL ?? import.meta.env.SUPABASE_URL;
  return typeof value === 'string' && value.trim() ? value.replace(/\/$/, '') : undefined;
}

export function storageObjectUrl(bucket: string | undefined, path: string | undefined): string | undefined {
  const base = configuredSupabaseUrl();
  if (!base || !bucket || !path) return undefined;
  return `${base}/storage/v1/object/public/${encodeURIComponent(bucket)}/${encodeStoragePath(path)}`;
}

function storageUrl(asset: LandingAsset): string | undefined {
  return asset.storageUrl ?? storageObjectUrl(asset.storageBucket, asset.storagePath) ?? asset.legacySecureUrl;
}

function variantUrl(asset: LandingAsset, width: number): string | undefined {
  const url = asset.variants?.[String(width)];
  if (url) return url;
  const available = Object.keys(asset.variants ?? {})
    .filter((key) => /^\d+$/.test(key))
    .map(Number)
    .sort((a, b) => a - b);
  const nearest = available.find((candidate) => candidate >= width) ?? available.at(-1);
  return nearest ? asset.variants?.[String(nearest)] : undefined;
}

export function mediaImageUrl(asset: LandingAsset, width: number, _presetName = asset.preset): string | undefined {
  if (asset.resourceType !== 'image') return undefined;
  return variantUrl(asset, width) ?? storageUrl(asset) ?? asset.fallback;
}

export function mediaImageSrcset(asset: LandingAsset, presetName = asset.preset): string | undefined {
  if (asset.resourceType !== 'image') return undefined;
  const preset = IMAGE_PRESETS[presetName] ?? IMAGE_PRESETS.hero;
  const entries = preset.widths
    .map((width) => ({ width, url: variantUrl(asset, width) }))
    .filter((entry): entry is { width: number; url: string } => Boolean(entry.url));
  if (!entries.length) return undefined;
  return entries.map(({ width, url }) => `${url} ${width}w`).join(', ');
}

export function mediaVideoUrl(asset: LandingAsset): string | undefined {
  if (asset.resourceType !== 'video') return undefined;
  return storageUrl(asset) ?? asset.fallback;
}

export function mediaVideoPosterUrl(asset: LandingAsset, width = 1600): string | undefined {
  return asset.posterUrl
    ?? storageObjectUrl(asset.posterBucket, asset.posterPath)
    ?? variantUrl({ ...asset, resourceType: 'image', variants: asset.posterVariants }, width)
    ?? (asset.resourceType === 'image' ? storageUrl(asset) : undefined)
    ?? asset.fallback;
}
