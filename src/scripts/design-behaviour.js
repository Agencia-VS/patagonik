/*
  Generado por scripts/port-behaviour.mjs — no editar a mano.

  Comportamientos del diseño original de PatagoniK, adaptados para correr sin
  el runtime de Claude Design. Métodos retirados por innecesarios en Astro:
  setupRouter, readRoute, normalizeRoute, detectRouteBase, routeHref, navigateTo, renderRoute, mountRouteView, unmountRouteView, applyRouteMeta, syncRouteLinks, setupExperienceRouting, syncExperienceHash, clearExperienceHash, setLang, applyLang, cacheSpanish, parseAttrKeys, ensureLeaflet, getExperienceMapData, setupExperienceMap, setupMiniExperienceMap.
*/
const ARROW_REST = '#9C998F';
const ARROW_HOVER = '#6E6259';
const GA4_ID = ''; // Desarrollador: pegar aquí el Measurement ID de GA4, por ejemplo G-XXXXXXXXXX
const WIDE_BP = 860;
/* Franja 1 = text | video strip · Franja 2 = flush-left image | word */
const COLS = { wide: { f1: '1fr 0.86fr', f2: '2.9fr 1fr' }, narrow: { f1: '1fr', f2: '1fr' } };

const clamp01 = v => v < 0 ? 0 : v > 1 ? 1 : v;
const lerp = (a, b, t) => a + (b - a) * t;
const easeInOut = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
const easeOut = t => 1 - Math.pow(1 - t, 3);
const easeIn = t => t * t * t;


/* ── Traducciones del detalle de experiencia ──────────────────────────────
   EXPERIENCE_DATA (arriba) es la fuente en español. Esta tabla la cubre en
   en / pt con la MISMA forma: mismos facts, en el mismo orden, y listas
   includes / excludes del mismo largo. Si agregas una experiencia nueva,
   agrégala aquí en los dos idiomas o el modal caerá al español para ella.
   Textos redactados por VS — revisar con el equipo comercial antes de
   publicar campañas en esos mercados.
   ──────────────────────────────────────────────────────────────────────── */

/* ── C1 — Rutas ───────────────────────────────────────────────────────────
   La portada sólo monta lo suyo; cada ruta se arma bajo demanda a partir del
   <script type="text/html" data-route-view> correspondiente.

   title / description alimentan <title> y la meta description por vista. Se
   traducen: es la única parte de la página que Google lee sin ejecutar el
   selector de idioma, así que no puede quedarse fija en español.
   ──────────────────────────────────────────────────────────────────────── */

/* Etiquetas fijas del modal que no viven en el DOM (se arman desde JS). */


class PatagonikUI {
  constructor(props) {
    this.props = props || {};
  }
  componentDidMount() {
    this.lang = 'es';
    this.menuOpen = false;
    this.langOpen = false;
    this.esCache = new Map();
    this.reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    this.setupDesktopExperiences();
    this.setupMobileExperiences();
    this.setupMobileExperienceSwipe();
    this.setupLazyMedia();
    /* Antes de cacheSpanish()/setLang(): monta las flechas del carrusel para
       que entren en el mismo barrido de traducción que el resto del DOM. */
    this.setupExperienceCarousel();
    this.applyAccent();
    this.delegate();
    this.setupReveals();
    this.setupParallax();
    this.setupHeader();
    this.setupHeaderFit();
    this.setupStage();
    this.setupEsencia();
    this.setupCardCursor();
    this.setupHeroVideo();
    this.setupAnalytics();
    this.setupLeadTools();
    this.setupVisualCleanupV47();
    this.setupReviewsMoreV47();
    this.setupSectionSmoothIn();
    /* Al final: monta la vista que corresponda a la URL de entrada, ya con
       todo lo de la portada inicializado. */
  }

  componentWillUnmount() {
    (this.cleanups || []).forEach(fn => fn());
    if (this.io) this.io.disconnect();
    if (this.failsafe) clearTimeout(this.failsafe);
    try { document.body.style.overflow = ''; } catch (e) {}
  }

  on(target, type, fn, opts) {
    target.addEventListener(type, fn, opts);
    const undo = () => target.removeEventListener(type, fn, opts);
    /* Durante el montaje de una vista de ruta los listeners se anotan aparte,
       para poder soltarlos al salir en vez de acumular uno por navegación. */
    if (this.viewCleanups) this.viewCleanups.push(undo);
    else (this.cleanups = this.cleanups || []).push(undo);
  }

  q(sel) { return Array.from(document.querySelectorAll(sel)); }
  one(sel) { return document.querySelector(sel); }

  /* Guarda el español original de cada nodo traducible para poder volver a él
     cuando una clave no existe en el diccionario. Es idempotente y sólo indexa
     nodos nuevos, así que el router puede volver a llamarla al montar una vista
     sin re-numerar lo que ya estaba en la página. */

  /* Pasada de traducción. Sin argumento recorre el documento; con un root
     recorre sólo ese subárbol, que es lo que necesita el router al montar una
     vista después del arranque. */

  applyAccent() {
    const c = this.props.accentColor;
    if (!c) return;
    this.q('[data-accent-text]').forEach(el => { el.style.color = c; });
    this.q('[data-accent-bg]').forEach(el => { el.style.background = c; });
  }

