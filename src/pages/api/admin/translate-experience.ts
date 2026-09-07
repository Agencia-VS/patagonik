import type { APIRoute } from 'astro';
import type { LocalizedExperience } from '@/content.config';
import { validateLocalizedExperience } from '@/lib/experiences/content';
import { ApiError, assertAdmin, env, errorResponse, json } from '@/lib/server/supabase-admin';

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

type TranslationProvider = 'openai' | 'opencode-zen' | 'opencode-go';
type TranslationApiFormat = 'responses' | 'chat-completions';

interface TranslationApiResponse {
  output_text?: string;
  output?: { content?: { type?: string; text?: string; refusal?: string }[] }[];
  choices?: {
    message?: {
      content?: string | { type?: string; text?: string }[];
    };
  }[];
  error?: { message?: string } | string;
  message?: string;
  detail?: string;
}

interface TranslationConfig {
  provider: TranslationProvider;
  providerLabel: string;
  apiFormat: TranslationApiFormat;
  endpoint: string;
  apiKey: string;
  model: string;
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

const systemPrompt = 'Eres traductor editorial de turismo de naturaleza en Patagonia. Traduce del español a inglés internacional y portugués de Brasil. Mantén nombres propios, cifras, unidades, tono humano y comercial. No agregues información. Si cardCategory está vacía, mantenla vacía. Conserva exactamente el número y el orden de facts, includes y excludes. Devuelve sólo JSON válido con las claves en y pt.';

function providerConfig(): TranslationConfig {
  const configuredProvider = env('TRANSLATION_PROVIDER');
  const inferredProvider = env('OPENCODE_API_KEY') ? 'opencode-zen' : 'openai';
  const provider = configuredProvider ?? inferredProvider;
  if (!['openai', 'opencode-zen', 'opencode-go'].includes(provider)) {
    throw new ApiError(503, 'TRANSLATION_PROVIDER debe ser openai, opencode-zen u opencode-go.');
  }

  const typedProvider = provider as TranslationProvider;
  const model = env('TRANSLATION_MODEL') ?? env('OPENAI_TRANSLATION_MODEL') ?? 'gpt-5.6-luna';
  const configuredFormat = env('TRANSLATION_API_FORMAT');
  if (configuredFormat && !['responses', 'chat-completions'].includes(configuredFormat)) {
    throw new ApiError(503, 'TRANSLATION_API_FORMAT debe ser responses o chat-completions.');
  }

  const apiFormat = (configuredFormat ?? (
    typedProvider === 'openai' || /^(gpt-|grok-|muse-spark-)/.test(model)
      ? 'responses'
      : 'chat-completions'
  )) as TranslationApiFormat;
  const providerDetails: Record<TranslationProvider, { label: string; baseUrl: string }> = {
    openai: { label: 'OpenAI', baseUrl: 'https://api.openai.com/v1' },
    'opencode-zen': { label: 'OpenCode Zen', baseUrl: 'https://opencode.ai/zen/v1' },
    'opencode-go': { label: 'OpenCode Go', baseUrl: 'https://opencode.ai/zen/go/v1' },
  };
  const details = providerDetails[typedProvider];
  const apiKey = env('TRANSLATION_API_KEY')
    ?? (typedProvider === 'openai' ? env('OPENAI_API_KEY') : env('OPENCODE_API_KEY') ?? env('OPENAI_API_KEY'));
  if (!apiKey) {
    throw new ApiError(
      503,
      typedProvider === 'openai'
        ? 'Falta TRANSLATION_API_KEY u OPENAI_API_KEY.'
        : 'Falta TRANSLATION_API_KEY u OPENCODE_API_KEY.',
    );
  }

  return {
    provider: typedProvider,
    providerLabel: details.label,
    apiFormat,
    endpoint: `${details.baseUrl}/${apiFormat === 'responses' ? 'responses' : 'chat/completions'}`,
    apiKey,
    model,
  };
}

function outputText(response: TranslationApiResponse): string | undefined {
  if (typeof response.output_text === 'string' && response.output_text.trim()) return response.output_text;
  for (const item of response.output ?? []) {
    for (const content of item.content ?? []) {
      if (typeof content.text === 'string' && content.text.trim()) return content.text;
    }
  }
  const chatContent = response.choices?.[0]?.message?.content;
  if (typeof chatContent === 'string' && chatContent.trim()) return chatContent;
  if (Array.isArray(chatContent)) {
    const text = chatContent
      .map((content) => content.text ?? '')
      .filter(Boolean)
      .join('\n')
      .trim();
    if (text) return text;
  }
  return undefined;
}

function responseError(response: TranslationApiResponse, status: number): string {
  const apiError = response.error;
  if (typeof apiError === 'string' && apiError.trim()) return apiError;
  if (apiError && typeof apiError === 'object' && typeof apiError.message === 'string' && apiError.message.trim()) {
    return apiError.message;
  }
  if (typeof response.message === 'string' && response.message.trim()) return response.message;
  if (typeof response.detail === 'string' && response.detail.trim()) return response.detail;
  return `El proveedor respondió ${status}.`;
}

function translatedJson(raw: string): { en: TranslationShape; pt: TranslationShape } {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i)?.[1];
  const candidates = [fenced, trimmed];
  const firstBrace = trimmed.indexOf('{');
  const lastBrace = trimmed.lastIndexOf('}');
  if (firstBrace >= 0 && lastBrace > firstBrace) candidates.push(trimmed.slice(firstBrace, lastBrace + 1));

