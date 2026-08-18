import type { Locale } from '@/content.config';

/**
 * Nombre de cada página en cada idioma.
 *
 * En el bundle las rutas eran /tabs/faq y /tabs/quienes-somos, con el prefijo
 * /tabs/ heredado del brief y marcado allí como pendiente de confirmar. Aquí
 * pasan a URLs limpias y traducidas, que es lo que indexa bien. Si prefieres
 * conservar /tabs/, es cambiar los valores de este objeto: nada más lo sabe.
 */
export const ROUTE_SEGMENTS = {
  about: { es: 'quienes-somos', en: 'about-us', pt: 'quem-somos' },
  faq: { es: 'preguntas-frecuentes', en: 'faq', pt: 'perguntas-frequentes' },
  experiences: { es: 'experiencias', en: 'experiences', pt: 'experiencias' },
} as const satisfies Record<string, Record<Locale, string>>;

export type RouteKey = keyof typeof ROUTE_SEGMENTS;

export const DEFAULT_LOCALE: Locale = 'es';
export const LOCALES = ['es', 'en', 'pt'] as const;

/** Prefijo de idioma: el idioma por defecto vive en la raíz, sin prefijo. */
export function localePrefix(locale: Locale): string {
  return locale === DEFAULT_LOCALE ? '' : `/${locale}`;
}

/** URL absoluta-al-sitio de una página, ya en el idioma pedido. */
export function routePath(key: RouteKey, locale: Locale): string {
  return `${localePrefix(locale)}/${ROUTE_SEGMENTS[key][locale]}`;
}

export function homePath(locale: Locale): string {
  return localePrefix(locale) || '/';
}

export function experiencePath(slug: string, locale: Locale): string {
  return `${routePath('experiences', locale)}/${slug}`;
}