  delegate() {
    const near = (e, sel) => (e.target && e.target.closest) ? e.target.closest(sel) : null;

    this.on(document, 'click', (e) => {
      const expCard = near(e, '[data-exp-detail]');
      if (expCard) {
        e.preventDefault();
        e.stopPropagation();
        if (this.mobileExpSuppressClickUntil && Date.now() < this.mobileExpSuppressClickUntil) return;
        this.openExperience(expCard);
        return;
      }

      const expClose = near(e, '#pk-exp-close');
      if (expClose) {
        e.preventDefault();
        e.stopPropagation();
        this.closeExperience();
        return;
      }

      const expModal = this.one('#pk-exp-modal');
      if (expModal && e.target === expModal) {
        e.preventDefault();
        this.closeExperience();
        return;
      }

      if (near(e, '[data-langtoggle]')) {
        e.preventDefault(); e.stopPropagation();
        this.setLangMenu(!this.langOpen);
        return;
      }
      if (near(e, '[data-menu-toggle]')) {
        e.preventDefault(); e.stopPropagation();
        this.setMenu(!this.menuOpen);
        return;
      }

      if (near(e, '[data-menu-link]')) { this.setMenu(false); return; }
      if (this.menuOpen && !near(e, '[data-menu]') && !near(e, '[data-menu-toggle]')) this.setMenu(false);
      this.setLangMenu(false);
    });

    this.on(document, 'keydown', (e) => {
      if (e.key === 'Escape') {
        this.setLangMenu(false);
        this.setMenu(false);
        this.closeExperience();
      }
    });

    const hoverBtn = (e, entering) => {
      const btn = near(e, '[data-btn]');
      if (!btn) return;
      const bg = btn.querySelector('[data-btn-bg]');
      const arrow = btn.querySelector('[data-btn-arrow]');
      if (bg) bg.style.transform = entering ? 'scale(1.035)' : 'scale(1)';
      if (arrow) {
        arrow.style.transform = entering ? 'rotate(0deg) translate(3px, -1px)' : 'rotate(-45deg)';
        arrow.style.stroke = entering ? ARROW_HOVER : ARROW_REST;
      }
    };
    this.on(document, 'mouseover', (e) => hoverBtn(e, true));
    this.on(document, 'mouseout', (e) => hoverBtn(e, false));
    this.on(document, 'focusin', (e) => hoverBtn(e, true));
    this.on(document, 'focusout', (e) => hoverBtn(e, false));

    this.on(document, 'mouseover', (e) => {
      const opt = near(e, '[data-langmenu] [data-lang]');
      if (opt) opt.style.background = 'rgba(107,122,94,.12)';
    });
    this.on(document, 'mouseout', (e) => {
      const opt = near(e, '[data-langmenu] [data-lang]');
      if (opt) opt.style.background = 'none';
    });
  }


  /* El contenido del modal no lleva data-t: se arma desde datos, así que la
     traducción se resuelve aquí y no en setLang(). Devuelve el español si al
     idioma activo le falta la experiencia, para no dejar el panel vacío. */
  experienceContent(key) {
    return (window.__PK_EXPERIENCES || {})[String(key)] || null;
  }

  openExperience(card, opts) {
    opts = opts || {};
    if (!card) return;
    const key = String(card.getAttribute('data-exp-detail') || '');
    this.currentExperienceKey = key;
    const d = this.experienceContent(key);
    if (d) this.trackEvent('view_experience', { experience: (d && d.title) || key });
    const modal = this.one('#pk-exp-modal');
    const panel = this.one('#pk-exp-panel');
    if (!d || !modal || !panel) return;

    this.lastExperienceFocus = card;
    this.experienceCard = card;
    this.renderExperience(key);

    modal.style.display = 'flex';
    modal.setAttribute('aria-hidden', 'false');
    try { document.body.style.overflow = 'hidden'; } catch (e) {}
    panel.scrollTop = 0;

    const close = document.getElementById('pk-exp-close');
    if (close) setTimeout(() => close.focus(), 30);
  }

  /* Rellena el panel en el idioma activo. Se llama al abrir y de nuevo desde
     setLang(), para que cambiar de idioma con el modal abierto lo actualice
     en vez de dejarlo en el idioma con el que se abrió. */
  renderExperience(key) {
    key = String(key == null ? this.currentExperienceKey : key);
    const d = this.experienceContent(key);
    if (!d) return;
    const card = this.experienceCard;
    const labels = window.__PK_LABELS || { modality: 'Modalidad:', wa: (t) => t };

    const q = (id) => document.getElementById(id);

    const title = q('pk-exp-title');
    const lead = q('pk-exp-lead');
    const body = q('pk-exp-body');
    const modality = q('pk-exp-modality');
    const note = q('pk-exp-note');
    if (title) title.textContent = d.title || '';
    if (lead) lead.textContent = d.lead || '';
    if (body) body.textContent = d.body || '';
    if (modality) {
      modality.textContent = '';
      const strong = document.createElement('strong');
      strong.textContent = labels.modality;
      modality.append(strong, ' ' + (d.modality || ''));
    }
    if (note) note.textContent = d.note || '';

    const facts = q('pk-exp-facts');
    if (facts) {
      facts.replaceChildren();
      const factRows = d.facts || [];
      facts.hidden = !factRows.length;
      factRows.forEach((pair) => {
        const box = document.createElement('div');
        box.className = 'pk-exp-fact-row';
        const label = document.createElement('dt');
        label.className = 'pk-exp-fact-label';
        label.textContent = pair[0];
        const value = document.createElement('dd');
        value.className = 'pk-exp-fact-value';
        value.textContent = pair[1];
        box.append(label, value);
        facts.appendChild(box);
      });
    }

    const fillList = (id, items) => {
      const ul = q(id);
      if (!ul) return;
      ul.innerHTML = '';
      (items || []).forEach((item) => {
        const li = document.createElement('li');
        li.textContent = item;
        ul.appendChild(li);
      });
      if (ul.parentElement) ul.parentElement.style.display = items && items.length ? '' : 'none';
    };
    fillList('pk-exp-includes', d.includes);
    fillList('pk-exp-excludes', d.excludes);

    /* La foto pertenece a la tarjeta, no al idioma: se clona sólo al abrir
       para no provocar un parpadeo al conmutar de idioma. */
    const imageWrap = q('pk-exp-image');
    if (imageWrap && card && imageWrap.getAttribute('data-exp-key') !== key) {
      imageWrap.innerHTML = '';
      const source = card.querySelector('image-slot');
      if (source) {
        const clone = source.cloneNode(true);
        clone.removeAttribute('id');
        clone.setAttribute('fit', 'cover');
        clone.style.width = '100%';
        clone.style.height = '100%';
        imageWrap.appendChild(clone);
      }
      imageWrap.setAttribute('data-exp-key', key);
    }

    const num = String(this.props.whatsappNumber || '56931712780').replace(/[^0-9]/g, '');
    const wa = q('pk-exp-wa');
    if (wa) wa.href = 'https://wa.me/' + num + '?text=' + encodeURIComponent(labels.wa(d.title || ''));
  }

  closeExperience(skipHashSync) {
    const modal = this.one('#pk-exp-modal');
    if (!modal || modal.getAttribute('aria-hidden') === 'true') return;
    modal.style.display = 'none';
    modal.setAttribute('aria-hidden', 'true');
    try { document.body.style.overflow = ''; } catch (e) {}
    if (this.lastExperienceFocus) {
      try { this.lastExperienceFocus.focus(); } catch (e) {}
    }
  }



