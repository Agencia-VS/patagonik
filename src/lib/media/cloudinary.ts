import type { LandingAsset } from './types';

export const IMAGE_WIDTHS = [480, 720, 960, 1280, 1600, 1920] as const;

export interface ImagePreset {
  aspect?: string;
  crop?: 'fill' | 'fit' | 'limit';
  gravity?: string;
  sizes: string;
  widths: readonly number[];
}

export const IMAGE_PRESETS: Record<string, ImagePreset> = {
  hero: {
    crop: 'fill',
    gravity: 'auto',
    sizes: '100vw',
    widths: IMAGE_WIDTHS,
  },
  band: {
    crop: 'fill',
    gravity: 'auto',
    sizes: '100vw',
    widths: [480, 720, 960, 1280, 1600],
  },
  'experience-background': {
    crop: 'fill',
    gravity: 'auto',
    sizes: '100vw',
    widths: IMAGE_WIDTHS,
  },
  'experience-card': {
    crop: 'fill',
    gravity: 'auto',
    sizes: '(max-width: 720px) 78vw, (max-width: 1200px) 34vw, 390px',
    widths: [480, 720, 960],
  },
  'experience-index': {
    crop: 'fill',
    gravity: 'auto',
    sizes: '(max-width: 640px) 100vw, (max-width: 1100px) 50vw, 33vw',
    widths: [480, 720, 960],
  },
  essence: {
    crop: 'fill',
    gravity: 'auto',
    sizes: '(max-width: 860px) 100vw, 58vw',
    widths: [480, 720, 960, 1280, 1600],
  },
  'final-cta': {
    crop: 'fill',
    gravity: 'auto',
    sizes: '100vw',
    widths: IMAGE_WIDTHS,
  },
};

function encodePublicId(publicId: string): string {
  return publicId.split('/').map(encodeURIComponent).join('/');
}

export function cloudinaryImageUrl(
  asset: LandingAsset,
  width: number,
  presetName = asset.preset,
): string | undefined {
  const cloudName = import.meta.env.PUBLIC_CLOUDINARY_CLOUD_NAME;
  if (!cloudName || !asset.publicId) return asset.fallback;

  const preset = IMAGE_PRESETS[presetName] ?? IMAGE_PRESETS.hero;
  const crop = asset.fitMode === 'contain' ? 'fit' : preset.crop;
  const parts = [`w_${width}`];
  if (crop) parts.push(`c_${crop}`);
  if (crop === 'fill') parts.push(`g_${preset.gravity ?? 'auto'}`);

  const version = asset.version ? `/v${asset.version}` : '';
  return `https://res.cloudinary.com/${encodeURIComponent(cloudName)}/image/upload/${parts.join(',')}/f_auto/q_auto${version}/${encodePublicId(asset.publicId)}`;
}

export function cloudinaryImageSrcset(asset: LandingAsset, presetName = asset.preset): string | undefined {
  if (!asset.publicId || !import.meta.env.PUBLIC_CLOUDINARY_CLOUD_NAME) return undefined;
  const preset = IMAGE_PRESETS[presetName] ?? IMAGE_PRESETS.hero;
  return preset.widths
    .map((width) => `${cloudinaryImageUrl(asset, width, presetName)} ${width}w`)
    .join(', ');
}

export function cloudinaryVideoUrl(asset: LandingAsset): string | undefined {
  const cloudName = import.meta.env.PUBLIC_CLOUDINARY_CLOUD_NAME;
  if (!cloudName || !asset.publicId || asset.resourceType !== 'video') return undefined;
  const version = asset.version ? `/v${asset.version}` : '';
  return `https://res.cloudinary.com/${encodeURIComponent(cloudName)}/video/upload/w_1920,c_limit/f_auto/q_auto:good${version}/${encodePublicId(asset.publicId)}`;
}

export function cloudinaryVideoPosterUrl(asset: LandingAsset, width = 1600): string | undefined {
  const cloudName = import.meta.env.PUBLIC_CLOUDINARY_CLOUD_NAME;
  if (!cloudName) return asset.fallback;

  if (asset.posterPublicId) {
    return cloudinaryImageUrl(
      {
        ...asset,
        resourceType: 'image',
        publicId: asset.posterPublicId,
        version: asset.posterVersion,
        format: asset.posterFormat,
      },
      width,
      'hero',
    );
  }

  if (asset.resourceType !== 'video' || !asset.publicId) return cloudinaryImageUrl(asset, width, 'hero');
  const version = asset.version ? `/v${asset.version}` : '';
  return `https://res.cloudinary.com/${encodeURIComponent(cloudName)}/video/upload/so_0,c_fill,g_auto,w_${width}/f_auto/q_auto${version}/${encodePublicId(asset.publicId)}.jpg`;
}
