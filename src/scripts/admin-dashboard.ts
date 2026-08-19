interface AdminConfig { supabaseUrl: string; supabaseKey: string; cloudName: string }
interface Session { access_token: string; refresh_token: string; expires_at?: number; user: { id: string; email?: string } }
interface ManifestRow {
  slot_key: string; label: string; accepted_types: ('image'|'video')[]; local_fallback: string | null; required: boolean;
  draft_asset_id: string | null; draft_public_id: string | null; draft_resource_type: 'image'|'video'|null;
  draft_secure_url: string | null; draft_alt: Record<string,string>; draft_focal_point: {x?:number;y?:number};
  published_asset_id: string | null; published_secure_url: string | null; published_at: string | null;
  published_alt: Record<string,string>; published_focal_point: {x?:number;y?:number};
}
interface CloudinaryUpload {
  public_id: string; resource_type: 'image'|'video'; version: number; format?: string;
  width?: number; height?: number; duration?: number; bytes?: number; secure_url?: string; original_filename?: string;
}

const configNode = document.querySelector<HTMLScriptElement>('#pk-admin-config');
const config = JSON.parse(configNode?.textContent || '{}') as AdminConfig;
const loginView = document.querySelector<HTMLElement>('#login-view')!;
const dashboardView = document.querySelector<HTMLElement>('#dashboard-view')!;
const loginForm = document.querySelector<HTMLFormElement>('#login-form')!;
const loginStatus = document.querySelector<HTMLElement>('#login-status')!;
const dashboardStatus = document.querySelector<HTMLElement>('#dashboard-status')!;
const grid = document.querySelector<HTMLElement>('#asset-grid')!;
const template = document.querySelector<HTMLTemplateElement>('#asset-card-template')!;
const publishButton = document.querySelector<HTMLButtonElement>('#publish-button')!;
const refreshButton = document.querySelector<HTMLButtonElement>('#refresh-button')!;
const logoutButton = document.querySelector<HTMLButtonElement>('#logout-button')!;
const STORAGE_KEY = 'patagonik-admin-session';
let session: Session | null = null;

function message(node: HTMLElement, value = '', kind: 'error'|'success' = 'error') {
  node.textContent = value;
  node.dataset.kind = kind;
}

async function parseError(response: Response): Promise<string> {
  const body = await response.json().catch(() => null) as { error?: string; message?: string } | null;
  return body?.error || body?.message || `Error ${response.status}`;
}

async function refreshSession(): Promise<void> {
  if (!session?.refresh_token) throw new Error('Sesión expirada.');
  const response = await fetch(`${config.supabaseUrl}/auth/v1/token?grant_type=refresh_token`, {
    method:'POST', headers:{ apikey:config.supabaseKey, 'Content-Type':'application/json' },
    body:JSON.stringify({ refresh_token:session.refresh_token }),
  });
  if (!response.ok) throw new Error(await parseError(response));
  session = await response.json() as Session;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
}

async function ensureSession(): Promise<Session> {
  if (!session) throw new Error('Debes iniciar sesión.');
  if (session.expires_at && session.expires_at * 1000 < Date.now() + 60_000) await refreshSession();
  return session!;
}

async function supabase(path: string, init: RequestInit = {}): Promise<Response> {
  const active = await ensureSession();
  const headers = new Headers(init.headers);
  headers.set('apikey', config.supabaseKey);
  headers.set('Authorization', `Bearer ${active.access_token}`);
  headers.set('Accept', 'application/json');
  return fetch(`${config.supabaseUrl}${path}`, { ...init, headers });
}