  /* ── C1 — Router ──────────────────────────────────────────────────────
     Historia real (pushState) cuando la página se sirve por http(s); si no
     —file://, o un hosting sin rewrites que devolvería 404 al recargar
     /tabs/faq— cae automáticamente a hash (#/tabs/faq). Los enlaces del menú
     llevan href real en ambos casos, así que siguen siendo rastreables y se
     pueden abrir en una pestaña nueva. */

  /* Prefijo bajo el que está publicado el sitio, para que las rutas funcionen
     igual en la raíz de un dominio que en un subdirectorio.

     No se puede sacar quitando el último segmento: al entrar directo a
     /tabs/faq eso daría una base de "/tabs/" y la ruta se perdería. Se
     resuelve al revés — si la URL termina en una ruta conocida, lo que queda
     delante es la base. */

  /* Ruta actual, normalizada a '/', '/tabs/faq', … */

  /* href que hay que escribir en un enlace de ruta según el modo activo. */

  /* Comportamientos que el arranque monta sobre el DOM vivo y que hay que
     volver a montar cuando una vista aparece después. */

  /* Reescribe los href al modo activo y marca el enlace de la ruta actual. */


  trackEvent(name, params) {
    params = params || {};
    try {
      window.dataLayer = window.dataLayer || [];
      window.dataLayer.push(Object.assign({ event: name }, params));
      if (typeof window.gtag === 'function') window.gtag('event', name, params);
    } catch (e) {}
  }




  setupDesktopExperiences() {
    const cards = this.q('#tours [data-hs-card][data-exp-detail]');
    if (!cards.length) return;

    cards.forEach((card) => {
      const titleEl = card.querySelector('h3');
      const summaryEl = card.querySelector('[data-t^="tour."][data-t$=".s"]');
      const detailEl = card.querySelector('[data-t^="tour."][data-t$=".d"]');
      const slot = card.querySelector('image-slot');
      if (!titleEl || !slot) return;

      const image = document.createElement('div');
      image.setAttribute('data-desktop-exp-image', '');
      const clone = slot.cloneNode(true);
      clone.removeAttribute('id');
      clone.setAttribute('fit', 'cover');
      image.appendChild(clone);

      const title = document.createElement('h3');
      const titleKey = titleEl.getAttribute('data-t');
      if (titleKey) title.setAttribute('data-t', titleKey);
      title.textContent = titleEl.textContent;

      const summary = document.createElement('p');
      summary.setAttribute('data-desktop-exp-summary', '');
      if (summaryEl) {
        const k = summaryEl.getAttribute('data-t');
        if (k) summary.setAttribute('data-t', k);
        summary.textContent = summaryEl.textContent;
      }

      const tech = document.createElement('p');
      tech.setAttribute('data-desktop-exp-tech', '');
      if (detailEl) {
        const k = detailEl.getAttribute('data-t');
        if (k) tech.setAttribute('data-t', k);
        tech.textContent = detailEl.textContent;
      }

      const more = document.createElement('span');
      more.setAttribute('data-desktop-exp-more', '');
      more.textContent = 'Ver detalles';

      card.innerHTML = '';
      card.append(image, title, summary, tech, more);
    });
  }

  setupMobileExperienceSwipe() {
    const track = this.one('#pk-mobile-exp-track');
    if (!track) return;

    let startX = 0, startY = 0, moved = false;

    this.on(track, 'touchstart', (e) => {
      const t = e.touches && e.touches[0];
      if (!t) return;
      startX = t.clientX;
      startY = t.clientY;
      moved = false;
    }, { passive:true });

    this.on(track, 'touchmove', (e) => {
      const t = e.touches && e.touches[0];
      if (!t) return;
      const dx = Math.abs(t.clientX - startX);
      const dy = Math.abs(t.clientY - startY);
      if (dx > 8 && dx > dy) {
        moved = true;
        this.mobileExpSuppressClickUntil = Date.now() + 450;
      }
    }, { passive:true });

    this.on(track, 'touchend', () => {
      if (moved) this.mobileExpSuppressClickUntil = Date.now() + 450;
    }, { passive:true });
  }

  setupMobileExperiences() {
    const dest = this.one('#pk-mobile-exp-track');
    const sourceCards = this.q('#tours [data-exp-detail]');
    if (!dest || !sourceCards.length || dest.children.length) return;

    sourceCards.forEach((source) => {
      const n = source.getAttribute('data-exp-detail');
      const titleEl = source.querySelector('h3');
      const summaryEl = source.querySelector('[data-t^="tour."][data-t$=".s"]');
      const detailEl = source.querySelector('[data-t^="tour."][data-t$=".d"]');
      const slot = source.querySelector('image-slot');

      const card = document.createElement('a');
      card.href = '#';
      card.setAttribute('data-exp-detail', n || '');
      card.setAttribute('aria-haspopup', 'dialog');

      const image = document.createElement('div');
      image.setAttribute('data-mobile-exp-image', '');
      if (slot) {
        const clone = slot.cloneNode(true);
        clone.removeAttribute('id');
        clone.setAttribute('fit', 'cover');
        image.appendChild(clone);
      }

      const title = document.createElement('h3');
      if (titleEl && titleEl.getAttribute('data-t')) title.setAttribute('data-t', titleEl.getAttribute('data-t'));
      title.textContent = titleEl ? titleEl.textContent : ('Experiencia ' + n);
      title.style.cssText = "font-family:Georgia,'Times New Roman',serif;font-weight:300;";

      const summary = document.createElement('p');
      summary.setAttribute('data-mobile-exp-summary', '');
      if (summaryEl && summaryEl.getAttribute('data-t')) summary.setAttribute('data-t', summaryEl.getAttribute('data-t'));
      summary.textContent = summaryEl ? summaryEl.textContent : '';

      const tech = document.createElement('p');
      tech.setAttribute('data-mobile-exp-tech', '');
      if (detailEl && detailEl.getAttribute('data-t')) tech.setAttribute('data-t', detailEl.getAttribute('data-t'));
      tech.textContent = detailEl ? detailEl.textContent : '';

      const more = document.createElement('span');
      more.textContent = 'Ver detalles';
      more.style.cssText = 'margin-top:9px;font-size:9px;letter-spacing:.18em;text-transform:uppercase;color:rgba(245,242,236,.46);';

      card.append(image, title, summary, tech, more);
      dest.appendChild(card);
    });
  }

