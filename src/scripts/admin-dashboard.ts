import { createExperienceManager } from './admin-experience-manager';

interface AdminConfig { supabaseUrl: string; supabaseKey: string; cloudName: string }
interface Session { access_token: string; refresh_token: string; expires_at?: number; user: { id: string; email?: string } }
type FitMode = 'cover' | 'contain';
type PreviewContext = 'desktop' | 'mobile' | 'modal';
type MediaOrientation = 'landscape' | 'portrait' | 'square';
type FrameShape = 'landscape' | 'portrait' | 'phone' | 'square' | 'band' | 'modal-side';
interface FocalPoint { x?: number; y?: number }
interface Framing extends FocalPoint {
  fit?: FitMode;
  desktop?: FocalPoint;
  mobile?: FocalPoint;
  modal?: FocalPoint;
}
interface NormalizedPoint { x: number; y: number }
interface NormalizedFraming {
  x: number;
  y: number;
  fit: FitMode;
  desktop: NormalizedPoint;
  mobile: NormalizedPoint;
  modal: NormalizedPoint;
}
interface PreviewGeometry {
  ratio: string;
  label: string;
  shape: FrameShape;
}
interface PreviewPlacement {
  width: number;
  height: number;
  left: number;
  top: number;
  overflow: { x: number; y: number };
}
interface ManifestRow {
  slot_key: string; label: string; accepted_types: ('image'|'video')[]; local_fallback: string | null; required: boolean;
  draft_asset_id: string | null; draft_public_id: string | null; draft_resource_type: 'image'|'video'|null;
  draft_secure_url: string | null; draft_alt: Record<string,string>; draft_focal_point: Framing;
  published_asset_id: string | null; published_resource_type: 'image'|'video'|null; published_secure_url: string | null; published_at: string | null;
  published_alt: Record<string,string>; published_focal_point: Framing;
}
interface CloudinaryUpload {
  public_id: string; resource_type: 'image'|'video'; version: number; format?: string;
  width?: number; height?: number; duration?: number; bytes?: number; secure_url?: string; original_filename?: string;
}

type SectionId = 'hero' | 'experiences' | 'essence' | 'closing';

const SECTION_ORDER: SectionId[] = ['hero', 'experiences', 'essence', 'closing'];
const SECTIONS: Record<SectionId, { title: string; kicker: string; description: string }> = {
  hero: {
    title: 'Hero',
    kicker: 'Portada y transición',
    description: 'Recursos principales que reciben al visitante al entrar al sitio.',
  },
  experiences: {
    title: 'Experiencias',
    kicker: 'Catálogo visual',
    description: 'Bloque verde por defecto, fondo fotográfico opcional y portadas de todas las experiencias.',
  },
  essence: {
    title: 'Nuestra esencia',
    kicker: 'Identidad de marca',
    description: 'Imagen que acompaña la historia y los valores de PatagoniK.',
  },
  closing: {
    title: 'Cierre',
    kicker: 'Llamado final',
    description: 'Recurso visual del último llamado a la acción de la landing.',
  },
};

const configNode = document.querySelector<HTMLScriptElement>('#pk-admin-config');
const config = JSON.parse(configNode?.textContent || '{}') as AdminConfig;
const loginView = document.querySelector<HTMLElement>('#login-view')!;
const dashboardView = document.querySelector<HTMLElement>('#dashboard-view')!;
const loginForm = document.querySelector<HTMLFormElement>('#login-form')!;
const loginStatus = document.querySelector<HTMLElement>('#login-status')!;
const dashboardStatus = document.querySelector<HTMLElement>('#dashboard-status')!;
const grid = document.querySelector<HTMLElement>('#asset-grid')!;
const experienceManagerRoot = document.querySelector<HTMLElement>('#experience-manager')!;
const template = document.querySelector<HTMLTemplateElement>('#asset-card-template')!;
const dashboardTitle = document.querySelector<HTMLElement>('#dashboard-title')!;
const draftCount = document.querySelector<HTMLElement>('#draft-count')!;
const draftCountText = draftCount.querySelector<HTMLElement>('span:last-child')!;
const sectionTabsContainer = document.querySelector<HTMLElement>('#section-tabs')!;
const sectionTabs = [...document.querySelectorAll<HTMLButtonElement>('[data-section-tab]')];
const sectionTitle = document.querySelector<HTMLElement>('#section-title')!;
const sectionKicker = document.querySelector<HTMLElement>('#section-kicker')!;
const sectionDescription = document.querySelector<HTMLElement>('#section-description')!;
const sectionVisibleCount = document.querySelector<HTMLElement>('#section-visible-count')!;
const sectionVisibleLabel = document.querySelector<HTMLElement>('.section-total span')!;
const publishButton = document.querySelector<HTMLButtonElement>('#publish-button')!;
const refreshButton = document.querySelector<HTMLButtonElement>('#refresh-button')!;
const logoutButton = document.querySelector<HTMLButtonElement>('#logout-button')!;
const STORAGE_KEY = 'patagonik-admin-session';
const previewResizeCallbacks = new WeakMap<Element, () => void>();
const previewResizeObserver = typeof ResizeObserver === 'undefined'
  ? null
  : new ResizeObserver((entries) => {
      for (const entry of entries) previewResizeCallbacks.get(entry.target)?.();
    });
