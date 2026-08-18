/**
 * Falla el build si una clave de traducción llegó al HTML sin resolver.
 *
 * Es el mismo fallo que dejó el detalle de experiencia publicado siempre en
 * español durante toda la vida del bundle: nada avisaba de que faltara. Aquí
 * se ve en CI antes de publicar.
 *
 * Uso: node scripts/check-i18n.mjs [dir]
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const root = process.argv[2] || '.vercel/output/static';
const KEY = />((?:meta|menu|exp|faq|quiz|quote|footer|hero|esc|diff|nav|reviews|social|tour|cta)\.[a-z0-9.]+)</gi;

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) yield* walk(p);
    else if (p.endsWith('.html')) yield p;
  }
}

const found = new Map();
for (const file of walk(root)) {
  for (const [, key] of readFileSync(file, 'utf8').matchAll(KEY)) {
    if (!found.has(key)) found.set(key, file);
  }
}

if (found.size) {
  console.error(`\n✗ ${found.size} clave(s) de i18n sin resolver en el HTML:\n`);
  for (const [key, file] of found) console.error(`  ${key}  (p. ej. ${file})`);
  console.error('\nAñádelas en src/i18n/ui.overrides.json\n');
  process.exit(1);
}
console.log('✓ i18n: ninguna clave sin resolver');