  setupAnalytics() {
    if (GA4_ID && /^G-[A-Z0-9]+$/i.test(GA4_ID)) {
      window.dataLayer = window.dataLayer || [];
      window.gtag = window.gtag || function(){ window.dataLayer.push(arguments); };
      window.gtag('js', new Date());
      window.gtag('config', GA4_ID);
      const s = document.createElement('script');
      s.async = true;
      s.src = 'https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(GA4_ID);
      document.head.appendChild(s);
    }

    let scrolled90 = false;
    this.on(window, 'scroll', () => {
      if (scrolled90) return;
      const doc = document.documentElement;
      const max = Math.max(1, doc.scrollHeight - window.innerHeight);
      if (window.scrollY / max >= .9) {
        scrolled90 = true;
        this.trackEvent('scroll_90');
      }
    }, { passive:true });

    this.on(document, 'click', (e) => {
      const a = e.target && e.target.closest ? e.target.closest('a') : null;
      if (!a) return;
      const href = a.getAttribute('href') || '';
      if (a.hasAttribute('data-wa') || href.indexOf('wa.me/') !== -1) {
        this.trackEvent('whatsapp_click', { location: a.closest('section,footer')?.id || 'global' });
      }
      if (href.indexOf('instagram.com') !== -1) {
        this.trackEvent('instagram_click', { location: a.closest('section,footer')?.id || 'footer' });
      }
    });
  }

  setupLeadTools() {
    this.quizState = {};
    this.quoteStarted = false;

    this.q('[data-quiz-option]').forEach(btn => {
      this.on(btn, 'click', () => {
        const group = btn.getAttribute('data-quiz-group');
        const value = btn.getAttribute('data-quiz-value');
        if (!group) return;
        this.quizState[group] = value;
        this.q('[data-quiz-option][data-quiz-group="' + group + '"]').forEach(x => x.classList.remove('is-selected'));
        btn.classList.add('is-selected');
        this.renderQuizResult();
      });
    });

    const qform = this.one('#pk-quote-form');
    if (qform) {
      const start = () => {
        if (this.quoteStarted) return;
        this.quoteStarted = true;
        this.trackEvent('quote_start');
      };
      this.on(qform, 'focusin', start);
      this.on(qform, 'change', start);

      /* Si el visitante elige la experiencia a mano, el quiz deja de pisarla. */
      const expSel = this.one('#pk-quote-experience');
      if (expSel) {
        this.on(expSel, 'change', () => { delete expSel.dataset.pkAuto; });
      }
      this.on(qform, 'submit', (e) => {
        e.preventDefault();
        const fd = new FormData(qform);
        const fecha = String(fd.get('fecha') || '').trim();
        const pax = String(fd.get('pax') || '').trim();
        const experiencia = String(fd.get('experiencia') || '').trim();
        const modalidad = String(fd.get('modalidad') || '').trim();

        const lang = this.lang || 'es';
        const lines = lang === 'en'
          ? ['Hi PatagoniK, I would like a quote.', 'Date: ' + (fecha || 'to be confirmed'), 'Guests: ' + (pax || 'to be confirmed'), 'Experience: ' + (experiencia || 'I need a recommendation'), 'Modality: ' + (modalidad || 'to be confirmed')]
          : lang === 'pt'
            /* Decía `modalidade` (sin declarar): enviar el formulario en
               portugués lanzaba ReferenceError y no se abría WhatsApp. */
            ? ['Olá PatagoniK, gostaria de fazer uma cotação.', 'Data: ' + (fecha || 'a confirmar'), 'Passageiros: ' + (pax || 'a confirmar'), 'Experiência: ' + (experiencia || 'preciso de recomendação'), 'Modalidade: ' + (modalidad || 'a confirmar')]
            : ['Hola PatagoniK, me gustaría cotizar una experiencia.', 'Fecha: ' + (fecha || 'por confirmar'), 'Pasajeros: ' + (pax || 'por confirmar'), 'Experiencia: ' + (experiencia || 'necesito recomendación'), 'Modalidad: ' + (modalidad || 'por confirmar')];

        this.trackEvent('quote_submit', { experience: experiencia || 'sin_seleccionar', modality: modalidad || 'sin_seleccionar' });
        const url = 'https://wa.me/56931712780?text=' + encodeURIComponent(lines.join('\n'));
        window.open(url, '_blank', 'noopener');
      });
    }

    /* Ahora el quiz y el formulario viven en la misma sección, así que el CTA
       ya no navega a otra parte: sólo baja al formulario, que llega con la
       experiencia recomendada ya elegida (ver prefillQuoteExperience). */
    const quizCta = this.one('#pk-quiz-cta');
    if (quizCta) {
      this.on(quizCta, 'click', (e) => {
        e.preventDefault();
        this.prefillQuoteExperience();
        const form = this.one('#pk-quote-form');
        if (form && form.scrollIntoView) {
          form.scrollIntoView({ behavior: this.reduced ? 'auto' : 'smooth', block: 'center' });
        }
        const sel = this.one('#pk-quote-experience');
        if (sel) setTimeout(() => { try { sel.focus({ preventScroll: true }); } catch (err) {} }, 320);
      });
    }
  }

  /* C2 — puente quiz → formulario: la primera recomendación queda
     preseleccionada en #pk-quote-experience para no preguntar dos veces lo
     mismo. Sólo se pisa la selección si el usuario aún no eligió a mano. */
  prefillQuoteExperience(force) {
    const sel = this.one('#pk-quote-experience');
    const first = (this.quizRecommendations || [])[0];
    if (!sel || !first) return;
    if (!force && sel.value && sel.dataset.pkAuto !== '1') return;
    const match = Array.from(sel.options).find(o => o.textContent.trim() === first);
    if (!match) return;
    sel.value = match.value || match.textContent;
    sel.dataset.pkAuto = '1';
    sel.dispatchEvent(new Event('change', { bubbles: true }));
  }

