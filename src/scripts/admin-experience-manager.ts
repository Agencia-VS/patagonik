type Locale = 'es' | 'en' | 'pt';
type ExperienceStatus = 'active' | 'archived';

interface LocalizedContent {
  cardTitle: string;
  cardSummary: string;
  cardDetail: string;
  cardCategory?: string;
  title: string;
  lead: string;
  body: string;
  facts: [string, string][];
  includes: string[];
  excludes: string[];
  modality: string;
  note: string;
}

type ExperienceContent = Record<Locale, LocalizedContent>;

interface AdminExperience {
  id: string;
  slug: string;
  order: number;
  publishedOrder: number | null;
  status: ExperienceStatus;
  publishedStatus: ExperienceStatus;
  content: ExperienceContent | null;
  localSource: boolean;
  hasCover: boolean;
  dirty: boolean;
  updatedAt: string;
  publishedAt: string | null;
}

interface ManagerOptions {
  getAccessToken: () => Promise<string>;
  onDraftCount: (count: number) => void;
  onCatalogChanged: (focusCoverSlug?: string) => Promise<void>;
}

export interface ExperienceManager {
  load: () => Promise<void>;
  reset: () => void;
  setVisible: (visible: boolean) => void;
}

const LOCALES: Locale[] = ['es', 'en', 'pt'];

function requiredElement<T extends Element>(selector: string): T {
  const value = document.querySelector<T>(selector);
  if (!value) throw new Error(`No se encontró ${selector}.`);
  return value;
}

function setMessage(node: HTMLElement, value = '', kind: 'error' | 'success' = 'error'): void {
  node.textContent = value;
  if (value) node.dataset.kind = kind;
  else delete node.dataset.kind;
}

function setBusy(button: HTMLButtonElement, busy: boolean): void {
  button.disabled = busy;
  button.setAttribute('aria-busy', String(busy));
}

async function errorMessage(response: Response): Promise<string> {
  const payload = await response.json().catch(() => null) as { error?: string; message?: string } | null;
  return payload?.error ?? payload?.message ?? `Error ${response.status}`;
}

function slugify(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');
}

function fieldValue(panel: HTMLElement, field: string): string {
  return (panel.querySelector<HTMLInputElement | HTMLTextAreaElement>(`[data-field="${field}"]`)?.value ?? '').trim();
}

function splitLines(value: string): string[] {
  return value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
}

function readLocale(panel: HTMLElement, locale: Locale): LocalizedContent {
  const read = (field: string, label: string): string => {
    const value = fieldValue(panel, field);
    if (!value) throw new Error(`${locale.toUpperCase()}: completa ${label}.`);
    return value;
  };
  const facts = splitLines(fieldValue(panel, 'facts')).map((line, index) => {
    const separator = line.indexOf('|');
    if (separator < 1 || separator === line.length - 1) {
      throw new Error(`${locale.toUpperCase()}: el dato práctico ${index + 1} debe usar “Etiqueta | Valor”.`);
    }
    return [line.slice(0, separator).trim(), line.slice(separator + 1).trim()] as [string, string];
  });
  if (!facts.length) throw new Error(`${locale.toUpperCase()}: agrega al menos un dato práctico.`);
  return {
    cardTitle: read('cardTitle', 'el título de la card'),
    cardSummary: read('cardSummary', 'el resumen de la card'),
    cardDetail: read('cardDetail', 'la ficha breve'),
    cardCategory: fieldValue(panel, 'cardCategory') || undefined,
    title: read('title', 'el título principal'),
    lead: read('lead', 'la bajada'),
    body: read('body', 'la descripción'),
    facts,
    includes: splitLines(fieldValue(panel, 'includes')),
    excludes: splitLines(fieldValue(panel, 'excludes')),
    modality: read('modality', 'la modalidad'),
    note: read('note', 'la nota final'),
  };
}

function writeLocale(panel: HTMLElement, content?: LocalizedContent): void {
  const value = (field: string): string => {
    if (!content) return '';
    if (field === 'facts') return content.facts.map(([label, factValue]) => `${label} | ${factValue}`).join('\n');
    if (field === 'includes' || field === 'excludes') return content[field].join('\n');
    return String(content[field as keyof LocalizedContent] ?? '');
  };
  for (const control of panel.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('[data-field]')) {
    control.value = value(control.dataset.field ?? '');
  }
}

