import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const LOCALES = ['es', 'en', 'pt'] as const;
export type Locale = (typeof LOCALES)[number];

/**
 * Un "fact" es un par etiqueta/valor: ["Duración", "8 a 10 h"].
 * Se guarda como tupla y no como objeto porque el orden importa — es el orden
 * en que se pintan en la ficha.
 */
const fact = z.tuple([z.string().min(1), z.string().min(1)]);

const localizedExperience = z.object({
  // Tarjeta del carrusel
  cardTitle: z.string().min(1),
  cardSummary: z.string().min(1),
  cardDetail: z.string().min(1),
  cardCategory: z.string().optional(),
  // Ficha de detalle
  title: z.string().min(1),
  lead: z.string().min(1),
  body: z.string().min(1),
  facts: z.array(fact).min(1),
  includes: z.array(z.string().min(1)),
  excludes: z.array(z.string().min(1)),
  modality: z.string().min(1),
  note: z.string().min(1),
});

// z se importa como valor desde astro:content, así que para el tipo se lee la
// inferencia del propio schema en vez de usar z.infer como namespace.
export type LocalizedExperience = (typeof localizedExperience)["_output"];

const experiences = defineCollection({
  loader: glob({ pattern: '**/*.json', base: './src/content/experiences' }),
  schema: z
    .object({
      order: z.number().int().positive(),
      slug: z.string().regex(/^[a-z0-9-]+$/, 'slug en minúsculas, sin acentos ni espacios'),
      image: z.string(),
      content: z.object({
        es: localizedExperience,
        en: localizedExperience,
        pt: localizedExperience,
      }),
    })
    /**
     * Paridad de forma entre idiomas.
     *
     * En el bundle esto no lo garantizaba nada: el detalle se armaba mezclando
     * el objeto español con el overlay del idioma activo, así que una
     * traducción con un fact de menos producía una ficha incoherente sin que
     * nada fallara. Aquí el build se cae antes de publicar.
     */
    .superRefine((entry, ctx) => {
      const base = entry.content.es;
      for (const locale of ['en', 'pt'] as const) {
        for (const field of ['facts', 'includes', 'excludes'] as const) {
          const got = entry.content[locale][field].length;
          const want = base[field].length;
          if (got !== want) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              path: ['content', locale, field],
              message: `${got} elementos en ${locale}, ${want} en es — deben coincidir`,
            });
          }
        }
        const gotLabels = entry.content[locale].facts.map(([label]) => label);
        if (new Set(gotLabels).size !== gotLabels.length) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['content', locale, 'facts'],
            message: 'hay etiquetas de fact repetidas',
          });
        }
      }
    }),
});

/**
 * Reseñas reales de pasajeros.
 *
 * No llevan variantes por idioma a propósito: son las palabras de una persona
 * concreta y traducirlas sería ponerle en la boca algo que no dijo. Se guarda
 * el idioma en que se escribió y la ficha las muestra tal cual, marcadas.
 */
const testimonials = defineCollection({
  loader: glob({ pattern: '**/*.json', base: './src/content/testimonials' }),
  schema: z.object({
    order: z.number().int().positive(),
    id: z.string(),
    author: z.string().min(1),
    origin: z.string().nullable(),
    experience: z.string().nullable(),
    lang: z.enum(LOCALES),
    source: z.enum(['google', 'tripadvisor', 'direct']),
    quote: z.string().min(1),
  }),
});

export const collections = { experiences, testimonials };