  renderQuizResult() {
    const s = this.quizState || {};
    if (!s.interest || !s.level || !s.days) return;

    let recs;
    if (s.interest === 'fauna') {
      recs = ['Laguna Cebolla + Avistamiento de Fauna', 'Excursiones de avistamiento de fauna', 'Aonikenk + Laguna Azul'];
    } else if (s.interest === 'glaciares') {
      recs = ['Glaciar Grey en navegación', 'Navegación Balmaceda & Serrano', 'Full Day Perito Moreno'];
    } else if (s.interest === 'tranquilo') {
      recs = ['Full Day Perspectivas + Cueva del Milodón', 'Navegación Balmaceda & Serrano', 'Glaciar Grey en navegación'];
    } else if (s.interest === 'paisajes') {
      recs = ['Full Day Perspectivas + Cueva del Milodón', 'Trekking Escénico Torres del Paine', 'Aonikenk + Laguna Azul'];
    } else {
      recs = s.level === 'exigente'
        ? ['Mirador Base Torres', 'Mirador Ferrier', 'Lazo – Weber']
        : s.level === 'suave'
          ? ['Trekking Escénico Torres del Paine', 'Aonikenk + Laguna Azul', 'Full Day Perspectivas + Cueva del Milodón']
          : ['Valle del Francés', 'Lazo – Weber', 'Trekking Escénico Torres del Paine'];
    }

    if (s.days === '4+') recs[2] = 'Excursiones especiales';
    this.quizRecommendations = recs;

    const wrap = this.one('#pk-quiz-result');
    const list = this.one('#pk-quiz-recs');
    if (!wrap || !list) return;
    list.innerHTML = '';
    recs.forEach(name => {
      const span = document.createElement('span');
      span.textContent = name;
      span.style.cssText = 'display:inline-flex;align-items:center;min-height:36px;padding:0 12px;border:1px solid rgba(245,242,236,.28);border-radius:999px;font-size:12px;';
      list.appendChild(span);
    });
    wrap.style.display = 'block';
    /* En cuanto hay recomendación, el formulario de abajo ya la trae puesta. */
    this.prefillQuoteExperience();
    this.trackEvent('quiz_complete', { interest:s.interest, level:s.level, days:s.days, recommendation:recs[0] });
  }

  setLangMenu(open) {
    const menu = this.one('[data-langmenu]');
    const toggle = this.one('[data-langtoggle]');
    if (!menu || !toggle) return;
    this.langOpen = !!open;
    const chev = toggle.querySelector('[data-langchev]');
    menu.style.opacity = open ? '1' : '0';
    menu.style.visibility = open ? 'visible' : 'hidden';
    menu.style.transform = open ? 'translateY(0)' : 'translateY(-6px)';
    toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    if (chev) chev.style.transform = open ? 'rotate(180deg)' : 'rotate(0deg)';
  }

  setMenu(open) {
    const menu = this.one('[data-menu]');
    const toggle = this.one('[data-menu-toggle]');
    if (!menu || !toggle) return;
    this.menuOpen = !!open;
    menu.style.opacity = open ? '1' : '0';
    menu.style.visibility = open ? 'visible' : 'hidden';
    menu.style.transform = open ? 'translateY(0) scale(1)' : 'translateY(-10px) scale(.985)';
    toggle.setAttribute('aria-expanded', open ? 'true' : 'false');

    const b1 = toggle.querySelector('[data-bar1]');
    const b2 = toggle.querySelector('[data-bar2]');
    if (b1) b1.style.transform = open ? 'translateY(3px) rotate(45deg)' : 'none';
    if (b2) b2.style.transform = open ? 'translateY(-3px) rotate(-45deg)' : 'none';

    this.q('[data-menu-link]').forEach((a, i) => {
      a.style.transitionDelay = open ? (0.03 + i * 0.025).toFixed(3) + 's' : '0s';
      a.style.opacity = open ? '1' : '0';
      a.style.transform = open ? 'none' : 'translateY(-5px)';
    });

    /* El panel es pequeño: no bloqueamos el scroll ni alteramos toda la cabecera. */
    if (this.paintHeader) this.paintHeader();
    try { document.body.style.overflow = ''; } catch (e) {}
  }

  setupReveals() {
    const targets = this.q('[data-reveal]');
    const show = el => {
      el.style.opacity = '1'; el.style.transform = 'none';
      el.querySelectorAll('[data-mask-inner]').forEach((s, i) => {
        s.style.transitionDelay = (i * 0.09).toFixed(2) + 's';
        s.style.transform = 'none';
      });
    };
    if (this.reduced || !('IntersectionObserver' in window)) { targets.forEach(show); return; }
    this.io = new IntersectionObserver((entries) => {
      entries.forEach(e => { if (e.isIntersecting) { show(e.target); this.io.unobserve(e.target); } });
    }, { rootMargin: '0px 0px -12% 0px', threshold: 0.08 });
    targets.forEach(el => this.io.observe(el));
    this.failsafe = setTimeout(() => targets.forEach(show), 4000);
  }

  setupParallax() {
    const items = this.q('[data-par]').map(el => ({ el, k: parseFloat(el.getAttribute('data-par')) || 0 }));
    if (!items.length || this.reduced) return;
    const strength = this.props.parallaxStrength != null ? this.props.parallaxStrength : 1;
    let ticking = false;
    const update = () => {
      const vh = window.innerHeight;
      items.forEach(({ el, k }) => {
        const p = el.parentElement;
        if (!p) return;
        const r = p.getBoundingClientRect();
        if (r.bottom < -200 || r.top > vh + 200) return;
        const progress = (r.top + r.height / 2 - vh / 2) / vh;
        el.style.transform = 'translate3d(0,' + (progress * k * strength * 100).toFixed(2) + 'px,0)';
      });
      ticking = false;
    };
    const onScroll = () => { if (!ticking) { ticking = true; requestAnimationFrame(update); } };
    this.on(window, 'scroll', onScroll, { passive: true });
    this.on(window, 'resize', onScroll, { passive: true });
    update();
  }

  /* Narrow screens: logo and language live in the full-screen menu, not the bar */
  setupHeaderFit() {
    const logo = this.one('[data-hdr-logo]');
    const lang = this.one('[data-langtoggle]');
    const cta = this.one('[data-hdr-cta]');
    const fit = () => {
      const narrow = window.innerWidth < 680;
      if (logo) logo.style.display = narrow ? 'none' : 'block';
      if (lang && lang.parentElement) lang.parentElement.style.display = narrow ? 'none' : 'block';
      if (cta) { cta.style.padding = narrow ? '0 15px' : '0 17px'; cta.style.gap = narrow ? '7px' : '9px'; }
      if (narrow) this.setLangMenu(false);
    };
    fit();
    this.on(window, 'resize', fit, { passive: true });
  }