function cloudinaryValue(value: string, chosenType: 'image'|'video'): CloudinaryUpload {
  const trimmed = value.trim();
  if (!trimmed) throw new Error('Pega una URL/public ID o elige un archivo.');
  try {
    const url = new URL(trimmed);
    const match = url.pathname.match(/\/(image|video)\/upload\/(?:[^/]+\/)*?v(\d+)\/(.+)$/);
    if (!match?.[3]) throw new Error('La URL Cloudinary debe incluir su versión (/v123/).');
    const decoded = decodeURIComponent(match[3]);
    const format = decoded.match(/\.([a-z0-9]+)$/i)?.[1];
    return {
      public_id: decoded.replace(/\.[a-z0-9]+$/i, ''),
      resource_type: match[1] as 'image'|'video',
      version: Number(match[2]),
      format,
      secure_url: trimmed,
    };
  } catch (error) {
    if (/^https?:/i.test(trimmed)) throw error;
    return { public_id:trimmed.replace(/^\/+|\.[a-z0-9]+$/gi, ''), resource_type:chosenType, version:0 };
  }
}

async function signedUpload(file: File, resourceType: 'image'|'video'): Promise<CloudinaryUpload> {
  if (file.size > 60 * 1024 * 1024) throw new Error('El archivo supera el límite editorial de 60 MB.');
  const active = await ensureSession();
  const signResponse = await fetch('/api/admin/cloudinary-sign', {
    method:'POST', headers:{ Authorization:`Bearer ${active.access_token}`, 'Content-Type':'application/json' },
    body:JSON.stringify({ resourceType }),
  });
  if (!signResponse.ok) throw new Error(await parseError(signResponse));
  const signed = await signResponse.json() as {
    signature:string; timestamp:number; folder:string; apiKey:string; cloudName:string;
    overwrite:boolean; uniqueFilename:boolean; useFilename:boolean;
  };
  const form = new FormData();
  form.set('file', file); form.set('api_key', signed.apiKey); form.set('timestamp', String(signed.timestamp));
  form.set('signature', signed.signature); form.set('folder', signed.folder); form.set('overwrite', String(signed.overwrite));
  form.set('unique_filename', String(signed.uniqueFilename)); form.set('use_filename', String(signed.useFilename));
  const uploadResponse = await fetch(`https://api.cloudinary.com/v1_1/${encodeURIComponent(signed.cloudName)}/${resourceType}/upload`, { method:'POST', body:form });
  if (!uploadResponse.ok) throw new Error(await parseError(uploadResponse));
  return uploadResponse.json() as Promise<CloudinaryUpload>;
}

async function insertAsset(asset: CloudinaryUpload): Promise<string> {
  const existingResponse = await supabase(
    `/rest/v1/media_assets?resource_type=eq.${asset.resource_type}&public_id=eq.${encodeURIComponent(asset.public_id)}&version=eq.${asset.version}&select=id&limit=1`,
  );
  if (!existingResponse.ok) throw new Error(await parseError(existingResponse));
  const existing = await existingResponse.json() as {id:string}[];
  if (existing[0]?.id) return existing[0].id;

  const response = await supabase('/rest/v1/media_assets', {
    method:'POST', headers:{ 'Content-Type':'application/json', Prefer:'return=representation' },
    body:JSON.stringify({
      public_id:asset.public_id, resource_type:asset.resource_type, version:asset.version || null,
      format:asset.format || null, width:asset.width || null, height:asset.height || null,
      duration:asset.duration || null, bytes:asset.bytes || null, secure_url:asset.secure_url || null,
      original_filename:asset.original_filename || null,
    }),
  });
  if (!response.ok) throw new Error(await parseError(response));
  const rows = await response.json() as {id:string}[];
  if (!rows[0]?.id) throw new Error('Supabase no devolvió el asset creado.');
  return rows[0].id;
}

function preview(row: ManifestRow, container: HTMLElement) {
  const derived = row.draft_public_id && config.cloudName
    ? `https://res.cloudinary.com/${encodeURIComponent(config.cloudName)}/${row.draft_resource_type || 'image'}/upload/w_720,c_limit/f_auto/q_auto/${row.draft_public_id.split('/').map(encodeURIComponent).join('/')}`
    : null;
  const url = row.draft_secure_url || derived || row.published_secure_url || row.local_fallback;
  if (!url) { container.textContent = 'Sin asset'; return; }
  if (row.draft_resource_type === 'video') {
    const video = document.createElement('video'); video.src = url; video.muted = true; video.controls = true; video.preload = 'metadata';
    container.append(video);
  } else {
    const image = document.createElement('img'); image.src = url; image.alt = ''; image.loading = 'lazy';
    container.append(image);
  }
}

