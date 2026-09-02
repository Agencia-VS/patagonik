import type { Locale, LocalizedExperience } from '@/content.config';
import type { ExperienceContent } from './catalog';

const LOCALES: Locale[] = ['es', 'en', 'pt'];
const REQUIRED_TEXT: (keyof LocalizedExperience)[] = [
  'cardTitle',
  'cardSummary',
  'cardDetail',
  'title',
  'lead',
  'body',
  'modality',
  'note',
];

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

export function validateLocalizedExperience(value: unknown, label = 'contenido'): LocalizedExperience {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label}: formato inválido.`);
  const candidate = value as Record<string, unknown>;
  for (const field of REQUIRED_TEXT) {
    if (!isNonEmptyString(candidate[field])) throw new Error(`${label}: falta completar ${field}.`);
  }
  if (candidate.cardCategory !== undefined && typeof candidate.cardCategory !== 'string') {
    throw new Error(`${label}: cardCategory debe ser texto.`);
  }
  if (!Array.isArray(candidate.facts) || candidate.facts.length < 1) {
    throw new Error(`${label}: agrega al menos un dato práctico.`);
  }
  for (const fact of candidate.facts) {
    if (!Array.isArray(fact) || fact.length !== 2 || !isNonEmptyString(fact[0]) || !isNonEmptyString(fact[1])) {
      throw new Error(`${label}: cada dato práctico debe tener etiqueta y valor.`);
    }
  }
  for (const field of ['includes', 'excludes'] as const) {
    if (!Array.isArray(candidate[field]) || !candidate[field].every(isNonEmptyString)) {
      throw new Error(`${label}: ${field} debe contener una línea por elemento.`);
    }
  }
  return candidate as unknown as LocalizedExperience;
}

export function validateExperienceContent(value: unknown): ExperienceContent {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Contenido de experiencia inválido.');
  const candidate = value as Record<string, unknown>;
  const content = Object.fromEntries(
    LOCALES.map((locale) => [locale, validateLocalizedExperience(candidate[locale], `Contenido ${locale.toUpperCase()}`)]),
  ) as ExperienceContent;
  const base = content.es;
  for (const locale of ['en', 'pt'] as const) {
    for (const field of ['facts', 'includes', 'excludes'] as const) {
      if (content[locale][field].length !== base[field].length) {
        throw new Error(`Contenido ${locale.toUpperCase()}: ${field} debe tener ${base[field].length} elementos.`);
      }
    }
  }
  return content;
}

export function normalizeExperienceSlug(value: unknown): string {
  if (typeof value !== 'string') throw new Error('El slug es obligatorio.');
  const slug = value.trim().toLowerCase();
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    throw new Error('El slug sólo puede usar minúsculas, números y guiones simples.');
  }
  return slug;
}