const PREVIEW_CONTEXT_LABELS: Record<PreviewContext, string> = {
  desktop: 'Card escritorio',
  mobile: 'Card móvil',
  modal: 'Modal',
};
const CROP_THRESHOLD = 2;
let session: Session | null = null;
let activeSection: SectionId = 'hero';
let mediaDraftCount = 0;
let experienceDraftCount = 0;

function message(node: HTMLElement, value = '', kind: 'error'|'success' = 'error') {
  node.textContent = value;
  if (value) node.dataset.kind = kind;
  else delete node.dataset.kind;
}

function setBusy(button: HTMLButtonElement, busy: boolean) {
  button.disabled = busy;
  button.setAttribute('aria-busy', String(busy));
}

function isDirty(row: ManifestRow): boolean {
  return row.draft_asset_id !== row.published_asset_id
    || JSON.stringify(row.draft_alt) !== JSON.stringify(row.published_alt)
    || JSON.stringify(row.draft_focal_point) !== JSON.stringify(row.published_focal_point);
}

function sectionForSlot(slotKey: string): SectionId {
  if (slotKey === 'landing.experiences-background' || slotKey.startsWith('experience.')) return 'experiences';
  if (slotKey === 'about.essence') return 'essence';
  if (slotKey === 'landing.final-cta') return 'closing';
  return 'hero';
}

function isSectionId(value: string | undefined): value is SectionId {
  return SECTION_ORDER.includes(value as SectionId);
}

function setAdminView(view: 'login' | 'dashboard', focusDashboard = false) {
  const showingDashboard = view === 'dashboard';
  loginView.hidden = showingDashboard;
  dashboardView.hidden = !showingDashboard;
  document.body.dataset.adminView = view;
  window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  if (showingDashboard && focusDashboard) {
    window.requestAnimationFrame(() => {
      window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
      dashboardTitle.focus({ preventScroll: true });
    });
  }
}

function activateSection(section: SectionId, focusTab = false) {
  activeSection = section;
  const content = SECTIONS[section];
  sectionTitle.textContent = content.title;
  sectionKicker.textContent = content.kicker;
  sectionDescription.textContent = content.description;
  experienceManagerRoot.hidden = section !== 'experiences';

  for (const tab of sectionTabs) {
    const selected = tab.dataset.sectionTab === section;
    tab.setAttribute('aria-selected', String(selected));
    tab.tabIndex = selected ? 0 : -1;
    if (selected) {
      grid.setAttribute('aria-labelledby', tab.id);
      if (focusTab) tab.focus();
    }
  }

  let visible = 0;
  for (const card of grid.querySelectorAll<HTMLElement>('.asset-card')) {
    const selected = card.dataset.section === section;
    card.hidden = !selected;
    if (selected) visible += 1;
  }
  sectionVisibleCount.textContent = String(visible);
  sectionVisibleLabel.textContent = visible === 1 ? 'recurso' : 'recursos';
}

function renderDraftSummary() {
  const drafts = mediaDraftCount + experienceDraftCount;
  draftCount.dataset.empty = String(drafts === 0);
  draftCountText.textContent = drafts === 0
    ? 'Sin cambios pendientes'
    : `${drafts} ${drafts === 1 ? 'cambio pendiente' : 'cambios pendientes'}`;
}

