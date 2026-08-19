import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { basename } from 'node:path';

const cloudName = process.env.PUBLIC_CLOUDINARY_CLOUD_NAME;
const apiKey = process.env.CLOUDINARY_API_KEY;
const apiSecret = process.env.CLOUDINARY_API_SECRET;
const folder = process.env.CLOUDINARY_ASSET_FOLDER || 'patagonik/landing';
const supabaseUrl = (process.env.SUPABASE_URL || process.env.PUBLIC_SUPABASE_URL || '').replace(/\/$/, '');
const supabaseKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!cloudName || !apiKey || !apiSecret || !supabaseUrl || !supabaseKey) {
  throw new Error('Faltan credenciales Cloudinary o Supabase; revisa .env.example.');
}

const files = [
  ['landing.band-valle','public/images/band-valle.webp'],
  ['landing.experiences-background','public/images/exp-bg-extended.webp'],
  ['landing.final-cta','public/images/final-band.webp'],
  ['about.essence','public/images/esc-main.webp'],
  ['experience.base-torres-amanecer-regular.cover','public/images/exp-1.webp'],
  ['experience.valle-del-frances.cover','public/images/exp-2.webp'],
  ['experience.glaciar-grey-navegacion.cover','public/images/exp-3.webp'],
  ['experience.excursiones-especiales.cover','public/images/exp-4.webp'],
  ['experience.avistamiento-de-fauna.cover','public/images/exp-5.webp'],
  ['experience.chorrillo-los-salmones.cover','public/images/exp-6.webp'],
  ['experience.aonikenk-laguna-azul.cover','public/images/exp-7.webp'],
  ['experience.balmaceda-serrano.cover','public/images/exp-8.webp'],
  ['experience.full-day-perspectivas-cueva-del-milodon.cover','public/images/exp-9.webp'],
  ['experience.laguna-cebolla-avistamiento-de-fauna.cover','public/images/exp-10.webp'],
  ['experience.lazo-weber.cover','public/images/exp-11.webp'],
  ['experience.trekking-escenico-torres-del-paine.cover','public/images/exp-12.webp'],
  ['experience.mirador-ferrier.cover','public/images/exp-13.webp'],
  ['experience.paso-la-feria-weber.cover','public/images/exp-14.webp'],
  ['experience.full-day-perito-moreno.cover','public/images/exp-15.webp'],
  ['experience.astrofotografia.cover','public/images/exp-16.webp'],
];

const serviceHeaders = { apikey:supabaseKey, 'Content-Type':'application/json' };
if (supabaseKey.split('.').length === 3) serviceHeaders.Authorization = `Bearer ${supabaseKey}`;

async function upload(path) {
  const timestamp = Math.floor(Date.now()/1000);
  const params = { folder, overwrite:'false', timestamp:String(timestamp), unique_filename:'true', use_filename:'true' };
  const source = Object.entries(params).sort(([a],[b]) => a.localeCompare(b)).map(([k,v]) => `${k}=${v}`).join('&');
  const signature = createHash('sha1').update(source + apiSecret).digest('hex');
  const bytes = await readFile(path);
  const form = new FormData();
  form.set('file', new Blob([bytes], { type:'image/webp' }), basename(path));
  form.set('api_key', apiKey); form.set('timestamp', String(timestamp)); form.set('signature', signature);
  for (const [key,value] of Object.entries(params)) form.set(key, value);
  const response = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, { method:'POST', body:form });
  if (!response.ok) throw new Error(`Cloudinary ${path}: ${await response.text()}`);
  return response.json();
}

for (const [slotKey,path] of files) {
  const uploaded = await upload(path);
  const assetResponse = await fetch(`${supabaseUrl}/rest/v1/media_assets?on_conflict=resource_type,public_id,version`, {
    method:'POST',
    headers:{ ...serviceHeaders, Prefer:'resolution=merge-duplicates,return=representation' },
    body:JSON.stringify({
      public_id:uploaded.public_id, resource_type:uploaded.resource_type, version:uploaded.version,
      format:uploaded.format, width:uploaded.width, height:uploaded.height, bytes:uploaded.bytes,
      secure_url:uploaded.secure_url, original_filename:uploaded.original_filename,
    }),
  });
  if (!assetResponse.ok) throw new Error(`Supabase asset ${slotKey}: ${await assetResponse.text()}`);
  const [asset] = await assetResponse.json();
  const assignmentResponse = await fetch(`${supabaseUrl}/rest/v1/landing_slot_assignments?slot_key=eq.${encodeURIComponent(slotKey)}`, {
    method:'PATCH', headers:{ ...serviceHeaders, Prefer:'return=minimal' }, body:JSON.stringify({ draft_asset_id:asset.id }),
  });
  if (!assignmentResponse.ok) throw new Error(`Supabase slot ${slotKey}: ${await assignmentResponse.text()}`);
  console.log(`${slotKey} -> ${uploaded.public_id}`);
}
console.log('Migración terminada. Revisa los borradores en /admin y pulsa Publicar cambios.');
