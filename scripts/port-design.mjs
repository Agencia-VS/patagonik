/**
 * Trae el diseño del bundle de Claude Design a Astro.
 *
 * No reinterpreta nada: copia las tipografías y las fotos a public/, y extrae
 * los bloques <style> **en su orden original** — el cascade de este archivo
 * depende del orden, porque las capas pk-*-vNN se corrigen unas a otras.
 *
 * Las referencias por uuid (que el cargador del bundle resolvía a blob:) se
 * reescriben a rutas reales de public/.
 *
 * Uso: node scripts/port-design.mjs
 */
import { readFileSync, writeFileSync, copyFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const SRC = 'design/src';
const template = readFileSync(join(SRC, 'template.html'), 'utf8');
const index = JSON.parse(readFileSync(join(SRC, 'assets/index.json'), 'utf8'));

mkdirSync('public/fonts', { recursive: true });
mkdirSync('public/images', { recursive: true });

// ── 1. nombre legible para cada asset ────────────────────────────────────
// uuid -> primer slot que lo usa (para nombrar el archivo) y, aparte, TODOS
// los slots que apuntan a él: el fondo de la galería se usa dos veces, una
// nítida y otra desenfocada, y quedarnos sólo con el primero dejaba la capa
// nítida sin imagen.
const slotOf = new Map();
const slotsOf = new Map();
for (const m of template.matchAll(/<image-slot[^>]*\bid="([^"]*)"[^>]*\bsrc="([0-9a-f-]{36})"/g)) {
  const [, id, uuid] = m;
  if (!slotOf.has(uuid)) slotOf.set(uuid, id);
  if (!slotsOf.has(uuid)) slotsOf.set(uuid, []);
  slotsOf.get(uuid).push(id);
}

const fontSeq = new Map();
const urlFor = new Map();

for (const [uuid, entry] of Object.entries(index)) {
  if (entry.mime === 'font/woff2') {
    // El nombre de familia y el peso salen del @font-face que la usa.
    const face = template.match(
      new RegExp(`@font-face\\s*\\{[^}]*?font-family:\\s*'([^']+)'[^}]*?font-weight:\\s*(\\d+)[^}]*?${uuid}[^}]*\\}`, 's'),
    );
    const family = (face?.[1] ?? 'font').toLowerCase();
    const weight = face?.[2] ?? '400';
    const key = `${family}-${weight}`;
    const n = (fontSeq.get(key) ?? 0) + 1;
    fontSeq.set(key, n);
    const name = `${key}-${n}.woff2`;
    copyFileSync(join(SRC, 'assets', entry.file), join('public/fonts', name));
    urlFor.set(uuid, `/fonts/${name}`);
  } else if (entry.mime.startsWith('image/')) {
    const slot = slotOf.get(uuid);
    const base = slot ? slot.replace(/^pt-/, '') : `bg-${uuid.slice(0, 8)}`;
    const name = `${base}.webp`;
    copyFileSync(join(SRC, 'assets', entry.file), join('public/images', name));
    urlFor.set(uuid, `/images/${name}`);
  }
  // Los .js son el runtime de Claude Design: no viajan, Astro no los necesita.
}

// ── 2. CSS, en orden ─────────────────────────────────────────────────────
const blocks = [...template.matchAll(/<style(?:\s+id="([^"]*)")?[^>]*>([\s\S]*?)<\/style>/g)];
let css = `/* Generado por scripts/port-design.mjs — no editar a mano.
   ${blocks.length} bloques <style> del diseño original, en su orden.
   El orden importa: las capas pk-*-vNN se corrigen unas a otras. */\n`;

for (const [, id, body] of blocks) {
  css += `\n/* ${'='.repeat(66)}\n   ${id || '(sin id)'}\n   ${'='.repeat(66)} */\n${body.trim()}\n`;
}

// uuid -> ruta real
let rewritten = 0;
css = css.replace(/(['"]?)([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\1/g, (all, q, uuid) => {
  const url = urlFor.get(uuid);
  if (!url) return all;
  rewritten++;
  return `${q}${url}${q}`;
});

writeFileSync('src/styles/design.css', css);

// ── 3. mapa uuid -> ruta, para el port del marcado ───────────────────────
const assetMap = {};
for (const [uuid, path] of urlFor) {
  for (const id of slotsOf.get(uuid) ?? [uuid]) assetMap[id] = path;
  assetMap[uuid] = path;
}
writeFileSync('src/styles/asset-map.json', JSON.stringify(assetMap, null, 2) + '\n');

console.log(`tipografías  ${[...urlFor.values()].filter((v) => v.startsWith('/fonts')).length}`);
console.log(`imágenes     ${[...urlFor.values()].filter((v) => v.startsWith('/images')).length}`);
console.log(`bloques CSS  ${blocks.length}  (${css.split('\n').length} líneas)`);
console.log(`referencias uuid reescritas: ${rewritten}`);
