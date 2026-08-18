import type { Locale } from '@/content.config';
import generated from './ui.generated.json';
import overrides from './ui.overrides.json';
import { DEFAULT_LOCALE, LOCALES } from './routes';

type Dict = Partial<Record<string, string>>;

/**
 * ui.generated.json lo reescribe design/tools/export_content.py cada vez que
 * se re-exporta desde Claude Design, así que nada escrito a mano puede vivir
 * ahí. Lo propio de esta versión (metadatos por página, textos de navegación)
 * va en ui.overrides.json y gana sobre lo generado.
 */
const dicts = Object.fromEntries(
  LOCALES.map((locale) => [
    locale,
    { ...(generated as Record<string, Dict>)[locale], ...(overrides as Record<string, Dict>)[locale] },
  ]),
) as Record<Locale, Dict>;

/**
 * Traductor para un idioma.
 *
 * Cae al español cuando falta una clave, igual que hacía cacheSpanish() en el
 * bundle — pero avisa en desarrollo, porque allí un hueco pasaba callado y así
 * es como el modal de experiencias acabó publicado siempre en español.
 */
export function useTranslations(locale: Locale) {
  return function t(key: string): string {
    const value = dicts[locale]?.[key] ?? dicts[DEFAULT_LOCALE]?.[key];
    if (value === undefined) {
      if (import.meta.env.DEV) console.warn(`[i18n] clave sin traducción: ${key}`);
      return key;
    }
    if (dicts[locale]?.[key] === undefined && import.meta.env.DEV) {
      console.warn(`[i18n] "${key}" no existe en ${locale}, usando español`);
    }
    return value;
  };
}

/** Idioma a partir de Astro.currentLocale, con el valor por defecto asegurado. */
export function resolveLocale(current: string | undefined): Locale {
  return (current ?? DEFAULT_LOCALE) as Locale;
}

/** Código para el atributo lang= del documento. */
export const HTML_LANG: Record<Locale, string> = {
  es: 'es-CL',
  en: 'en',
  pt: 'pt-BR',
};

export const WHATSAPP_NUMBER = '56931712780';

export const WHATSAPP_INTRO: Record<Locale, string> = {
  es: 'Hola, quiero cotizar una experiencia con PatagoniK',
  en: 'Hi, I would like a quote for a PatagoniK experience',
  pt: 'Olá, quero cotar uma experiência com a PatagoniK',
};

export function whatsappUrl(message: string): string {
  return `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`;
}
