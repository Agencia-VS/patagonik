import { readFile } from 'node:fs/promises';
import { extname } from 'node:path';
import sharp from 'sharp';

const supabaseUrl = (process.env.SUPABASE_URL || process.env.PUBLIC_SUPABASE_URL || '').replace(/\/$/, '');
const supabaseKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
const bucket = process.env.SUPABASE_STORAGE_BUCKET || process.env.PUBLIC_SUPABASE_STORAGE_BUCKET || 'patagonik-media';
if (!supabaseUrl || !supabaseKey) throw new Error('Faltan SUPABASE_URL y SUPABASE_SECRET_KEY; revisa .env.example.');

const headers = { apikey:supabaseKey, Accept:'application/json' };
if (supabaseKey.split('.').length === 3) headers.Authorization = `Bearer ${supabaseKey}`;

const localFiles = [
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

function encodeStoragePath(path) {
  return path.split('/').map(encodeURIComponent).join('/');
}

function publicUrl(path) {
  return `${supabaseUrl}/storage/v1/object/public/${encodeURIComponent(bucket)}/${encodeStoragePath(path)}`;
}

function sourceExtension(asset, contentType) {
  const fromType = contentType.split('/')[1]?.split('+')[0];
  const known = { jpeg:'jpg', png:'png', webp:'webp', avif:'avif', mp4:'mp4', webm:'webm' };
  return known[fromType] || asset.format || extname(asset.original_filename || '').replace(/^\./, '') || (asset.resource_type === 'video' ? 'mp4' : 'bin');
}

async function uploadObject(path, body, contentType) {
  const response = await fetch(`${supabaseUrl}/storage/v1/object/${encodeStoragePath(`${bucket}/${path}`)}`, {
    method:'POST',
    headers:{ ...headers, 'Content-Type':contentType, 'cache-control':'31536000', 'x-upsert':'true' },
    body,
  });
  if (!response.ok) throw new Error(`Storage ${path}: ${response.status} ${await response.text()}`);
}

async function patchAsset(assetId, body) {
  const response = await fetch(`${supabaseUrl}/rest/v1/media_assets?id=eq.${encodeURIComponent(assetId)}`, {
    method:'PATCH',
    headers:{ ...headers, 'Content-Type':'application/json', Prefer:'return=minimal' },
    body:JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`Supabase asset ${assetId}: ${response.status} ${await response.text()}`);
}

async function insertAsset(body) {
  const response = await fetch(`${supabaseUrl}/rest/v1/media_assets`, {
    method:'POST',
    headers:{ ...headers, 'Content-Type':'application/json', Prefer:'return=representation' },
    body:JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`Supabase insert media_assets: ${response.status} ${await response.text()}`);
  const [asset] = await response.json();
  if (!asset?.id) throw new Error('Supabase no devolvió el id del asset.');
  return asset.id;
}

async function assignment(slotKey) {
  const response = await fetch(`${supabaseUrl}/rest/v1/landing_slot_assignments?slot_key=eq.${encodeURIComponent(slotKey)}&select=draft_asset_id,published_asset_id&limit=1`, { headers });
  if (!response.ok) throw new Error(`Supabase assignment ${slotKey}: ${response.status} ${await response.text()}`);
  return (await response.json())[0] || null;
}

async function setDraftAsset(slotKey, assetId) {
  const response = await fetch(`${supabaseUrl}/rest/v1/landing_slot_assignments?slot_key=eq.${encodeURIComponent(slotKey)}`, {
    method:'PATCH',
    headers:{ ...headers, 'Content-Type':'application/json', Prefer:'return=minimal' },
    body:JSON.stringify({ draft_asset_id:assetId }),
  });
  if (!response.ok) throw new Error(`Supabase slot ${slotKey}: ${response.status} ${await response.text()}`);
}

async function uploadImageAsset({ basePath, bytes, contentType, format, originalFilename, resourceType = 'image' }) {
  const originalPath = `${basePath}/original.${format}`;
  await uploadObject(originalPath, bytes, contentType);
  const metadata = await sharp(bytes).metadata();
  const variants = {};
  const width = metadata.width;
  for (const targetWidth of [480, 720, 960, 1280, 1600, 1920]) {
    if (!width || targetWidth >= width) continue;
    const variant = await sharp(bytes).resize({ width:targetWidth, withoutEnlargement:true }).webp({ quality:86 }).toBuffer();
    const variantPath = `${basePath}/w-${targetWidth}.webp`;
    await uploadObject(variantPath, variant, 'image/webp');
    variants[String(targetWidth)] = publicUrl(variantPath);
  }
  return {
    public_id:originalPath,
    resource_type:resourceType,
    version:null,
    format,
    width:width || null,
    height:metadata.height || null,
    bytes:bytes.length,
    secure_url:null,
    original_filename:originalFilename,
    provider:'supabase',
    storage_bucket:bucket,
    storage_path:originalPath,
    storage_url:publicUrl(originalPath),
    mime_type:contentType,
    variants,
    poster_variants:{},
  };
}

const response = await fetch(`${supabaseUrl}/rest/v1/media_assets?provider=eq.cloudinary&select=id,public_id,resource_type,format,width,height,duration,bytes,secure_url,original_filename&order=created_at.asc`, { headers });
if (!response.ok) throw new Error(`No se pudo leer media_assets: ${response.status} ${await response.text()}`);
const assets = await response.json();
if (!assets.length) console.log('No hay assets históricos pendientes de migración; se revisarán los fallbacks locales.');

for (const asset of assets) {
  if (!asset.secure_url) {
    console.warn(`${asset.id}: no tiene secure_url; se omite para no inventar una fuente.`);
    continue;
  }
  const source = await fetch(asset.secure_url);
  if (!source.ok) throw new Error(`${asset.id}: no se pudo descargar la fuente (${source.status}).`);
  const bytes = Buffer.from(await source.arrayBuffer());
  const contentType = source.headers.get('content-type')?.split(';')[0] || (asset.resource_type === 'video' ? 'video/mp4' : 'image/jpeg');
  const basePath = `landing/migrated/${asset.id}`;
  const originalPath = `${basePath}/original.${sourceExtension(asset, contentType)}`;
  await uploadObject(originalPath, bytes, contentType);
  const variants = {};
  let width = asset.width;
  let height = asset.height;

  if (asset.resource_type === 'image') {
    const metadata = await sharp(bytes).metadata();
    width ||= metadata.width;
    height ||= metadata.height;
    for (const targetWidth of [480, 720, 960, 1280, 1600, 1920]) {
      if (!width || targetWidth >= width) continue;
      const variant = await sharp(bytes).resize({ width:targetWidth, withoutEnlargement:true }).webp({ quality:86 }).toBuffer();
      const variantPath = `${basePath}/w-${targetWidth}.webp`;
      await uploadObject(variantPath, variant, 'image/webp');
      variants[String(targetWidth)] = publicUrl(variantPath);
    }
  }

  await patchAsset(asset.id, {
    provider:'supabase',
    storage_bucket:bucket,
    storage_path:originalPath,
    storage_url:publicUrl(originalPath),
    mime_type:contentType,
    variants,
    secure_url:null,
    width:width || null,
    height:height || null,
    bytes:bytes.length,
  });
  console.log(`${asset.id} · ${asset.resource_type} -> ${originalPath}`);
}

let bootstrapped = 0;
for (const [slotKey, relativePath] of localFiles) {
  const current = await assignment(slotKey);
  if (current?.draft_asset_id || current?.published_asset_id) continue;
  const bytes = await readFile(relativePath);
  const slot = slotKey.replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '').toLowerCase();
  const originalPath = `landing/bootstrap/${slot}/original.webp`;
  const existingResponse = await fetch(`${supabaseUrl}/rest/v1/media_assets?storage_path=eq.${encodeURIComponent(originalPath)}&select=id&limit=1`, { headers });
  if (!existingResponse.ok) throw new Error(`Supabase bootstrap ${slotKey}: ${existingResponse.status} ${await existingResponse.text()}`);
  const existing = (await existingResponse.json())[0];
  const assetId = existing?.id || await insertAsset(await uploadImageAsset({
    basePath:`landing/bootstrap/${slot}`,
    bytes,
    contentType:'image/webp',
    format:'webp',
    originalFilename:relativePath.split('/').pop(),
  }));
  await setDraftAsset(slotKey, assetId);
  bootstrapped += 1;
  console.log(`${slotKey} · fallback local -> Supabase Storage`);
}

console.log(`Migración terminada: ${assets.length} histórico(s) procesado(s), ${bootstrapped} fallback(s) preparados. No se borra ninguna fuente antigua.`);