  for (const candidate of candidates) {
    if (!candidate) continue;
    try {
      return JSON.parse(candidate) as { en: TranslationShape; pt: TranslationShape };
    } catch {
      // Los modelos chat a veces envuelven el JSON en markdown o una frase breve.
    }
  }
  throw new ApiError(502, 'La traducción llegó en un formato inesperado. Intenta generarla nuevamente.');
}

function requestBody(config: TranslationConfig, source: TranslationShape): Record<string, unknown> {
  if (config.apiFormat === 'chat-completions') {
    return {
      model: config.model,
      stream: false,
      temperature: 0,
      max_tokens: 8000,
      messages: [
        { role: 'system', content: systemPrompt },
        {
          role: 'user',
          content: `Respeta este esquema JSON para cada idioma:\n${JSON.stringify(localizedSchema)}\n\nContenido ES:\n${JSON.stringify(source)}`,
        },
      ],
    };
  }

  return {
    model: config.model,
    store: false,
    max_output_tokens: 8000,
    reasoning: { effort: 'none' },
    input: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: JSON.stringify(source) },
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
  };
}

function providerFailure(status: number, payload: TranslationApiResponse, config: TranslationConfig): ApiError {
  const suffix = `Proveedor: ${config.providerLabel}; modelo: ${config.model}; formato: ${config.apiFormat}.`;
  if (status === 401) {
    return new ApiError(503, `La clave fue rechazada por ${config.providerLabel} (401). Verifica que la key y TRANSLATION_PROVIDER correspondan al mismo servicio. ${suffix}`);
  }
  if (status === 402) {
    return new ApiError(503, `${config.providerLabel} requiere saldo o una suscripción activa. ${suffix}`);
  }
  if (status === 403) {
    return new ApiError(503, `${config.providerLabel} no permite usar ese modelo con esta key. Revisa el acceso al modelo. ${suffix}`);
  }
  if (status === 404) {
    return new ApiError(503, `${config.providerLabel} no encontró el modelo o endpoint configurado. ${suffix}`);
  }
  if (status === 429) {
    return new ApiError(429, `${config.providerLabel} está ocupado o alcanzó su límite. Intenta nuevamente en un momento. ${suffix}`);
  }
  const detail = responseError(payload, status);
  return new ApiError(502, `No se pudo generar la traducción: ${detail} ${suffix}`);
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

    const config = providerConfig();
    const translationSource: TranslationShape = {
      ...spanish,
      cardCategory: spanish.cardCategory ?? '',
      facts: spanish.facts.map(([label, value]) => ({ label, value })),
    };
    const headers: Record<string, string> = {
      Authorization: `Bearer ${config.apiKey}`,
      'Content-Type': 'application/json',
    };
    if (config.provider !== 'openai') {
      headers['User-Agent'] = 'patagonik-admin/1.0';
      headers['x-opencode-session'] = crypto.randomUUID();
    }

    let response: Response;
    try {
      response = await fetch(config.endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify(requestBody(config, translationSource)),
        signal: AbortSignal.timeout(60_000),
      });
    } catch {
      throw new ApiError(502, `No se pudo conectar con ${config.providerLabel}. Intenta nuevamente.`);
    }
    const payload = (await response.json().catch(() => ({}))) as TranslationApiResponse;
    if (!response.ok) throw providerFailure(response.status, payload, config);
    const raw = outputText(payload);
    if (!raw) throw new ApiError(502, `${config.providerLabel} no devolvió una traducción utilizable.`);
    const translated = translatedJson(raw);
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
    return json({ en, pt, model: config.model, provider: config.provider });
  } catch (error) {
    return errorResponse(error);
  }
};
