import type { Locale } from '@/content.config';

export type MediaResourceType = 'image' | 'video';
export type MediaFitMode = 'cover' | 'contain';
export type MediaProvider = 'supabase' | 'cloudinary';

export interface MediaFocalPoint {
  x: number;
  y: number;
  desktop?: { x: number; y: number };
  mobile?: { x: number; y: number };
  modal?: { x: number; y: number };
}

export interface MediaAlt {
  es?: string;
  en?: string;
  pt?: string;
}

export interface LandingAsset {
  slotKey: string;
  label: string;
  preset: string;
  resourceType: MediaResourceType;
  provider?: MediaProvider;
  publicId?: string;
  version?: number;
  format?: string;
  width?: number;
  height?: number;
  duration?: number;
  alt?: MediaAlt;
  focalPoint?: MediaFocalPoint;
  fitMode?: MediaFitMode;
  posterPublicId?: string;
  posterVersion?: number;
  posterFormat?: string;
  storageBucket?: string;
  storagePath?: string;
  storageUrl?: string;
  mimeType?: string;
  variants?: Record<string, string>;
  posterBucket?: string;
  posterPath?: string;
  posterUrl?: string;
  posterVariants?: Record<string, string>;
  legacySecureUrl?: string;
  displayMode?: 'green' | 'photo';
  fallback?: string;
}

export type LandingAssetMap = Record<string, LandingAsset>;

export function localizedAlt(asset: LandingAsset | undefined, locale: Locale): string {
  if (!asset?.alt) return '';
  return asset.alt[locale] ?? asset.alt.es ?? '';
}