function renderCard(row: ManifestRow): HTMLElement {
  const card = template.content.firstElementChild!.cloneNode(true) as HTMLElement;
  const form = card.querySelector<HTMLFormElement>('[data-asset-form]')!;
  const fileInput = card.querySelector<HTMLInputElement>('[data-file]')!;
  const publicIdInput = card.querySelector<HTMLInputElement>('[data-public-id]')!;
  const typeInput = card.querySelector<HTMLSelectElement>('[data-resource-type]')!;
  const cardStatus = card.querySelector<HTMLElement>('[data-card-status]')!;
  card.querySelector<HTMLElement>('[data-slot-key]')!.textContent = row.slot_key;
  card.querySelector<HTMLElement>('[data-label]')!.textContent = row.label;
  const dirty = row.draft_asset_id !== row.published_asset_id
    || JSON.stringify(row.draft_alt) !== JSON.stringify(row.published_alt)
    || JSON.stringify(row.draft_focal_point) !== JSON.stringify(row.published_focal_point);
  card.querySelector<HTMLElement>('[data-state]')!.textContent = dirty ? 'Borrador' : row.published_at ? 'Publicado' : 'Local';
  preview(row, card.querySelector<HTMLElement>('[data-preview]')!);
  publicIdInput.value = row.draft_public_id || '';
  typeInput.value = row.draft_resource_type || row.accepted_types[0] || 'image';
  [...typeInput.options].forEach((option) => { option.disabled = !row.accepted_types.includes(option.value as 'image'|'video'); });
  for (const locale of ['es','en','pt']) card.querySelector<HTMLInputElement>(`[data-alt="${locale}"]`)!.value = row.draft_alt?.[locale] || '';
  for (const axis of ['x','y'] as const) card.querySelector<HTMLInputElement>(`[data-focal="${axis}"]`)!.value = String(row.draft_focal_point?.[axis] ?? .5);

  form.addEventListener('submit', async (event) => {
    event.preventDefault(); message(cardStatus, 'Guardando…', 'success');
    const submit = form.querySelector<HTMLButtonElement>('button[type="submit"]')!; submit.disabled = true;
    try {
      let assetId = row.draft_asset_id;
      const selected = fileInput.files?.[0];
      if (selected) {
        const inferredType: 'image'|'video' = selected.type.startsWith('video/') ? 'video' : 'image';
        if (!row.accepted_types.includes(inferredType)) throw new Error(`Este espacio no acepta ${inferredType === 'video' ? 'videos' : 'imágenes'}.`);
        typeInput.value = inferredType;
        const uploaded = await signedUpload(selected, inferredType);
        assetId = await insertAsset(uploaded);
      } else if (publicIdInput.value.trim() && publicIdInput.value.trim() !== (row.draft_public_id || '')) {
        const parsed = cloudinaryValue(publicIdInput.value, typeInput.value as 'image'|'video');
        if (!row.accepted_types.includes(parsed.resource_type)) throw new Error(`Este espacio no acepta ${parsed.resource_type === 'video' ? 'videos' : 'imágenes'}.`);
        assetId = await insertAsset(parsed);
      }
      const alt = Object.fromEntries(['es','en','pt'].map((locale) => [locale, card.querySelector<HTMLInputElement>(`[data-alt="${locale}"]`)!.value.trim()]));
      const focal = Object.fromEntries(['x','y'].map((axis) => [axis, Number(card.querySelector<HTMLInputElement>(`[data-focal="${axis}"]`)!.value)]));
      const response = await supabase(`/rest/v1/landing_slot_assignments?slot_key=eq.${encodeURIComponent(row.slot_key)}`, {
        method:'PATCH', headers:{ 'Content-Type':'application/json', Prefer:'return=minimal' },
        body:JSON.stringify({ draft_asset_id:assetId, draft_alt:alt, draft_focal_point:focal, updated_by:session!.user.id, updated_at:new Date().toISOString() }),
      });
      if (!response.ok) throw new Error(await parseError(response));
      message(cardStatus, 'Borrador guardado.', 'success');
      window.setTimeout(() => loadManifest().catch((error) => message(dashboardStatus, error.message)), 500);
    } catch (error) { message(cardStatus, error instanceof Error ? error.message : 'No se pudo guardar.'); }
    finally { submit.disabled = false; }
  });
  return card;
}

