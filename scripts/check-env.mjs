import { readFileSync } from 'node:fs';

const files = [
  'src/lib/server/supabase-admin.ts',
  'src/lib/media/landing-assets.ts',
];

const errors = [];
for (const file of files) {
  const body = readFileSync(file, 'utf8');
  if (/import\.meta\.env\s*\[/.test(body)) {
    errors.push(`${file} usa acceso dinámico a import.meta.env; Vite no lo reemplaza en producción`);
  }
}

const serverEnv = readFileSync('src/lib/server/supabase-admin.ts', 'utf8');
for (const name of ['VERCEL_DEPLOY_HOOK_URL', 'SUPABASE_SECRET_KEY', 'CLOUDINARY_API_SECRET', 'CRON_SECRET', 'OPENAI_API_KEY', 'OPENAI_TRANSLATION_MODEL']) {
  if (!serverEnv.includes(`import.meta.env.${name}`)) errors.push(`falta acceso estático para ${name}`);
}
if (!serverEnv.includes('process.env[name] ?? BUILD_ENV[name]')) {
  errors.push('el lector server no prioriza las variables runtime de Vercel');
}

if (errors.length) {
  console.error(errors.map((error) => `env: ${error}`).join('\n'));
  process.exit(1);
}

console.log('env: variables server disponibles en runtime y sin accesos dinámicos de Vite');