function makeField(field: string, label: string, options: { wide?: boolean; textarea?: boolean; placeholder?: string } = {}): HTMLLabelElement {
  const wrapper = document.createElement('label');
  wrapper.className = `field${options.wide ? ' field--wide' : ''}`;
  const title = document.createElement('span');
  title.textContent = label;
  const control = options.textarea ? document.createElement('textarea') : document.createElement('input');
  control.dataset.field = field;
  if (options.placeholder) control.placeholder = options.placeholder;
  wrapper.append(title, control);
  return wrapper;
}

function makeGroup(title: string, description: string, fields: HTMLLabelElement[]): HTMLElement {
  const group = document.createElement('section');
  group.className = 'experience-field-group';
  const head = document.createElement('header');
  head.className = 'experience-field-group__head';
  const heading = document.createElement('h3');
  heading.textContent = title;
  const copy = document.createElement('p');
  copy.textContent = description;
  head.append(heading, copy);
  group.append(head, ...fields);
  return group;
}

function buildLocalePanel(locale: Locale): HTMLElement {
  const panel = document.createElement('section');
  panel.className = 'experience-locale-panel';
  panel.dataset.localePanel = locale;
  panel.hidden = locale !== 'es';
  panel.append(
    makeGroup('Card', 'Textos breves que se ven en la portada y el catálogo.', [
      makeField('cardTitle', 'Título de la card'),
      makeField('cardDetail', 'Ficha breve', { placeholder: 'Día completo · 8 h' }),
      makeField('cardCategory', 'Categoría (opcional)', { placeholder: 'Trekking · Fauna · Navegación' }),
      makeField('cardSummary', 'Resumen', { wide: true, textarea: true }),
    ]),
    makeGroup('Modal y página individual', 'Contenido editorial completo de la experiencia.', [
      makeField('title', 'Título principal'),
      makeField('lead', 'Bajada', { textarea: true }),
      makeField('body', 'Descripción', { wide: true, textarea: true }),
      makeField('note', 'Nota final', { wide: true, textarea: true }),
    ]),
    makeGroup('Datos prácticos', 'Un dato por línea. En “Datos” usa siempre Etiqueta | Valor.', [
      makeField('facts', 'Datos · Etiqueta | Valor', { wide: true, textarea: true, placeholder: 'Duración | 8 a 10 h\nNivel | Medio–alto' }),
      makeField('includes', 'Incluye · una línea por elemento', { textarea: true }),
      makeField('excludes', 'No incluye · una línea por elemento', { textarea: true }),
      makeField('modality', 'Modalidad', { wide: true }),
    ]),
  );
  return panel;
}

