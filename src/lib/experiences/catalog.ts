import { getCollection } from 'astro:content';
import type { Locale, LocalizedExperience } from '@/content.config';

export type ExperienceStatus = 'active' | 'archived';
export type ExperienceContent = Record<Locale, LocalizedExperience>;

export interface ExperienceRecord {
  id?: string;
  slug: string;
  order: number;
  content: ExperienceContent;
  localSource: boolean;
}

export interface ExperienceDatabaseRow {
  id: string;
  slug: string;
  local_source: boolean;
  draft_order: number;
  published_order: number | null;
  draft_status: ExperienceStatus;
  published_status: ExperienceStatus;
  draft_deleted: boolean;
  published_deleted: boolean;
  draft_content: ExperienceContent | null;
  published_content: ExperienceContent | null;
  updated_at: string;
  published_at: string | null;
}

let publishedPromise: Promise<ExperienceRecord[]> | undefined;

function cleanEnv(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function serviceHeaders(secretKey: string): Record<string, string> {
  const headers: Record<string, string> = { apikey: secretKey, Accept: 'application/json' };
  if (secretKey.split('.').length === 3) headers.Authorization = `Bearer ${secretKey}`;
  return headers;
}

export async function getLocalExperiences(): Promise<ExperienceRecord[]> {
  const entries = await getCollection('experiences');
  return entries
    .map((entry) => ({
      slug: entry.data.slug,
      order: entry.data.order,
      content: entry.data.content,
      localSource: true,
    }))
    .sort((a, b) => a.order - b.order);
}

async function loadPublishedExperiences(): Promise<ExperienceRecord[]> {
  const local = await getLocalExperiences();
  const localBySlug = new Map(local.map((entry) => [entry.slug, entry]));
  const supabaseUrl = cleanEnv(import.meta.env.SUPABASE_URL) ?? cleanEnv(import.meta.env.PUBLIC_SUPABASE_URL);
  const secretKey = cleanEnv(import.meta.env.SUPABASE_SECRET_KEY) ?? cleanEnv(import.meta.env.SUPABASE_SERVICE_ROLE_KEY);
  const requireRemote = cleanEnv(import.meta.env.EXPERIENCES_REMOTE_REQUIRED) === 'true';

  if (!supabaseUrl || !secretKey) {
    if (requireRemote) throw new Error('Faltan SUPABASE_URL y SUPABASE_SECRET_KEY para cargar el catálogo publicado.');
    return local;
  }

  try {
    const response = await fetch(
      `${supabaseUrl.replace(/\/$/, '')}/rest/v1/experiences?select=*&order=published_order.asc.nullslast,draft_order.asc`,
      { headers: serviceHeaders(secretKey) },
    );
    if (!response.ok) throw new Error(`Supabase respondió ${response.status}: ${await response.text()}`);
    const rows = (await response.json()) as ExperienceDatabaseRow[];
    if (!rows.length) return local;

    const records: ExperienceRecord[] = [];
    const represented = new Set<string>();
    for (const row of rows) {
      represented.add(row.slug);
      if (row.published_deleted || row.published_status !== 'active' || row.published_order === null) continue;
      const localEntry = localBySlug.get(row.slug);
      const content = row.published_content ?? localEntry?.content;
      if (!content) {
        console.warn(`[experiences] Se omitió ${row.slug}: no tiene contenido publicado.`);
        continue;
      }
      records.push({
        id: row.id,
        slug: row.slug,
        order: row.published_order,
        content,
        localSource: row.local_source,
      });
    }

    // Compatibilidad con despliegues donde la migración se aplicó antes de
    // que una nueva experiencia local fuera incorporada al seed.
    for (const entry of local) {
      if (!represented.has(entry.slug)) records.push(entry);
    }
    return records.sort((a, b) => a.order - b.order);
  } catch (error) {
    if (requireRemote) throw error;
    console.warn('[experiences] No se pudo cargar Supabase; se usará el catálogo local.', error);
    return local;
  }
}

export function getPublishedExperiences(): Promise<ExperienceRecord[]> {
  publishedPromise ??= loadPublishedExperiences();
  return publishedPromise;
}