function updateManifestSummary(rows: ManifestRow[]) {
  const counts = Object.fromEntries(SECTION_ORDER.map((section) => [section, 0])) as Record<SectionId, number>;
  for (const row of rows) counts[sectionForSlot(row.slot_key)] += 1;
  for (const section of SECTION_ORDER) {
    document.querySelector<HTMLElement>(`[data-section-count="${section}"]`)!.textContent = String(counts[section]);
  }

  mediaDraftCount = rows.filter(isDirty).length;
  renderDraftSummary();
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

function clampFocal(value: number | undefined, fallback = .5): number {
  return Math.min(1, Math.max(0, Number(value ?? fallback)));
}

function normalizedPoint(point: FocalPoint | null | undefined, fallback: NormalizedPoint): NormalizedPoint {
  return {
    x:clampFocal(point?.x, fallback.x),
    y:clampFocal(point?.y, fallback.y),
  };
}

function normalizedFraming(point: Framing | null | undefined): NormalizedFraming {
  const legacy = { x:clampFocal(point?.x), y:clampFocal(point?.y) };
  const desktop = normalizedPoint(point?.desktop, legacy);
  return {
    x:desktop.x,
    y:desktop.y,
    fit:point?.fit === 'contain' ? 'contain' : 'cover',
    desktop,
    mobile:normalizedPoint(point?.mobile, desktop),
    modal:normalizedPoint(point?.modal, desktop),
  };
}

function previewContextLabel(row: ManifestRow, context: PreviewContext): string {
  if (row.slot_key.startsWith('experience.')) return PREVIEW_CONTEXT_LABELS[context];
  if (row.slot_key === 'landing.hero') return context === 'mobile' ? 'Hero móvil' : 'Hero escritorio';
  if (row.slot_key === 'landing.experiences-background') return context === 'mobile' ? 'Fondo móvil' : 'Fondo escritorio';
  if (row.slot_key === 'landing.band-valle') return context === 'mobile' ? 'Franja móvil' : 'Franja escritorio';
  if (row.slot_key === 'landing.final-cta') return context === 'mobile' ? 'Cierre móvil' : 'Cierre escritorio';
  if (row.slot_key === 'about.essence') return context === 'mobile' ? 'Esencia móvil' : 'Esencia escritorio';
  return context === 'mobile' ? 'Vista móvil' : 'Vista escritorio';
}

function previewPositionLabel(row: ManifestRow, context: PreviewContext, point: NormalizedPoint): string {
  const position = Math.abs(point.x - .5) < .005 && Math.abs(point.y - .5) < .005
    ? 'Centro'
    : `${Math.round(point.x * 100)}% / ${Math.round(point.y * 100)}%`;
  return `${previewContextLabel(row, context)} · ${position}`;
}

function mediaDimensions(media: HTMLImageElement | HTMLVideoElement): { width: number; height: number } {
  return media instanceof HTMLVideoElement
    ? { width:media.videoWidth || Number(media.getAttribute('width')), height:media.videoHeight || Number(media.getAttribute('height')) }
    : { width:media.naturalWidth || Number(media.getAttribute('width')), height:media.naturalHeight || Number(media.getAttribute('height')) };
}

function calculatePreviewPlacement(
  frame: { width: number; height: number },
  source: { width: number; height: number },
  fit: FitMode,
  point: NormalizedPoint,
): PreviewPlacement | null {
  if (!frame.width || !frame.height || !source.width || !source.height) return null;
  const scale = fit === 'cover'
    ? Math.max(frame.width / source.width, frame.height / source.height)
    : Math.min(frame.width / source.width, frame.height / source.height);
  const width = source.width * scale;
  const height = source.height * scale;
  const overflow = {
    x:Math.max(0, width - frame.width),
    y:Math.max(0, height - frame.height),
  };
  return {
    width,
    height,
    left:fit === 'cover' ? -overflow.x * point.x : (frame.width - width) / 2,
    top:fit === 'cover' ? -overflow.y * point.y : (frame.height - height) / 2,
    overflow,
  };
}

function previewPlacement(container: HTMLElement, fit: FitMode, point: NormalizedPoint): PreviewPlacement | null {
  const media = container.querySelector<HTMLImageElement | HTMLVideoElement>('img, video');
  if (!media) return null;
  return calculatePreviewPlacement(
    { width:container.clientWidth, height:container.clientHeight },
    mediaDimensions(media),
    fit,
    point,
  );
}

function applyPreviewPresentation(container: HTMLElement, fit: FitMode, point: NormalizedPoint) {
  container.dataset.fit = fit;
  const media = container.querySelector<HTMLImageElement | HTMLVideoElement>('img, video');
  if (!media) return;
  const placement = previewPlacement(container, fit, point);

  media.style.position = 'absolute';
  media.style.maxWidth = 'none';
  media.style.maxHeight = 'none';
  media.style.margin = '0';
  media.style.transform = 'none';

  if (!placement) {
    media.style.inset = '0';
    media.style.width = '100%';
    media.style.height = '100%';
    media.style.setProperty('object-fit', fit, 'important');
    media.style.setProperty('object-position', `${point.x * 100}% ${point.y * 100}%`, 'important');
    return;
  }

  // El bitmap se dimensiona y desplaza de forma explícita. Así sigue al
  // puntero píxel a píxel y el marco representa exactamente el recorte.
  media.style.inset = 'auto';
  media.style.width = `${placement.width}px`;
  media.style.height = `${placement.height}px`;
  media.style.left = `${placement.left}px`;
  media.style.top = `${placement.top}px`;
  media.style.setProperty('object-fit', 'fill', 'important');
  media.style.setProperty('object-position', '50% 50%', 'important');
}

function mediaOrientation(media: HTMLImageElement | HTMLVideoElement | null): MediaOrientation {
  if (!media) return 'landscape';
  const { width, height } = mediaDimensions(media);
  if (!width || !height) return 'landscape';
  const ratio = width / height;
  return ratio > 1.08 ? 'landscape' : ratio < .92 ? 'portrait' : 'square';
}

function updatePreviewOrientation(container: HTMLElement, media: HTMLImageElement | HTMLVideoElement) {
  const previewFrame = container.closest<HTMLElement>('.asset-card__preview');
  if (!previewFrame) return;
  const apply = () => {
    const { width, height } = mediaDimensions(media);
    if (!width || !height) return;
    previewFrame.dataset.mediaOrientation = mediaOrientation(media);
    container.dispatchEvent(new CustomEvent('preview-media-ready'));
  };
  apply();
  if (media instanceof HTMLVideoElement) media.addEventListener('loadedmetadata', apply, { once:true });
  else media.addEventListener('load', apply, { once:true });
}

function desktopViewportRatio(): number {
  if (window.innerWidth >= 860 && window.innerHeight > 0) return window.innerWidth / window.innerHeight;
  return 16 / 10;
}

// Estos ratios siguen la caja real del img/video en el landing. En recursos
// con parallax incluyen el sobrebarrido (inset negativo), no sólo el bloque
// visible, porque ésa es la caja contra la que object-fit calcula el recorte.
function previewGeometry(row: ManifestRow, context: PreviewContext, orientation: MediaOrientation): PreviewGeometry {
  if (row.slot_key.startsWith('experience.')) {
    if (context === 'desktop') return { ratio:'169 / 107', label:'Card escritorio · formato actual', shape:'landscape' };
    if (context === 'mobile') return { ratio:'4 / 3', label:'Card móvil · 4:3 actual', shape:'landscape' };
    if (orientation === 'portrait') return { ratio:'2 / 5', label:'Modal escritorio · columna lateral', shape:'modal-side' };
    if (orientation === 'square') return { ratio:'1 / 1', label:'Modal · imagen final 1:1', shape:'square' };
    return { ratio:'4 / 3', label:'Modal · imagen final 4:3', shape:'landscape' };
  }

  if (row.slot_key === 'landing.hero') {
    return context === 'mobile'
      ? { ratio:'390 / 844', label:'Primera pantalla completa · móvil', shape:'phone' }
      : { ratio:`${desktopViewportRatio()} / 1`, label:'Primera pantalla completa · escritorio', shape:'landscape' };
  }

  if (row.slot_key === 'landing.experiences-background') {
    return context === 'mobile'
      ? { ratio:'390 / 844', label:'Fondo de experiencias · pantalla móvil', shape:'phone' }
      : { ratio:`${desktopViewportRatio()} / 1`, label:'Fondo de experiencias · pantalla escritorio', shape:'landscape' };
  }

  if (row.slot_key === 'landing.band-valle') {
    return context === 'mobile'
      ? { ratio:'2.58 / 1', label:'Franja móvil · formato actual', shape:'band' }
      : { ratio:'3.7 / 1', label:'Franja escritorio · formato actual', shape:'band' };
  }

  if (row.slot_key === 'landing.final-cta') {
    const ratio = context === 'mobile'
      ? (390 / 844) / (.92 * 1.24)
      : desktopViewportRatio() / (.92 * 1.24);
    return context === 'mobile'
      ? { ratio:`${ratio} / 1`, label:'Cierre móvil · pantalla con parallax', shape:'phone' }
      : { ratio:`${ratio} / 1`, label:'Cierre escritorio · pantalla con parallax', shape:'landscape' };
  }

  if (row.slot_key === 'about.essence') {
    return { ratio:'1.19 / 1', label:`${context === 'mobile' ? 'Móvil' : 'Escritorio'} · lienzo parallax actual`, shape:'landscape' };
  }

  return context === 'mobile'
    ? { ratio:'4 / 3', label:'Móvil · bloque 4:3', shape:'landscape' }
    : { ratio:'16 / 9', label:'Escritorio · bloque 16:9', shape:'landscape' };
}

function renderPreviewMedia(
  container: HTMLElement,
  resourceType: 'image'|'video',
  url: string,
  fit: FitMode,
  point: NormalizedPoint,
) {
  delete container.dataset.greenBackground;
  container.replaceChildren();
  if (resourceType === 'video') {
    const video = document.createElement('video');
    video.src = url;
    video.muted = true;
    video.controls = true;
    video.playsInline = true;
    video.preload = 'metadata';
    container.append(video);
    updatePreviewOrientation(container, video);
  } else {
    const image = document.createElement('img');
    image.src = url;
    image.alt = '';
    image.loading = 'lazy';
    container.append(image);
    updatePreviewOrientation(container, image);
  }
  applyPreviewPresentation(container, fit, point);
}

function preview(row: ManifestRow, container: HTMLElement, framing: NormalizedFraming) {
  if (row.slot_key === 'landing.experiences-background' && row.draft_alt?._backgroundMode !== 'photo') {
    container.dataset.greenBackground = 'true';
    container.textContent = 'Bloque verde';
    return;
  }
  const resourceType = row.draft_resource_type || row.published_resource_type || row.accepted_types[0] || 'image';
  const derived = row.draft_public_id && config.cloudName
    ? `https://res.cloudinary.com/${encodeURIComponent(config.cloudName)}/${resourceType}/upload/w_720,c_limit/f_auto/q_auto/${row.draft_public_id.split('/').map(encodeURIComponent).join('/')}`
    : null;
  const url = row.draft_secure_url || derived || row.published_secure_url || row.local_fallback;
  if (!url) { container.textContent = 'Sin recurso asignado'; return; }
  renderPreviewMedia(container, resourceType, url, framing.fit, framing.desktop);
}

function previewOverflow(container: HTMLElement, fit: FitMode, point: NormalizedPoint): { x: number; y: number } {
  return previewPlacement(container, fit, point)?.overflow ?? { x:0, y:0 };
}

function previewKind(row: ManifestRow): string {
  if (row.slot_key.startsWith('experience.')) return 'experience';
  if (row.slot_key === 'landing.hero') return 'hero';
  if (row.slot_key === 'landing.experiences-background') return 'experience-background';
  if (row.slot_key === 'about.essence') return 'essence';
  if (row.slot_key === 'landing.band-valle') return 'band';
  if (row.slot_key === 'landing.final-cta') return 'final-cta';
  return 'wide';
}

function renderCard(row: ManifestRow): HTMLElement {
  const card = template.content.firstElementChild!.cloneNode(true) as HTMLElement;
  const form = card.querySelector<HTMLFormElement>('[data-asset-form]')!;
  const fileInput = card.querySelector<HTMLInputElement>('[data-file]')!;
  const publicIdInput = card.querySelector<HTMLInputElement>('[data-public-id]')!;
  const typeInput = card.querySelector<HTMLSelectElement>('[data-resource-type]')!;
  const cardStatus = card.querySelector<HTMLElement>('[data-card-status]')!;
  const stateBadge = card.querySelector<HTMLElement>('[data-state]')!;
  const resourceLabel = card.querySelector<HTMLElement>('[data-resource-label]')!;
  const submit = form.querySelector<HTMLButtonElement>('button[type="submit"]')!;
  const clearResource = form.querySelector<HTMLButtonElement>('[data-clear-resource]')!;
  const previewFrame = card.querySelector<HTMLElement>('.asset-card__preview')!;
  const previewMedia = card.querySelector<HTMLElement>('[data-preview-media]')!;
  const fitInput = card.querySelector<HTMLInputElement>('[data-fit]')!;
  const focalXInput = card.querySelector<HTMLInputElement>('[data-focal="x"]')!;
  const focalYInput = card.querySelector<HTMLInputElement>('[data-focal="y"]')!;
  const focalLabel = card.querySelector<HTMLOutputElement>('[data-focal-label]')!;
  const resetFocal = card.querySelector<HTMLButtonElement>('[data-reset-focal]')!;
  const frameLabel = card.querySelector<HTMLElement>('[data-frame-label]')!;
  const dragHintText = card.querySelector<HTMLElement>('[data-drag-hint-text]')!;
  const contextButtons = [...card.querySelectorAll<HTMLButtonElement>('[data-preview-context]')];
  const resourceType = row.draft_resource_type || row.published_resource_type || row.accepted_types[0] || 'image';
  const framing = normalizedFraming(row.draft_focal_point ?? row.published_focal_point);
  const isExperience = row.slot_key.startsWith('experience.');
  const dirty = isDirty(row);
  let activeContext: PreviewContext = 'desktop';

  card.dataset.section = sectionForSlot(row.slot_key);
  card.dataset.slotKey = row.slot_key;
  card.dataset.dirty = String(dirty);
  card.querySelector<HTMLElement>('[data-slot-key]')!.textContent = row.slot_key;
  card.querySelector<HTMLElement>('[data-label]')!.textContent = row.label;
  stateBadge.textContent = dirty ? 'Borrador' : row.published_at ? 'Publicado' : 'Local';
  stateBadge.dataset.state = dirty ? 'draft' : row.published_at ? 'published' : 'local';
  resourceLabel.textContent = resourceType === 'video' ? 'Video' : 'Imagen';
  previewFrame.dataset.previewContext = activeContext;
  previewFrame.dataset.previewKind = previewKind(row);
  const desktopContextButton = contextButtons.find((button) => button.dataset.previewContext === 'desktop')!;
  const mobileContextButton = contextButtons.find((button) => button.dataset.previewContext === 'mobile')!;
  const modalContextButton = contextButtons.find((button) => button.dataset.previewContext === 'modal')!;
  if (isExperience) modalContextButton.hidden = false;
  else {
    desktopContextButton.textContent = 'Escritorio';
    mobileContextButton.textContent = 'Móvil';
  }
  publicIdInput.value = row.draft_public_id || '';
  typeInput.value = resourceType;
  fileInput.accept = row.accepted_types.includes('video') ? 'image/*,video/mp4,video/webm' : 'image/*';
  clearResource.hidden = row.slot_key !== 'landing.experiences-background';
  [...typeInput.options].forEach((option) => { option.disabled = !row.accepted_types.includes(option.value as 'image'|'video'); });
  for (const locale of ['es','en','pt']) card.querySelector<HTMLInputElement>(`[data-alt="${locale}"]`)!.value = row.draft_alt?.[locale] || '';
  fitInput.value = framing.fit;
  focalXInput.value = String(framing.x);
  focalYInput.value = String(framing.y);

  const activePoint = () => framing[activeContext];

  const applyFrameGeometry = () => {
    const orientation = mediaOrientation(previewMedia.querySelector<HTMLImageElement | HTMLVideoElement>('img, video'));
    previewFrame.dataset.mediaOrientation = orientation;
    const geometry = previewGeometry(row, activeContext, orientation);
    previewFrame.style.setProperty('--preview-aspect-ratio', geometry.ratio);
    previewFrame.dataset.frameShape = geometry.shape;
    frameLabel.textContent = geometry.label;
  };

  const updateDragAvailability = () => {
    const media = previewMedia.querySelector<HTMLImageElement | HTMLVideoElement>('img, video');
    const hasMedia = Boolean(media);
    const dimensions = media ? mediaDimensions(media) : { width:0, height:0 };
    const mediaReady = dimensions.width > 0 && dimensions.height > 0;
    const overflow = previewOverflow(previewMedia, fitInput.value as FitMode, activePoint());
    const canMoveX = overflow.x >= CROP_THRESHOLD;
    const canMoveY = overflow.y >= CROP_THRESHOLD;
    const hasCrop = mediaReady && (canMoveX || canMoveY);
    const enabled = fitInput.value === 'cover' && hasMedia && hasCrop && previewMedia.dataset.greenBackground !== 'true';
    previewFrame.dataset.dragEnabled = String(enabled);
    previewFrame.dataset.dragAxis = canMoveX && canMoveY ? 'both' : canMoveX ? 'x' : canMoveY ? 'y' : 'none';
    previewMedia.tabIndex = enabled ? 0 : -1;
    resetFocal.disabled = !enabled;
    let instruction = 'La proporción de la foto ya coincide con este marco; no hay una zona recortada para mover.';
    let hint = 'La foto ya coincide con este marco';
    if (!hasMedia) {
      instruction = 'No hay una foto disponible para encuadrar.';
      hint = 'Sin foto para encuadrar';
    } else if (!mediaReady) {
      instruction = 'Preparando la vista previa del encuadre.';
      hint = 'Preparando vista previa…';
    } else if (fitInput.value === 'contain') {
      instruction = 'Ver completo está activo: la foto no se recorta.';
      hint = 'Ver completo · sin recorte';
    } else if (hasCrop) {
      const direction = canMoveX && canMoveY ? 'en cualquier dirección' : canMoveX ? 'hacia los lados' : 'arriba o abajo';
      instruction = `Encuadre ${previewContextLabel(row, activeContext)}. Mantén presionado y arrastra ${direction}, o usa las flechas del teclado.`;
      hint = `Arrastra ${direction}`;
    }
    dragHintText.textContent = hint;
    previewMedia.setAttribute('aria-label', instruction);
  };

  const updateFitControls = (fit: FitMode) => {
    framing.fit = fit;
    fitInput.value = fit;
    for (const button of card.querySelectorAll<HTMLButtonElement>('[data-fit-option]')) {
      button.setAttribute('aria-pressed', String(button.dataset.fitOption === fit));
    }
    applyPreviewPresentation(previewMedia, fit, activePoint());
    updateDragAvailability();
  };

  const updateFocalControls = (x: number, y: number, context = activeContext) => {
    const point = { x:clampFocal(x), y:clampFocal(y) };
    framing[context] = point;
    if (context === 'desktop') {
      framing.x = point.x;
      framing.y = point.y;
    }
    if (context !== activeContext) return;
    focalXInput.value = String(point.x);
    focalYInput.value = String(point.y);
    focalLabel.value = previewPositionLabel(row, context, point);
    applyPreviewPresentation(previewMedia, framing.fit, point);
  };

  const selectPreviewContext = (context: PreviewContext) => {
    activeContext = context;
    previewFrame.dataset.previewContext = context;
    for (const button of contextButtons) {
      button.setAttribute('aria-pressed', String(button.dataset.previewContext === context));
    }
    const point = activePoint();
    applyFrameGeometry();
    focalXInput.value = String(point.x);
    focalYInput.value = String(point.y);
    focalLabel.value = previewPositionLabel(row, context, point);
    applyPreviewPresentation(previewMedia, framing.fit, point);
    updateDragAvailability();
  };

  previewMedia.addEventListener('preview-media-ready', () => {
    applyFrameGeometry();
    applyPreviewPresentation(previewMedia, framing.fit, activePoint());
    updateDragAvailability();
  });
  previewResizeCallbacks.set(previewMedia, () => {
    applyFrameGeometry();
    applyPreviewPresentation(previewMedia, framing.fit, activePoint());
    updateDragAvailability();
  });
  previewResizeObserver?.observe(previewMedia);
  preview(row, previewMedia, framing);
  applyFrameGeometry();
  updateFitControls(framing.fit);
  selectPreviewContext('desktop');

  for (const button of contextButtons) {
    button.addEventListener('click', () => {
      const context = button.dataset.previewContext;
      if (context === 'desktop' || context === 'mobile' || (context === 'modal' && isExperience)) selectPreviewContext(context);
    });
  }

  for (const button of card.querySelectorAll<HTMLButtonElement>('[data-fit-option]')) {
    button.addEventListener('click', () => updateFitControls(button.dataset.fitOption === 'contain' ? 'contain' : 'cover'));
  }

  resetFocal.addEventListener('click', () => {
    updateFocalControls(.5, .5);
    message(cardStatus, 'Encuadre centrado. Guarda el borrador para conservarlo.', 'success');
  });

  let drag: {
    pointerId: number;
    startX: number;
    startY: number;
    point: NormalizedPoint;
    overflow: { x: number; y: number };
  } | null = null;

  previewMedia.addEventListener('pointerdown', (event) => {
    if (previewFrame.dataset.dragEnabled !== 'true' || event.button !== 0) return;
    const overflow = previewOverflow(previewMedia, framing.fit, activePoint());
    if (overflow.x < CROP_THRESHOLD && overflow.y < CROP_THRESHOLD) {
      updateDragAvailability();
      return;
    }
    event.preventDefault();
    drag = {
      pointerId:event.pointerId,
      startX:event.clientX,
      startY:event.clientY,
      point:{ ...activePoint() },
      overflow,
    };
    previewMedia.setPointerCapture(event.pointerId);
    previewFrame.dataset.dragging = 'true';
    dragHintText.textContent = `Moviendo · ${Math.round(drag.point.x * 100)}% / ${Math.round(drag.point.y * 100)}%`;
  });

  previewMedia.addEventListener('pointermove', (event) => {
    if (!drag || drag.pointerId !== event.pointerId) return;
    const nextX = drag.overflow.x >= CROP_THRESHOLD
      ? drag.point.x - (event.clientX - drag.startX) / drag.overflow.x
      : drag.point.x;
    const nextY = drag.overflow.y >= CROP_THRESHOLD
      ? drag.point.y - (event.clientY - drag.startY) / drag.overflow.y
      : drag.point.y;
    updateFocalControls(nextX, nextY);
    const point = activePoint();
    dragHintText.textContent = `Moviendo · ${Math.round(point.x * 100)}% / ${Math.round(point.y * 100)}%`;
  });

  const stopDragging = (event: PointerEvent) => {
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (previewMedia.hasPointerCapture(event.pointerId)) previewMedia.releasePointerCapture(event.pointerId);
    drag = null;
    delete previewFrame.dataset.dragging;
    updateDragAvailability();
    message(cardStatus, 'Encuadre actualizado. Guarda el borrador para conservarlo.', 'success');
  };
  previewMedia.addEventListener('pointerup', stopDragging);
  previewMedia.addEventListener('pointercancel', stopDragging);
  previewMedia.addEventListener('lostpointercapture', stopDragging);

  previewMedia.addEventListener('keydown', (event) => {
    if (previewFrame.dataset.dragEnabled !== 'true' || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
    event.preventDefault();
    const point = activePoint();
    const step = event.shiftKey ? .1 : .025;
    updateFocalControls(
      point.x + (event.key === 'ArrowRight' ? step : event.key === 'ArrowLeft' ? -step : 0),
      point.y + (event.key === 'ArrowDown' ? step : event.key === 'ArrowUp' ? -step : 0),
    );
    const updatedPoint = activePoint();
    dragHintText.textContent = `Posición · ${Math.round(updatedPoint.x * 100)}% / ${Math.round(updatedPoint.y * 100)}%`;
  });

  typeInput.addEventListener('change', () => {
    resourceLabel.textContent = typeInput.value === 'video' ? 'Video' : 'Imagen';
  });
  fileInput.addEventListener('change', () => {
    const selected = fileInput.files?.[0];
    if (!selected) return;
    typeInput.value = selected.type.startsWith('video/') ? 'video' : 'image';
    resourceLabel.textContent = typeInput.value === 'video' ? 'Video' : 'Imagen';
    renderPreviewMedia(
      previewMedia,
      typeInput.value as 'image'|'video',
      URL.createObjectURL(selected),
      framing.fit,
      activePoint(),
    );
    updateDragAvailability();
  });

  clearResource.addEventListener('click', async () => {
    message(cardStatus, 'Preparando bloque verde…', 'success');
    setBusy(clearResource, true);
    try {
      const response = await supabase(`/rest/v1/landing_slot_assignments?slot_key=eq.${encodeURIComponent(row.slot_key)}`, {
        method:'PATCH', headers:{ 'Content-Type':'application/json', Prefer:'return=minimal' },
        body:JSON.stringify({
          draft_asset_id:null,
          draft_alt:{ ...row.draft_alt, _backgroundMode:'green' },
          updated_by:session!.user.id,
          updated_at:new Date().toISOString(),
        }),
      });
      if (!response.ok) throw new Error(await parseError(response));
      message(cardStatus, 'Bloque verde guardado como borrador.', 'success');
      window.setTimeout(() => loadManifest().catch((error) => message(dashboardStatus, error.message)), 500);
    } catch (error) { message(cardStatus, error instanceof Error ? error.message : 'No se pudo cambiar el fondo.'); }
    finally { setBusy(clearResource, false); }
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault(); message(cardStatus, 'Guardando…', 'success');
    setBusy(submit, true);
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
      if (row.slot_key === 'landing.experiences-background' && (selected || publicIdInput.value.trim())) {
        alt._backgroundMode = 'photo';
      }
      const focal = {
        x:framing.desktop.x,
        y:framing.desktop.y,
        fit:framing.fit,
        desktop:{ ...framing.desktop },
        mobile:{ ...framing.mobile },
        ...(isExperience ? { modal:{ ...framing.modal } } : {}),
      };
      const response = await supabase(`/rest/v1/landing_slot_assignments?slot_key=eq.${encodeURIComponent(row.slot_key)}`, {
        method:'PATCH', headers:{ 'Content-Type':'application/json', Prefer:'return=minimal' },
        body:JSON.stringify({ draft_asset_id:assetId, draft_alt:alt, draft_focal_point:focal, updated_by:session!.user.id, updated_at:new Date().toISOString() }),
      });
      if (!response.ok) throw new Error(await parseError(response));
      message(cardStatus, 'Borrador guardado.', 'success');
      window.setTimeout(() => loadManifest().catch((error) => message(dashboardStatus, error.message)), 500);
    } catch (error) { message(cardStatus, error instanceof Error ? error.message : 'No se pudo guardar.'); }
    finally { setBusy(submit, false); }
  });
  window.requestAnimationFrame(() => {
    applyFrameGeometry();
    applyPreviewPresentation(previewMedia, framing.fit, activePoint());
    updateDragAvailability();
  });
  return card;
}

async function loadManifest(): Promise<void> {
  message(dashboardStatus, 'Cargando recursos…', 'success');
  const response = await supabase('/rest/v1/landing_admin_manifest?select=*&order=sort_order.asc');
  if (!response.ok) throw new Error(await parseError(response));
  const rows = await response.json() as ManifestRow[];
  for (const existing of grid.querySelectorAll('[data-preview-media]')) previewResizeObserver?.unobserve(existing);
  grid.replaceChildren(...rows.map(renderCard));
  updateManifestSummary(rows);
  activateSection(activeSection);
  message(dashboardStatus, `${rows.length} recursos sincronizados.`, 'success');
}

const experienceManager = createExperienceManager({
  getAccessToken: async () => (await ensureSession()).access_token,
  onDraftCount: (count) => {
    experienceDraftCount = count;
    renderDraftSummary();
  },
  onCatalogChanged: async (focusCoverSlug) => {
    await loadManifest();
    if (!focusCoverSlug) return;
    activateSection('experiences');
    const cover = grid.querySelector<HTMLElement>(`[data-slot-key="experience.${focusCoverSlug}.cover"]`);
    window.setTimeout(() => cover?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80);
  },
});

async function loadDashboardData(): Promise<void> {
  const results = await Promise.allSettled([loadManifest(), experienceManager.load()]);
  const failure = results.find((result): result is PromiseRejectedResult => result.status === 'rejected');
  if (failure) throw failure.reason;
}

async function verifyAdmin(): Promise<void> {
  const active = await ensureSession();
  const response = await supabase(`/rest/v1/profiles?user_id=eq.${encodeURIComponent(active.user.id)}&select=role&limit=1`);
  if (!response.ok) throw new Error(await parseError(response));
  const rows = await response.json() as {role:string}[];
  if (rows[0]?.role !== 'admin') throw new Error('Esta cuenta no tiene rol de administrador.');
}

async function showDashboard(focusDashboard = false): Promise<void> {
  message(loginStatus, 'Comprobando acceso…', 'success');
  await verifyAdmin();
  message(loginStatus);
  loginForm.reset();
  setAdminView('dashboard', focusDashboard);
  try { await loadDashboardData(); }
  catch (error) { message(dashboardStatus, error instanceof Error ? error.message : 'No se pudo cargar el panel.'); }
}

loginForm.addEventListener('submit', async (event) => {
  event.preventDefault(); message(loginStatus, 'Ingresando…', 'success');
  const submit = loginForm.querySelector<HTMLButtonElement>('button')!;
  setBusy(submit, true);
  try {
    if (!config.supabaseUrl || !config.supabaseKey) throw new Error('Falta configurar Supabase en el despliegue.');
    const body = Object.fromEntries(new FormData(loginForm));
    const response = await fetch(`${config.supabaseUrl}/auth/v1/token?grant_type=password`, {
      method:'POST', headers:{ apikey:config.supabaseKey, 'Content-Type':'application/json' }, body:JSON.stringify(body),
    });
    if (!response.ok) throw new Error(await parseError(response));
    session = await response.json() as Session; localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
    await showDashboard(true);
  } catch (error) { message(loginStatus, error instanceof Error ? error.message : 'No se pudo iniciar sesión.'); }
  finally { setBusy(submit, false); }
});

for (const tab of sectionTabs) {
  tab.addEventListener('click', () => {
    if (isSectionId(tab.dataset.sectionTab)) activateSection(tab.dataset.sectionTab);
  });
}

sectionTabsContainer.addEventListener('keydown', (event) => {
  if (!(event instanceof KeyboardEvent) || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
  const currentIndex = sectionTabs.indexOf(document.activeElement as HTMLButtonElement);
  if (currentIndex < 0) return;
  event.preventDefault();
  let nextIndex = currentIndex;
  if (event.key === 'Home') nextIndex = 0;
  else if (event.key === 'End') nextIndex = sectionTabs.length - 1;
  else if (event.key === 'ArrowRight') nextIndex = (currentIndex + 1) % sectionTabs.length;
  else nextIndex = (currentIndex - 1 + sectionTabs.length) % sectionTabs.length;
  const nextSection = sectionTabs[nextIndex]?.dataset.sectionTab;
  if (isSectionId(nextSection)) activateSection(nextSection, true);
});

refreshButton.addEventListener('click', async () => {
  setBusy(refreshButton, true);
  try { await loadDashboardData(); }
  catch (error) { message(dashboardStatus, error instanceof Error ? error.message : 'No se pudieron actualizar los recursos.'); }
  finally { setBusy(refreshButton, false); }
});

logoutButton.addEventListener('click', () => {
  localStorage.removeItem(STORAGE_KEY);
  session = null;
  grid.replaceChildren();
  experienceManager.reset();
  mediaDraftCount = 0;
  experienceDraftCount = 0;
  updateManifestSummary([]);
  activateSection('hero');
  message(dashboardStatus);
  message(loginStatus, 'Sesión cerrada.', 'success');
  setAdminView('login');
  window.requestAnimationFrame(() => loginForm.querySelector<HTMLInputElement>('input[name="email"]')?.focus());
});

publishButton.addEventListener('click', async () => {
  if (!window.confirm('¿Publicar todos los borradores y desplegar la landing?')) return;
  setBusy(publishButton, true); message(dashboardStatus, 'Publicando y solicitando despliegue…', 'success');
  try {
    const active = await ensureSession();
    const response = await fetch('/api/admin/publish', { method:'POST', headers:{ Authorization:`Bearer ${active.access_token}` } });
    if (!response.ok) throw new Error(await parseError(response));
    const body = await response.json() as {message:string};
    await loadDashboardData();
    message(dashboardStatus, `${body.message} Los cambios aparecerán al terminar el build.`, 'success');
  } catch (error) { message(dashboardStatus, error instanceof Error ? error.message : 'No se pudo publicar.'); }
  finally { setBusy(publishButton, false); }
});

try { session = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null') as Session|null; } catch { session = null; }
if (session && config.supabaseUrl && config.supabaseKey) {
  showDashboard().catch((error) => {
    setAdminView('login');
    message(loginStatus, error instanceof Error ? error.message : 'La sesión ya no es válida.');
  });
}