  setupHeader() {
    const hdr = this.one('[data-hdr]');
    if (!hdr) return;
    const paint = (force) => {
      const sections = this.q('[data-nav]');
      const y = hdr.getBoundingClientRect().bottom - 8;
      let theme = force || this.lastTheme || 'dark';
      if (!force) {
        for (const s of sections) {
          const r = s.getBoundingClientRect();
          if (r.top <= y && r.bottom >= y) theme = s.getAttribute('data-nav');
        }
      }
      this.lastTheme = theme;
      const onDark = theme === 'dark';
      hdr.style.color = onDark ? '#F5F2EC' : '#2B2B2B';
      const scrolled = window.scrollY > 40 && !this.menuOpen;
      hdr.style.backgroundColor = scrolled
        ? (onDark ? 'rgba(26,29,27,.28)' : 'rgba(245,242,236,.9)')
        : 'transparent';
      hdr.style.backdropFilter = scrolled ? 'saturate(140%) blur(12px)' : 'none';
      hdr.style.webkitBackdropFilter = hdr.style.backdropFilter;
    };
    this.paintHeader = paint;
    this.on(window, 'scroll', () => paint(), { passive: true });
    this.on(window, 'resize', () => paint(), { passive: true });
    paint();
  }

  /* Fullscreen video → cream sheet rises → video lands as the Franja 1 strip →
     franjas 1, 2 and 3 reveal in sequence. */
  setupStage() {
    const stage = this.one('[data-stage]');
    const sticky = this.one('[data-stage-sticky]');
    const sheet = this.one('[data-sheet]');
    const frame = this.one('[data-video-frame]');
    const scrim = this.one('[data-video-scrim]');
    const slot = this.one('[data-video-slot]');
    const f1 = this.one('[data-franja="1"]');
    const f2 = this.one('[data-franja="2"]');
    const f1text = this.one('[data-f1-text]');
    const f2img = this.one('[data-f2-img]');
    const f2text = this.one('[data-f2-text]');
    const f3text = this.one('[data-f3-text]');
    const centerLogo = this.one('[data-center-logo]');
    const hdrLogo = this.one('[data-hdr-logo]');
    const hint = this.one('[data-scroll-hint]');
    if (!stage || !frame || !slot || !sticky) return;

    const LAND = 0.52;
    let ticking = false;

    const update = () => {
      /* Fuera de la portada el hero está oculto: sus medidas son cero y la
         animación acabaría poniendo el logo de la cabecera en opacity 0 sobre
         una vista que sí lo necesita visible. */
      if (this.currentRoute && this.currentRoute !== '/') { ticking = false; return; }
      const vw = window.innerWidth;
      const cols = vw >= WIDE_BP ? COLS.wide : COLS.narrow;
      if (f1) f1.style.gridTemplateColumns = cols.f1;
      if (f2) f2.style.gridTemplateColumns = cols.f2;

      const H = sticky.offsetHeight;
      const total = stage.offsetHeight - window.innerHeight;
      const p = total > 0 ? clamp01(-stage.getBoundingClientRect().top / total) : 0;
      const t = clamp01(p / LAND);

      const sRect = sticky.getBoundingClientRect();
      const gRect = slot.getBoundingClientRect();
      const gx = gRect.left - sRect.left, gy = gRect.top - sRect.top;

      const w = lerp(vw, gRect.width, easeInOut(t));
      const h = lerp(H, gRect.height, easeInOut(t));
      const cx = lerp(vw / 2, gx + gRect.width / 2, easeOut(t));
      const cy = lerp(H / 2, gy + gRect.height / 2, easeIn(t));
      frame.style.width = w.toFixed(1) + 'px';
      frame.style.height = h.toFixed(1) + 'px';
      frame.style.left = (cx - w / 2).toFixed(1) + 'px';
      frame.style.top = (cy - h / 2).toFixed(1) + 'px';
      if (scrim) scrim.style.opacity = String(clamp01(1 - t / 0.72));

      if (sheet) sheet.style.transform = 'translateY(' + ((1 - easeInOut(clamp01(p / (LAND * 0.94)))) * 100).toFixed(2) + '%)';
      if (hint) hint.style.opacity = String(clamp01(1 - p / 0.1));
      if (centerLogo) centerLogo.style.opacity = String(clamp01(1 - Math.max(0, p - 0.04) / 0.2));
      if (hdrLogo) {
        hdrLogo.style.opacity = String(clamp01((p - LAND * 0.72) / 0.18));
        hdrLogo.style.pointerEvents = p > LAND * 0.9 ? 'auto' : 'none';
      }

      const step = (from, span) => clamp01((p - from) / span);
      const slide = (el, prog, dist) => {
        if (!el) return;
        el.style.opacity = String(prog);
        el.style.transform = 'translateY(' + ((1 - prog) * dist).toFixed(1) + 'px)';
      };
      slide(f1text, step(LAND * 0.9, 0.14), 34);
      if (f2img) f2img.style.clipPath = 'inset(0 ' + ((1 - easeOut(step(0.66, 0.16))) * 100).toFixed(2) + '% 0 0)';
      slide(f2text, step(0.72, 0.13), 30);
      slide(f3text, step(0.84, 0.13), 34);

      const theme = p > 0.3 ? 'light' : 'dark';
      if (sticky.getAttribute('data-nav') !== theme) {
        sticky.setAttribute('data-nav', theme);
        if (this.paintHeader && !this.menuOpen) this.paintHeader();
      }
      ticking = false;
    };

    const onScroll = () => { if (!ticking) { ticking = true; requestAnimationFrame(update); } };
    this.on(window, 'scroll', onScroll, { passive: true });
    this.on(window, 'resize', onScroll, { passive: true });
    update();
    requestAnimationFrame(update);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(update).catch(() => {});
  }