export function createExperienceManager(options: ManagerOptions): ExperienceManager {
  const root = requiredElement<HTMLElement>('#experience-manager');
  const list = requiredElement<HTMLOListElement>('#experience-list');
  const managerStatus = requiredElement<HTMLElement>('#experience-manager-status');
  const newButton = requiredElement<HTMLButtonElement>('#new-experience-button');
  const dialog = requiredElement<HTMLDialogElement>('#experience-dialog');
  const form = requiredElement<HTMLFormElement>('#experience-form');
  const dialogTitle = requiredElement<HTMLElement>('#experience-dialog-title');
  const closeButton = requiredElement<HTMLButtonElement>('#experience-dialog-close');
  const cancelButton = requiredElement<HTMLButtonElement>('#cancel-experience-button');
  const saveButton = requiredElement<HTMLButtonElement>('#save-experience-button');
  const translateButton = requiredElement<HTMLButtonElement>('#translate-experience-button');
  const formStatus = requiredElement<HTMLElement>('#experience-form-status');
  const deleteDialog = requiredElement<HTMLDialogElement>('#delete-experience-dialog');
  const deleteName = requiredElement<HTMLElement>('#delete-experience-name');
  const deleteStatus = requiredElement<HTMLElement>('#delete-experience-status');
  const cancelDeleteButton = requiredElement<HTMLButtonElement>('#cancel-delete-experience-button');
  const confirmDeleteButton = requiredElement<HTMLButtonElement>('#confirm-delete-experience-button');
  const idInput = requiredElement<HTMLInputElement>('#experience-id');
  const slugInput = requiredElement<HTMLInputElement>('#experience-slug');
  const statusInput = requiredElement<HTMLSelectElement>('#experience-status');
  const panelsRoot = requiredElement<HTMLElement>('#experience-locale-panels');
  const localeTabs = [...document.querySelectorAll<HTMLButtonElement>('[data-experience-locale]')];

  panelsRoot.replaceChildren(...LOCALES.map(buildLocalePanel));
  const panel = (locale: Locale) => requiredElement<HTMLElement>(`[data-locale-panel="${locale}"]`);
  let items: AdminExperience[] = [];
  let draggingId: string | null = null;
  let slugEdited = false;
  let editorDirty = false;
  let pendingDeletionCount = 0;
  let pendingDelete: AdminExperience | null = null;
  let deleting = false;

  const authenticatedFetch = async (path: string, init: RequestInit = {}): Promise<Response> => {
    const token = await options.getAccessToken();
    const headers = new Headers(init.headers);
    headers.set('Authorization', `Bearer ${token}`);
    if (init.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
    return fetch(path, { ...init, headers });
  };

  const selectLocale = (locale: Locale): void => {
    for (const tab of localeTabs) {
      const selected = tab.dataset.experienceLocale === locale;
      tab.setAttribute('aria-selected', String(selected));
      tab.tabIndex = selected ? 0 : -1;
    }
    for (const localePanel of panelsRoot.querySelectorAll<HTMLElement>('[data-locale-panel]')) {
      localePanel.hidden = localePanel.dataset.localePanel !== locale;
    }
  };

  const readAllContent = (): ExperienceContent => ({
    es: readLocale(panel('es'), 'es'),
    en: readLocale(panel('en'), 'en'),
    pt: readLocale(panel('pt'), 'pt'),
  });

  const closeEditor = (force = false): void => {
    if (!force && editorDirty && !window.confirm('Hay cambios sin guardar en esta experiencia. ¿Cerrar el editor?')) return;
    if (dialog.open) dialog.close();
    editorDirty = false;
    setMessage(formStatus);
  };

  const openEditor = (item?: AdminExperience): void => {
    idInput.value = item?.id ?? '';
    slugInput.value = item?.slug ?? '';
    slugInput.readOnly = Boolean(item);
    statusInput.value = item?.status ?? 'active';
    statusInput.disabled = !item;
    dialogTitle.textContent = item ? 'Editar experiencia' : 'Nueva experiencia';
    slugEdited = Boolean(item);
    for (const locale of LOCALES) writeLocale(panel(locale), item?.content?.[locale]);
    selectLocale('es');
    editorDirty = false;
    setMessage(formStatus, item?.hasCover === false ? 'Falta asignar una portada antes de publicar.' : '', item?.hasCover === false ? 'error' : 'success');
    dialog.showModal();
    window.setTimeout(() => {
      const focusTarget = panel('es').querySelector<HTMLInputElement>('[data-field="cardTitle"]');
      focusTarget?.focus();
    }, 30);
  };

  const closeDeleteDialog = (force = false): void => {
    if (deleting && !force) return;
    if (deleteDialog.open) deleteDialog.close();
    pendingDelete = null;
    setMessage(deleteStatus);
  };

  const openDeleteDialog = (item: AdminExperience): void => {
    pendingDelete = item;
    deleteName.textContent = `“${item.content?.es.cardTitle ?? item.slug}”`;
    setMessage(deleteStatus);
    deleteDialog.showModal();
    window.setTimeout(() => cancelDeleteButton.focus(), 30);
  };

  const deleteExperience = async (): Promise<void> => {
    const item = pendingDelete;
    if (!item || deleting) return;
    deleting = true;
    setBusy(confirmDeleteButton, true);
    cancelDeleteButton.disabled = true;
    setMessage(deleteStatus, 'Eliminando experiencia…', 'success');
    try {
      const response = await authenticatedFetch('/api/admin/experiences', {
        method: 'DELETE',
        body: JSON.stringify({ id: item.id }),
      });
      if (!response.ok) throw new Error(await errorMessage(response));
      closeDeleteDialog(true);
      try {
        await load();
        await options.onCatalogChanged();
      } catch (refreshError) {
        setMessage(
          managerStatus,
          `La experiencia se eliminó, pero el panel no pudo actualizarse: ${refreshError instanceof Error ? refreshError.message : 'actualiza la página.'}`,
        );
        return;
      }
      setMessage(managerStatus, 'Experiencia eliminada del borrador. Pulsa “Publicar cambios” para retirarla del sitio.', 'success');
    } catch (error) {
      setMessage(deleteStatus, error instanceof Error ? error.message : 'No se pudo eliminar la experiencia.');
    } finally {
      deleting = false;
      setBusy(confirmDeleteButton, false);
      cancelDeleteButton.disabled = false;
    }
  };

  const saveOrder = async (): Promise<void> => {
    setMessage(managerStatus, 'Guardando el nuevo orden…', 'success');
    const response = await authenticatedFetch('/api/admin/experiences', {
      method: 'PATCH',
      body: JSON.stringify({ action: 'reorder', ids: items.map((item) => item.id) }),
    });
    if (!response.ok) throw new Error(await errorMessage(response));
    setMessage(managerStatus, 'Orden guardado como borrador. Se aplicará en portada y catálogo al publicar.', 'success');
    options.onDraftCount(items.filter((item) => item.dirty || item.order !== item.publishedOrder).length + pendingDeletionCount);
    await options.onCatalogChanged();
  };

  const reorder = async (fromId: string, toIndex: number): Promise<void> => {
    const fromIndex = items.findIndex((item) => item.id === fromId);
    if (fromIndex < 0) return;
    const [moved] = items.splice(fromIndex, 1);
    if (!moved) return;
    const bounded = Math.max(0, Math.min(toIndex, items.length));
    items.splice(bounded, 0, moved);
    items.forEach((item, index) => { item.order = index + 1; item.dirty = true; });
    renderList();
    try {
      await saveOrder();
      await load();
    } catch (error) {
      setMessage(managerStatus, error instanceof Error ? error.message : 'No se pudo guardar el orden.');
      await load().catch(() => undefined);
    }
  };

  const moveBy = (id: string, direction: -1 | 1): void => {
    const current = items.findIndex((item) => item.id === id);
    const target = current + direction;
    if (current < 0 || target < 0 || target >= items.length) return;
    void reorder(id, target);
  };

  const renderList = (): void => {
    const rows = items.map((item, index) => {
      const row = document.createElement('li');
      row.className = 'experience-row';
      row.dataset.experienceId = item.id;
      row.dataset.status = item.status;

      const handle = document.createElement('button');
      handle.type = 'button';
      handle.className = 'experience-row__handle';
      handle.draggable = true;
      handle.title = 'Arrastrar para cambiar prioridad';
      handle.setAttribute('aria-label', `Mover ${item.content?.es.cardTitle ?? item.slug}`);
      handle.innerHTML = '<svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="7" cy="5" r="1.2"/><circle cx="13" cy="5" r="1.2"/><circle cx="7" cy="10" r="1.2"/><circle cx="13" cy="10" r="1.2"/><circle cx="7" cy="15" r="1.2"/><circle cx="13" cy="15" r="1.2"/></svg>';

      const order = document.createElement('span');
      order.className = 'experience-row__order';
      order.textContent = String(index + 1).padStart(2, '0');

      const copy = document.createElement('div');
      copy.className = 'experience-row__copy';
      const title = document.createElement('strong');
      title.textContent = item.content?.es.cardTitle ?? item.slug;
      const slug = document.createElement('small');
      slug.textContent = item.slug;
      copy.append(title, slug);

      const badges = document.createElement('div');
      badges.className = 'experience-row__badges';
      const badge = (text: string, kind = '') => {
        const value = document.createElement('span');
        value.className = 'experience-row__badge';
        if (kind) value.dataset.kind = kind;
        value.textContent = text;
        badges.append(value);
      };
      if (item.status === 'archived') badge('Archivada', 'archived');
      else if (!item.hasCover) badge('Falta portada', 'missing');
      else badge('Portada lista');
      if (item.dirty || item.order !== item.publishedOrder) badge('Borrador', 'draft');
      else if (item.publishedAt) badge('Publicada');

      const actions = document.createElement('div');
      actions.className = 'experience-row__actions';
      const up = document.createElement('button');
      up.type = 'button'; up.innerHTML = '<span aria-hidden="true">↑</span><span class="experience-row__action-label">Subir</span>'; up.title = 'Subir prioridad'; up.disabled = index === 0;
      up.dataset.action = 'up';
      up.setAttribute('aria-label', `Subir prioridad de ${item.content?.es.cardTitle ?? item.slug}`);
      up.addEventListener('click', () => moveBy(item.id, -1));
      const down = document.createElement('button');
      down.type = 'button'; down.innerHTML = '<span aria-hidden="true">↓</span><span class="experience-row__action-label">Bajar</span>'; down.title = 'Bajar prioridad'; down.disabled = index === items.length - 1;
      down.dataset.action = 'down';
      down.setAttribute('aria-label', `Bajar prioridad de ${item.content?.es.cardTitle ?? item.slug}`);
      down.addEventListener('click', () => moveBy(item.id, 1));
      const edit = document.createElement('button');
      edit.type = 'button'; edit.textContent = 'Editar'; edit.title = 'Editar contenido';
      edit.dataset.action = 'edit';
      edit.addEventListener('click', () => openEditor(item));
      const remove = document.createElement('button');
      remove.type = 'button'; remove.textContent = 'Eliminar'; remove.title = 'Eliminar experiencia';
      remove.dataset.action = 'delete';
      remove.setAttribute('aria-label', `Eliminar ${item.content?.es.cardTitle ?? item.slug}`);
      remove.addEventListener('click', () => openDeleteDialog(item));
      actions.append(up, down, edit, remove);

      handle.addEventListener('dragstart', (event) => {
        draggingId = item.id;
        row.dataset.dragging = 'true';
        event.dataTransfer?.setData('text/plain', item.id);
        if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
      });
      handle.addEventListener('dragend', () => {
        draggingId = null;
        delete row.dataset.dragging;
        for (const candidate of list.querySelectorAll<HTMLElement>('[data-drag-over]')) delete candidate.dataset.dragOver;
      });
      row.addEventListener('dragover', (event) => {
        if (!draggingId || draggingId === item.id) return;
        event.preventDefault();
        row.dataset.dragOver = 'true';
      });
      row.addEventListener('dragleave', () => { delete row.dataset.dragOver; });
      row.addEventListener('drop', (event) => {
        event.preventDefault();
        delete row.dataset.dragOver;
        const fromId = draggingId ?? event.dataTransfer?.getData('text/plain');
        if (!fromId || fromId === item.id) return;
        const rect = row.getBoundingClientRect();
        const fromIndex = items.findIndex((candidate) => candidate.id === fromId);
        let targetIndex = index + (event.clientY > rect.top + rect.height / 2 ? 1 : 0);
        if (fromIndex >= 0 && fromIndex < targetIndex) targetIndex -= 1;
        void reorder(fromId, targetIndex);
      });

      row.append(handle, order, copy, badges, actions);
      return row;
    });
    list.replaceChildren(...rows);
  };

  const load = async (): Promise<void> => {
    setMessage(managerStatus, 'Cargando experiencias…', 'success');
    const response = await authenticatedFetch('/api/admin/experiences');
    if (!response.ok) throw new Error(await errorMessage(response));
    const payload = await response.json() as { experiences: AdminExperience[]; pendingDeletionCount?: number };
    items = payload.experiences.sort((a, b) => a.order - b.order);
    pendingDeletionCount = payload.pendingDeletionCount ?? 0;
    renderList();
    options.onDraftCount(items.filter((item) => item.dirty).length + pendingDeletionCount);
    setMessage(managerStatus, `${items.length} experiencias sincronizadas.`, 'success');
  };

  newButton.addEventListener('click', () => openEditor());
  closeButton.addEventListener('click', () => closeEditor());
  cancelButton.addEventListener('click', () => closeEditor());
  dialog.addEventListener('click', (event) => { if (event.target === dialog) closeEditor(); });
  dialog.addEventListener('cancel', (event) => {
    event.preventDefault();
    closeEditor();
  });
  cancelDeleteButton.addEventListener('click', () => closeDeleteDialog());
  confirmDeleteButton.addEventListener('click', () => { void deleteExperience(); });
  deleteDialog.addEventListener('click', (event) => { if (event.target === deleteDialog) closeDeleteDialog(); });
  deleteDialog.addEventListener('cancel', (event) => {
    event.preventDefault();
    closeDeleteDialog();
  });
  form.addEventListener('input', () => { editorDirty = true; });

  slugInput.addEventListener('input', () => { slugEdited = slugInput.value.length > 0; });
  panel('es').querySelector<HTMLInputElement>('[data-field="cardTitle"]')?.addEventListener('input', (event) => {
    if (!idInput.value && !slugEdited && event.target instanceof HTMLInputElement) slugInput.value = slugify(event.target.value);
  });

  for (const tab of localeTabs) {
    tab.addEventListener('click', () => selectLocale(tab.dataset.experienceLocale as Locale));
    tab.addEventListener('keydown', (event) => {
      if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
      event.preventDefault();
      const current = localeTabs.indexOf(tab);
      const offset = event.key === 'ArrowRight' ? 1 : -1;
      const next = localeTabs[(current + offset + localeTabs.length) % localeTabs.length];
      next?.focus();
      if (next?.dataset.experienceLocale) selectLocale(next.dataset.experienceLocale as Locale);
    });
  }

  translateButton.addEventListener('click', async () => {
    let spanish: LocalizedContent;
    try { spanish = readLocale(panel('es'), 'es'); }
    catch (error) { setMessage(formStatus, error instanceof Error ? error.message : 'Completa el español.'); return; }
    const hasTranslations = fieldValue(panel('en'), 'cardTitle') || fieldValue(panel('pt'), 'cardTitle');
    if (hasTranslations && !window.confirm('Esto reemplazará las traducciones EN/PT actuales. ¿Continuar?')) return;
    setBusy(translateButton, true);
    setMessage(formStatus, 'Generando inglés y portugués…', 'success');
    try {
      const response = await authenticatedFetch('/api/admin/translate-experience', {
        method: 'POST',
        body: JSON.stringify({ es: spanish }),
      });
      if (!response.ok) throw new Error(await errorMessage(response));
      const translated = await response.json() as { en: LocalizedContent; pt: LocalizedContent };
      writeLocale(panel('en'), translated.en);
      writeLocale(panel('pt'), translated.pt);
      editorDirty = true;
      setMessage(formStatus, 'Traducciones generadas. Revísalas en las pestañas EN y PT antes de guardar.', 'success');
      selectLocale('en');
    } catch (error) {
      setMessage(formStatus, error instanceof Error ? error.message : 'No se pudo traducir.');
    } finally {
      setBusy(translateButton, false);
    }
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    let content: ExperienceContent;
    try { content = readAllContent(); }
    catch (error) { setMessage(formStatus, error instanceof Error ? error.message : 'Contenido incompleto.'); return; }
    const editing = Boolean(idInput.value);
    const slug = slugInput.value.trim();
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
      setMessage(formStatus, 'La URL sólo puede usar minúsculas, números y guiones simples.');
      return;
    }
    setBusy(saveButton, true);
    setMessage(formStatus, 'Guardando borrador…', 'success');
    try {
      const response = await authenticatedFetch('/api/admin/experiences', {
        method: editing ? 'PATCH' : 'POST',
        body: JSON.stringify(editing
          ? { action: 'save', id: idInput.value, content, status: statusInput.value }
          : { slug, content }),
      });
      if (!response.ok) throw new Error(await errorMessage(response));
      closeEditor(true);
      try {
        await load();
        await options.onCatalogChanged(editing ? undefined : slug);
      } catch (refreshError) {
        setMessage(
          managerStatus,
          `La experiencia se guardó, pero el panel no pudo actualizarse: ${refreshError instanceof Error ? refreshError.message : 'actualiza la página.'}`,
        );
        return;
      }
      setMessage(
        managerStatus,
        editing
          ? 'Contenido guardado como borrador.'
          : 'Experiencia creada. Ahora asigna y encuadra su portada en la tarjeta de recursos que aparece debajo.',
        'success',
      );
    } catch (error) {
      setMessage(formStatus, error instanceof Error ? error.message : 'No se pudo guardar la experiencia.');
    } finally {
      setBusy(saveButton, false);
    }
  });

  return {
    load,
    reset: () => {
      items = [];
      pendingDeletionCount = 0;
      list.replaceChildren();
      options.onDraftCount(0);
      closeEditor(true);
      closeDeleteDialog(true);
      setMessage(managerStatus);
    },
    setVisible: (visible: boolean) => { root.hidden = !visible; },
  };
}