async function loadManifest(): Promise<void> {
  message(dashboardStatus, 'Cargando assets…', 'success');
  const response = await supabase('/rest/v1/landing_admin_manifest?select=*&order=sort_order.asc');
  if (!response.ok) throw new Error(await parseError(response));
  const rows = await response.json() as ManifestRow[];
  grid.replaceChildren(...rows.map(renderCard));
  message(dashboardStatus, `${rows.length} espacios editoriales cargados.`, 'success');
}

async function verifyAdmin(): Promise<void> {
  const active = await ensureSession();
  const response = await supabase(`/rest/v1/profiles?user_id=eq.${encodeURIComponent(active.user.id)}&select=role&limit=1`);
  if (!response.ok) throw new Error(await parseError(response));
  const rows = await response.json() as {role:string}[];
  if (rows[0]?.role !== 'admin') throw new Error('Esta cuenta no tiene rol de administrador.');
}

async function showDashboard(): Promise<void> {
  loginView.hidden = true; dashboardView.hidden = false;
  try { await verifyAdmin(); await loadManifest(); }
  catch (error) { message(dashboardStatus, error instanceof Error ? error.message : 'No se pudo cargar el panel.'); }
}

loginForm.addEventListener('submit', async (event) => {
  event.preventDefault(); message(loginStatus, 'Ingresando…', 'success');
  const submit = loginForm.querySelector<HTMLButtonElement>('button')!; submit.disabled = true;
  try {
    if (!config.supabaseUrl || !config.supabaseKey) throw new Error('Falta configurar Supabase en el despliegue.');
    const body = Object.fromEntries(new FormData(loginForm));
    const response = await fetch(`${config.supabaseUrl}/auth/v1/token?grant_type=password`, {
      method:'POST', headers:{ apikey:config.supabaseKey, 'Content-Type':'application/json' }, body:JSON.stringify(body),
    });
    if (!response.ok) throw new Error(await parseError(response));
    session = await response.json() as Session; localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
    await showDashboard();
  } catch (error) { message(loginStatus, error instanceof Error ? error.message : 'No se pudo iniciar sesión.'); }
  finally { submit.disabled = false; }
});

refreshButton.addEventListener('click', () => loadManifest().catch((error) => message(dashboardStatus, error.message)));
logoutButton.addEventListener('click', () => { localStorage.removeItem(STORAGE_KEY); session = null; location.reload(); });
publishButton.addEventListener('click', async () => {
  if (!window.confirm('¿Publicar todos los borradores y desplegar la landing?')) return;
  publishButton.disabled = true; message(dashboardStatus, 'Publicando y solicitando despliegue…', 'success');
  try {
    const active = await ensureSession();
    const response = await fetch('/api/admin/publish', { method:'POST', headers:{ Authorization:`Bearer ${active.access_token}` } });
    if (!response.ok) throw new Error(await parseError(response));
    const body = await response.json() as {message:string};
    await loadManifest();
    message(dashboardStatus, `${body.message} Los cambios aparecerán al terminar el build.`, 'success');
  } catch (error) { message(dashboardStatus, error instanceof Error ? error.message : 'No se pudo publicar.'); }
  finally { publishButton.disabled = false; }
});

try { session = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null') as Session|null; } catch { session = null; }
if (session && config.supabaseUrl && config.supabaseKey) showDashboard();
