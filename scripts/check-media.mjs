import { readFileSync } from 'node:fs';

const local = readFileSync('src/lib/media/landing-assets.local.ts', 'utf8');
const migration = readFileSync('supabase/migrations/20260819000000_landing_media_admin.sql', 'utf8');
const components = [
  'src/components/design/Landing.astro',
  'src/components/design/AboutSections.astro',
  'src/components/pages/ExperiencesIndex.astro',
];

const expected = [
  'landing.hero', 'landing.band-valle', 'landing.experiences-background', 'landing.final-cta', 'about.essence',
  'base-torres-amanecer-regular', 'valle-del-frances', 'glaciar-grey-navegacion', 'excursiones-especiales',
  'avistamiento-de-fauna', 'chorrillo-los-salmones', 'aonikenk-laguna-azul', 'balmaceda-serrano',
  'full-day-perspectivas-cueva-del-milodon', 'laguna-cebolla-avistamiento-de-fauna', 'lazo-weber',
  'trekking-escenico-torres-del-paine', 'mirador-ferrier', 'paso-la-feria-weber', 'full-day-perito-moreno', 'astrofotografia',
];

const errors = [];
for (const key of expected) {
  if (!local.includes(key)) errors.push(`falta ${key} en fallback local`);
  if (!migration.includes(key)) errors.push(`falta ${key} en migración SQL`);
}
for (const file of components) {
  const body = readFileSync(file, 'utf8');
  if (/<(?:img|video)\b[^>]*\bsrc=["']\/images\//.test(body)) errors.push(`${file} conserva un asset hardcodeado`);
}
if (!readFileSync('src/scripts/design-behaviour.js', 'utf8').includes('setupLazyMedia()')) {
  errors.push('falta setupLazyMedia en el comportamiento de diseño');
}

if (errors.length) {
  console.error(errors.map((error) => `media: ${error}`).join('\n'));
  process.exit(1);
}
console.log(`media: ${expected.length} slots sincronizados; componentes sin src hardcodeados`);
