import type { APIRoute } from 'astro';
import type { LocalizedExperience } from '@/content.config';
import { validateLocalizedExperience } from '@/lib/experiences/content';
import { ApiError, assertAdmin, env, errorResponse, json, requiredEnv } from '@/lib/server/supabase-admin';

export const prerender = false;

interface TranslationShape {
  cardTitle: string;
  cardSummary: string;
  cardDetail: string;
  cardCategory: string;
  title: string;
  lead: string;
  body: string;
  facts: { label: string; value: string }[];
  includes: string[];
  excludes: string[];
  modality: string;
  note: string;
}

interface OpenAIResponse {
  output_text?: string;
  output?: { content?: { type?: string; text?: string; refusal?: string }[] }[];
  error?: { message?: string };
}

const localizedSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    cardTitle: { type: 'string' },
    cardSummary: { type: 'string' },
    cardDetail: { type: 'string' },
    cardCategory: { type: 'string' },
    title: { type: 'string' },
    lead: { type: 'string' },
    body: { type: 'string' },
    facts: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: { label: { type: 'string' }, value: { type: 'string' } },
        required: ['label', 'value'],
      },
    },
    includes: { type: 'array', items: { type: 'string' } },
    excludes: { type: 'array', items: { type: 'string' } },
    modality: { type: 'string' },
    note: { type: 'string' },
  },
  required: [
    'cardTitle', 'cardSummary', 'cardDetail', 'cardCategory', 'title', 'lead', 'body',
    'facts', 'includes', 'excludes', 'modality', 'note',
  ],
} as const;

function outputText(response: OpenAIResponse): string | undefined {
  if (typeof response.output_text === 'string' && response.output_text.trim()) return response.output_text;
  for (const item of response.output ?? []) {
    for (const content of item.content ?? []) {
      if (typeof content.text === 'string' && content.text.trim()) return content.text;
    }
  }
  return undefined;
}

function asLocalized(value: TranslationShape): LocalizedExperience {
  const localized = {
    ...value,
    cardCategory: value.cardCategory.trim() || undefined,
    facts: value.facts.map(({ label, value: factValue }) => [label, factValue] as [string, string]),
  };
  return validateLocalizedExperience(localized);
}

export const POST: APIRoute = async ({ request }) => {
  try {
    await assertAdmin(request);
    const body = (await request.json().catch(() => ({}))) as { es?: unknown };
    let spanish: LocalizedExperience;
    try {
      spanish = validateLocalizedExperience(body.es, 'Contenido ES');
    } catch (error) {
      throw new ApiError(422, error instanceof Error ? error.message : 'Completa el contenido en español antes de traducir.');
    }

    const apiKey = requiredEnv('OPENAI_API_KEY');
    const model = env('OPENAI_TRANSLATION_MODEL') ?? 'gpt-5.6-luna';
    const translationSource: TranslationShape = {
      ...spanish,
      cardCategory: spanish.cardCategory ?? '',
      facts: spanish.facts.map(([label, value]) => ({ label, value })),
    };
    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        store: false,
        max_output_tokens: 8000,
        reasoning: { effort: 'none' },
        input: [
          {
            role: 'system',
            content: 'Eres traductor editorial de turismo de naturaleza en Patagonia. Traduce del español a inglés internacional y portugués de Brasil. Mantén nombres propios, cifras, unidades, tono humano y comercial. No agregues información. Si cardCategory está vacía, mantenla vacía. Conserva exactamente el número y el orden de facts, includes y excludes. Devuelve sólo el objeto solicitado.',
          },
          { role: 'user', content: JSON.stringify(translationSource) },
        ],
        text: {
          format: {
            type: 'json_schema',
            name: 'experience_translations',
            strict: true,
            schema: {
              type: 'object',
              additionalProperties: false,
              properties: { en: localizedSchema, pt: localizedSchema },
              required: ['en', 'pt'],
            },
          },
        },
      }),
    });
    const payload = (await response.json().catch(() => ({}))) as OpenAIResponse;
    if (!response.ok) {
      const detail = payload.error?.message ?? `OpenAI respondió ${response.status}.`;
      if (response.status === 401) throw new ApiError(503, 'La clave de traducción configurada no es válida.');
      if (response.status === 429) throw new ApiError(429, 'El servicio de traducción está ocupado o alcanzó su límite. Intenta nuevamente en un momento.');
      throw new ApiError(502, `No se pudo generar la traducción: ${detail}`);
    }
    const raw = outputText(payload);
    if (!raw) throw new ApiError(502, 'El servicio no devolvió una traducción utilizable.');
    let translated: { en: TranslationShape; pt: TranslationShape };
    try {
      translated = JSON.parse(raw) as { en: TranslationShape; pt: TranslationShape };
    } catch {
      throw new ApiError(502, 'La traducción llegó en un formato inesperado.');
    }
    let en: LocalizedExperience;
    let pt: LocalizedExperience;
    try {
      en = asLocalized(translated.en);
      pt = asLocalized(translated.pt);
    } catch {
      throw new ApiError(502, 'La traducción llegó incompleta. Intenta generarla nuevamente.');
    }
    for (const locale of [en, pt]) {
      if (locale.facts.length !== spanish.facts.length
        || locale.includes.length !== spanish.includes.length
        || locale.excludes.length !== spanish.excludes.length) {
        throw new ApiError(502, 'La traducción cambió la estructura del contenido. Intenta generarla nuevamente.');
      }
    }
    return json({ en, pt, model });
  } catch (error) {
    return errorResponse(error);
  }
};