  /* Green band as container: badge photo on its top edge, main photo overflowing its bottom */
  setupEsencia() {
    const sec = this.one('[data-esc]');
    if (!sec) return;
    const grid = this.one('[data-esc-grid]');
    const band = this.one('[data-esc-band]');
    const text = this.one('[data-esc-text]');
    const intro = this.one('[data-esc-intro]');
    const stack = this.one('[data-esc-stack]');
    const para = this.one('[data-esc-para]');
    const fill = this.one('[data-esc-green-fill]');
    const titleSpan = text && text.querySelector('[data-mask-inner]');
    const set = (el, o) => { if (el) Object.assign(el.style, o); };
    const CREAM = '#F5F2EC';

    /* Nuestra esencia sin fotografía superior. La composición se abre y
       mantiene la imagen principal sobre "Tu viaje, a tu ritmo". */
    const layout = () => {
      const wide = window.innerWidth >= WIDE_BP;
      set(grid, { gridTemplateColumns: wide ? 'repeat(12, 1fr)' : '1fr' });
      set(text, wide
        ? { gridColumn: '2 / 8', gridRow: '1', alignSelf: 'end', maxWidth: '560px', paddingTop: '34px' }
        : { gridColumn: '1', gridRow: 'auto', alignSelf: 'start', maxWidth: '560px', paddingTop: '28px' });
      set(stack, wide ? { gridColumn: '2 / 9', gridRow: '2' } : { gridColumn: '1', gridRow: 'auto' });
      set(para, wide
        ? { gridColumn: '9 / -1', gridRow: '2', alignSelf: 'center', marginTop: '0', color: 'rgba(245,242,236,.92)' }
        : { gridColumn: '1', gridRow: 'auto', alignSelf: 'start', marginTop: '0', color: 'rgba(43,43,43,.88)' });
      if (titleSpan) titleSpan.style.color = CREAM;
      set(intro, { color: 'rgba(245,242,236,.82)' });

      if (band && text && stack) {
        let sr = sec.getBoundingClientRect();
        const tr = text.getBoundingClientRect();
        const top = Math.max(28, tr.top - sr.top - (wide ? 28 : 18));
        band.style.top = Math.round(top) + 'px';

        sr = sec.getBoundingClientRect();
        const mr = stack.getBoundingClientRect();
        band.style.bottom = Math.round(sr.bottom - mr.bottom + mr.height * 0.2) + 'px';
      }
    };

    let ticking = false;
    const update = () => {
      if (fill && band) {
        const r = band.getBoundingClientRect();
        const p = clamp01((window.innerHeight * 0.92 - r.top) / Math.max(1, r.height * 0.55));
        fill.style.transform = 'translateY(' + ((1 - easeOut(p)) * 100).toFixed(1) + '%)';
      }
      ticking = false;
    };
    const onScroll = () => { if (!ticking) { ticking = true; requestAnimationFrame(update); } };

    layout();
    if (this.reduced) { if (fill) fill.style.transform = 'none'; }
    else { this.on(window, 'scroll', onScroll, { passive: true }); update(); }
    const relayout = () => { layout(); update(); };
    this.on(window, 'resize', relayout, { passive: true });
    requestAnimationFrame(relayout);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(relayout).catch(() => {});
    if (window.ResizeObserver) { const ro = new ResizeObserver(relayout); ro.observe(sec); }
  }

  /* C3 — Carrusel de experiencias.

     El track de escritorio y el de móvil son ahora scrollers horizontales
     normales, así que ambos se manejan con el mismo controlador: las flechas
     desplazan una tarjeta por click y se deshabilitan al llegar a cada
     extremo. */
  setupExperienceCarousel() {
    this.mountCarousel({
      track: this.one('#tours [data-hs-track]'),
      arrowsInto: this.one('#tours [data-hs-sticky]'),
      bar: this.one('[data-hs-bar]')
    });
    this.mountCarousel({
      track: this.one('#pk-mobile-exp-track'),
      arrowsInto: this.one('#tours-mobile')
    });
  }

  mountCarousel({ track, arrowsInto, bar }) {
    if (!track || !arrowsInto) return;

    const arrows = document.createElement('div');
    arrows.className = 'pk-exp-arrows';

    const mk = (dir, glyph, key, esLabel) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'pk-exp-arrow';
      b.dataset.dir = dir;
      b.textContent = glyph;
      /* data-t-attr hace que setLang() traduzca la etiqueta accesible junto
         con el resto de la página. cacheSpanish() la indexa más abajo. */
      b.setAttribute('aria-label', esLabel);
      b.setAttribute('data-t-attr', 'aria-label:' + key);
      arrows.appendChild(b);
      return b;
    };
    const prev = mk('-1', '←', 'exp.arrow.prev', 'Ver experiencias anteriores');
    const next = mk('1', '→', 'exp.arrow.next', 'Ver más experiencias');

    arrowsInto.appendChild(arrows);
    /* Se indexan y traducen después de inyectarlas: el barrido inicial de
       cacheSpanish() ya había pasado cuando estos botones no existían. */

    /* Un "paso" es el ancho de una tarjeta más el gap. Se mide en vivo porque
       las tarjetas usan clamp() y el gap depende del viewport. */
    const step = () => {
      const card = track.querySelector('[data-hs-card], [data-exp-detail]');
      if (!card) return Math.max(240, track.clientWidth * 0.8);
      const gap = parseFloat(getComputedStyle(track).columnGap || '0') || 0;
      return card.getBoundingClientRect().width + gap;
    };

    /* scrollLeft es fraccionario y el snap deja restos de sub-píxel, así que
       los extremos se comparan con una tolerancia. */
    const EDGE = 2;
    const sync = () => {
      const max = track.scrollWidth - track.clientWidth;
      const x = track.scrollLeft;
      prev.disabled = x <= EDGE;
      next.disabled = x >= max - EDGE;
      /* Sin recorrido (viewport ancho, pocas tarjetas) no hay nada que
         navegar: se ocultan las dos flechas en vez de dejarlas muertas. */
      arrows.style.display = max > EDGE ? '' : 'none';
      if (bar) bar.style.transform = 'scaleX(' + Math.max(0.02, max > 0 ? x / max : 0).toFixed(3) + ')';
    };

    const go = (dir) => {
      track.scrollBy({ left: dir * step(), behavior: this.reduced ? 'auto' : 'smooth' });
    };

    this.on(prev, 'click', () => go(-1));
    this.on(next, 'click', () => go(1));

    /* Flechas del teclado cuando el foco está dentro del carrusel. El track
       recibe tabindex para que sea alcanzable y anunciable. */
    track.setAttribute('tabindex', '0');
    track.setAttribute('role', 'region');
    this.on(track, 'keydown', (e) => {
      if (e.key === 'ArrowRight') { e.preventDefault(); go(1); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); go(-1); }
    });

    this.on(track, 'scroll', sync, { passive: true });
    this.on(window, 'resize', sync, { passive: true });
    sync();
    requestAnimationFrame(sync);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(sync).catch(() => {});
    this.carouselSync = (this.carouselSync || []).concat(sync);
  }

  /* Los clones desktop/móvil conservan data-lazy-*: se observan después de
     construirlos para que cada variante cargue sólo al acercarse al viewport. */
  setupLazyMedia() {
    const images = this.q('img[data-lazy-media]');
    if (!images.length) return;

    const load = (img) => {
      const srcset = img.getAttribute('data-lazy-srcset');
      const src = img.getAttribute('data-lazy-src');
      if (srcset) img.setAttribute('srcset', srcset);
      if (src) img.setAttribute('src', src);
      img.removeAttribute('data-lazy-srcset');
      img.removeAttribute('data-lazy-src');
      img.removeAttribute('data-lazy-media');
    };

    if (!('IntersectionObserver' in window)) {
      images.forEach(load);
      return;
    }

    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        load(entry.target);
        observer.unobserve(entry.target);
      });
    }, { rootMargin: '480px 0px' });
    images.forEach((img) => observer.observe(img));
    (this.cleanups = this.cleanups || []).push(() => observer.disconnect());
  }

  /* El hero sólo descarga vídeo cuando se aproxima al viewport. Respeta tanto
     reduced-motion como Save-Data y deja visible el poster en esos casos. */
  setupHeroVideo() {
    const frame = this.one('[data-video-frame]');
    const vid = this.one('[data-hero-video]');
    if (!frame || !vid) return;
    const src = vid.getAttribute('data-src');
    if (!src) return;
    vid.muted = true;
    vid.defaultMuted = true;
    vid.loop = true;
    vid.playsInline = true;
    vid.setAttribute('muted', '');
    const slot = frame.querySelector('image-slot');
    const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    const conserveData = this.reduced || !!(connection && connection.saveData);
    if (conserveData) return;

    let attached = false;
    const attach = () => {
      if (attached) return;
      attached = true;
      vid.src = src;
      vid.removeAttribute('data-src');
      vid.load();
    };
    const play = () => {
      attach();
      const promise = vid.play();
      if (promise && promise.catch) promise.catch(() => {});
    };
    this.on(vid, 'loadeddata', () => { if (slot) slot.style.display = 'none'; }, { once: true });

    if (!('IntersectionObserver' in window)) {
      play();
      return;
    }
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry) return;
      if (entry.isIntersecting) play();
      else if (!vid.paused) vid.pause();
    }, { rootMargin: '180px 0px', threshold: 0.01 });
    observer.observe(frame);
    (this.cleanups = this.cleanups || []).push(() => observer.disconnect());
  }

  /* Translucent arrow cursor over the gallery cards */
  setupCardCursor() {
    const cur = this.one('[data-cursor]');
    if (!cur) return;
    if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) { cur.style.display = 'none'; return; }
    /* Seguimiento con inercia: el aro persigue al puntero en vez de saltar,
       que es lo que hacía que el detalle se leyera como un parche. */
    let tx = 0, ty = 0, x = 0, y = 0, over = false, press = false, raf = 0;
    const tick = () => {
      x += (tx - x) * .17;
      y += (ty - y) * .17;
      const s = over ? (press ? .84 : 1) : .28;
      cur.style.transform = 'translate(' + x.toFixed(1) + 'px,' + y.toFixed(1) + 'px) translate(-50%,-50%) scale(' + s + ')';
      raf = requestAnimationFrame(tick);
    };
    this.on(document, 'pointermove', (e) => {
      tx = e.clientX; ty = e.clientY;
      const on = !!(e.target && e.target.closest && e.target.closest('[data-hs-card]'));
      if (on !== over) { over = on; cur.style.opacity = on ? '1' : '0'; }
      if (!raf) { x = tx; y = ty; raf = requestAnimationFrame(tick); }
    }, { passive: true });
    this.on(document, 'pointerdown', () => { press = true; });
    this.on(document, 'pointerup', () => { press = false; });
  }



setupSectionSmoothIn() {
  const selectors = [
    /* C2: la sección fusionada aparece una sola vez. Antes había dos entradas
       (#selector y #pk-quote-layout) y por tanto dos revelados encadenados. */
    '#cotiza > div:not(#pk-quote-overlay)',
    '#diferenciadores > div',
    '#nosotros > div',
    '#resenas > div',
    '#faq > div',
    'footer#contacto > div'
  ];
  const targets = selectors.map(sel => this.one(sel)).filter(Boolean);
  if (!targets.length) return;

  const show = (el) => el.classList.add('is-visible');
  targets.forEach(el => el.setAttribute('data-auto-reveal', ''));

  if (this.reduced || !('IntersectionObserver' in window)) {
    targets.forEach(show);
    return;
  }

  const io = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        show(entry.target);
        io.unobserve(entry.target);
      }
    });
  }, { rootMargin: '0px 0px -10% 0px', threshold: 0.1 });

  targets.forEach(el => io.observe(el));
  (this.cleanups = this.cleanups || []).push(() => io.disconnect());
}

setupVisualCleanupV47() {
  const selectors = [
    '#cotiza > div:not(#pk-quote-overlay)',
    '#diferenciadores > div',
    '#nosotros > div',
    '#resenas > div',
    '#faq > div',
    'footer#contacto > div'
  ];
  const targets = selectors.map(s => this.one(s)).filter(Boolean);
  targets.forEach(el => el.setAttribute('data-clean-reveal',''));

  const show = el => el.classList.add('is-visible');
  if (this.reduced || !('IntersectionObserver' in window)) {
    targets.forEach(show);
    return;
  }

  const io = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        show(entry.target);
        io.unobserve(entry.target);
      }
    });
  }, { rootMargin:'0px 0px -8% 0px', threshold:.08 });

  targets.forEach(el => io.observe(el));
  (this.cleanups = this.cleanups || []).push(() => io.disconnect());
}

setupReviewsMoreV47() {
  const section = this.one('#resenas');
  const grid = this.one('#pk-review-grid');
  const google = this.one('#google-reviews');
  if (!section || !grid) return;

  const cards = Array.from(grid.children);
  if (cards.length > 3) {
    cards.slice(3).forEach(card => { card.style.display = 'none'; });
  }

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.id = 'pk-reviews-more-v47';
  btn.textContent = 'Ver más reseñas';
  grid.insertAdjacentElement('afterend', btn);

  let open = false;
  this.on(btn, 'click', () => {
    open = !open;
    cards.slice(3).forEach(card => { card.style.display = open ? '' : 'none'; });
    if (google) google.style.display = open ? 'block' : 'none';
    btn.textContent = open ? 'Ver menos reseñas' : 'Ver más reseñas';

    if (!open) {
      const heading = section.querySelector('h3');
      if (heading && heading.scrollIntoView) {
        heading.scrollIntoView({ behavior:'smooth', block:'start' });
      }
    }
  });
}

  renderVals() { return {}; }
}

/* Props que antes inyectaba el editor de Design. */
const ui = new PatagonikUI({
  whatsappNumber: '56931712780',
  accentColor: '#6B7A5E',
  parallaxStrength: 1,
});

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => ui.componentDidMount());
} else {
  ui.componentDidMount();
}
