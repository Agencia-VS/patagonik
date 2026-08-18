/*
  Generado por scripts/port-behaviour.mjs — no editar a mano.

  Comportamientos del diseño original de PatagoniK, adaptados para correr sin
  el runtime de Claude Design. Métodos retirados por innecesarios en Astro:
  setupRouter, readRoute, normalizeRoute, detectRouteBase, routeHref, navigateTo, renderRoute, mountRouteView, unmountRouteView, applyRouteMeta, syncRouteLinks, setupExperienceRouting, syncExperienceHash, clearExperienceHash, setLang, applyLang, cacheSpanish, parseAttrKeys, experienceContent, renderExperience, openExperience, closeExperience.
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
        return;
      }

      const expClose = near(e, '#pk-exp-close');
      if (expClose) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }

      const expModal = this.one('#pk-exp-modal');
      if (expModal && e.target === expModal) {
        e.preventDefault();
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

  /* Rellena el panel en el idioma activo. Se llama al abrir y de nuevo desde
     setLang(), para que cambiar de idioma con el modal abierto lo actualice
     en vez de dejarlo en el idioma con el que se abrió. */



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


  ensureLeaflet(done) {
    if (window.L) { done(); return; }
    if (!document.querySelector('link[data-pk-leaflet]')) {
      const l = document.createElement('link');
      l.rel = 'stylesheet';
      l.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
      l.setAttribute('data-pk-leaflet','1');
      document.head.appendChild(l);
    }
    let s = document.querySelector('script[data-pk-leaflet]');
    if (!s) {
      s = document.createElement('script');
      s.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
      s.async = true;
      s.setAttribute('data-pk-leaflet','1');
      document.head.appendChild(s);
    }
    if (window.L) { done(); return; }
    s.addEventListener('load', done, { once:true });
  }

  getExperienceMapData() {
    /* Trazados refinados visualmente a partir de hitos conocidos y cartografía pública.
       Para precisión de navegación deben reemplazarse por GPX/KML propios u oficiales. */
    return {
      '1': { type:'trail', name:'Base Torres · amanecer / regular', slug:'base-torres-amanecer-regular', color:'#8C5A43', coords:[[-50.9656,-72.8660],[-50.9634,-72.8752],[-50.9606,-72.8845],[-50.9574,-72.8958],[-50.9551,-72.9051],[-50.9511,-72.9167],[-50.9472,-72.9289],[-50.9444,-72.9395],[-50.9427,-72.9497]] },
      '2': { type:'trail', name:'Valle del Francés', slug:'valle-del-frances', color:'#556B5B', coords:[[-51.0728,-73.0945],[-51.0644,-73.0881],[-51.0555,-73.0832],[-51.0450,-73.0762],[-51.0340,-73.0680],[-51.0240,-73.0604],[-51.0150,-73.0550],[-51.0082,-73.0530],[-50.9995,-73.0500],[-50.9827,-73.0538]] },
      '3': { type:'nav', name:'Glaciar Grey en navegación', slug:'glaciar-grey-en-navegacion', color:'#4B7FA3', coords:[[-51.1240,-73.1180],[-51.1100,-73.1600],[-51.0950,-73.2050],[-51.0800,-73.2500],[-51.0650,-73.2850],[-51.0520,-73.3050]] },
      '6': { type:'trail', name:'Chorrillo Los Salmones', slug:'chorrillo-los-salmones', color:'#7C6A50', coords:[[-51.1230,-73.1150],[-51.1200,-73.1260],[-51.1160,-73.1370],[-51.1120,-73.1460],[-51.1090,-73.1530]] },
      '7': { type:'trail', name:'Aonikenk + Laguna Azul', slug:'aonikenk-laguna-azul', color:'#9C7653', coords:[[-51.0275,-72.7740],[-51.0150,-72.7660],[-51.0020,-72.7600],[-50.9850,-72.7540],[-50.9650,-72.7490],[-50.9450,-72.7440],[-50.9250,-72.7410],[-50.9050,-72.7370],[-50.8790,-72.7353]] },
      '8': { type:'nav', name:'Navegación Balmaceda & Serrano', slug:'balmaceda-serrano', color:'#3F7696', coords:[[-51.7300,-72.5100],[-51.8000,-72.6500],[-51.9000,-72.8000],[-52.0000,-72.9300],[-52.0800,-73.0500],[-52.1100,-73.1800],[-52.0900,-73.2900]] },
      '10': { type:'trail', name:'Laguna Cebolla', slug:'laguna-cebolla-avistamiento-de-fauna', color:'#6B7A5E', coords:[[-50.8790,-72.7353],[-50.8720,-72.7440],[-50.8650,-72.7540],[-50.8570,-72.7660],[-50.8500,-72.7780],[-50.8430,-72.7900]] },
      '11': { type:'trail', name:'Lazo – Weber', slug:'lazo-weber', color:'#7A6349', coords:[[-51.1232,-72.8219],[-51.1250,-72.8400],[-51.1300,-72.8600],[-51.1360,-72.8820],[-51.1420,-72.9050],[-51.1490,-72.9280],[-51.1560,-72.9480],[-51.1618,-72.9612]] },
      '12': { type:'trail', name:'Trekking Escénico', slug:'trekking-escenico-torres-del-paine', color:'#5D6578', coords:[[-51.0275,-72.7740],[-51.0360,-72.8200],[-51.0450,-72.8700],[-51.0560,-72.9200],[-51.0619,-73.0073],[-51.0483,-73.0123],[-51.0750,-73.0050],[-51.0958,-72.9838]] },
      '13': { type:'trail', name:'Mirador Ferrier', slug:'mirador-ferrier', color:'#4F5D45', coords:[[-51.1230,-73.1172],[-51.1240,-73.1230],[-51.1250,-73.1300],[-51.1260,-73.1370],[-51.1265,-73.1450],[-51.1265,-73.1544]] },
      '14': { type:'trail', name:'Paso La Feria – Weber', slug:'paso-la-feria-weber', color:'#6D5B48', coords:[[-51.1220,-72.8350],[-51.1270,-72.8580],[-51.1340,-72.8830],[-51.1420,-72.9100],[-51.1510,-72.9360],[-51.1618,-72.9612]] }
    };
  }

  setupExperienceMap() {
    const el = this.one('#pk-experience-map');
    if (!el) return;
    const routes = this.getExperienceMapData();

    this.ensureLeaflet(() => {
      if (!window.L || el._pkMapReady) return;
      el._pkMapReady = true;
      const map = L.map(el, { scrollWheelZoom:false, zoomControl:true }).setView([-51.03,-72.96], 9);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom:18, attribution:'&copy; OpenStreetMap contributors' }).addTo(map);

      const trailGroup = L.layerGroup().addTo(map);
      const navGroup = L.layerGroup().addTo(map);
      const refGroup = L.layerGroup().addTo(map);
      const boundaryGroup = L.layerGroup().addTo(map);
      const layers = {};
      const allBounds = [];

      /* Límite esquemático del área protegida: sirve para lectura general, no para navegación. */
      const parkBoundary = [[-50.80,-73.19],[-50.78,-72.88],[-50.83,-72.63],[-50.98,-72.55],[-51.17,-72.63],[-51.31,-72.82],[-51.30,-73.08],[-51.19,-73.29],[-50.98,-73.34],[-50.84,-73.28]];
      L.polygon(parkBoundary,{color:'#60736A',weight:2,opacity:.8,fillColor:'#8FA58F',fillOpacity:.08,dashArray:'7 6'}).bindTooltip('Parque Nacional Torres del Paine · límite esquemático').addTo(boundaryGroup);

      const refIcon = L.divIcon({className:'', html:'<div class="pk-map-ref-icon"></div>', iconSize:[12,12], iconAnchor:[6,6]});
      const refs = [
        {n:'Portería Laguna Amarga',c:[-50.979,-72.781]},
        {n:'Portería Sarmiento',c:[-51.046,-72.770]},
        {n:'Portería Serrano',c:[-51.175,-72.962]},
        {n:'Pudeto',c:[-51.073,-72.983]},
        {n:'Paine Grande',c:[-51.073,-73.095]},
        {n:'Sector Grey',c:[-51.123,-73.117]},
        {n:'Puerto Natales',c:[-51.726,-72.506]},
        {n:'El Calafate',c:[-50.337,-72.264]}
      ];
      refs.forEach(r=>L.marker(r.c,{icon:refIcon}).bindTooltip(r.n).addTo(refGroup));

      /* Conexión lacustre Pudeto – Paine Grande, útil para Valle del Francés. */
      L.polyline([[-51.073,-72.983],[-51.071,-73.020],[-51.072,-73.060],[-51.073,-73.095]],{color:'#4B7FA3',weight:3,opacity:.7,dashArray:'5 7'}).bindTooltip('Catamarán Pudeto – Paine Grande').addTo(navGroup);

      Object.entries(routes).forEach(([key,r]) => {
        const grp = r.type==='nav' ? navGroup : trailGroup;
        const line = L.polyline(r.coords,{color:r.color,weight:r.type==='nav'?4:5,opacity:.86,lineCap:'round',dashArray:r.type==='nav'?'7 7':null}).addTo(grp);
        const end=r.coords[r.coords.length-1];
        const marker=L.circleMarker(end,{radius:6,color:'#F5F2EC',weight:2,fillColor:r.color,fillOpacity:1}).addTo(grp);
        const d=(window.__PK_EXPERIENCES || {})[key] || {};
        const popup='<div><h3 class="pk-map-popup-title">'+r.name+'</h3><p class="pk-map-popup-copy">'+(d.lead||'Experiencia PatagoniK')+'</p><a class="pk-map-popup-link" href="#experiencia/'+r.slug+'">Ver experiencia →</a></div>';
        line.bindPopup(popup); marker.bindPopup(popup);
        layers[key]={line,marker,bounds:L.latLngBounds(r.coords)};
        r.coords.forEach(c=>allBounds.push(c));
      });

      L.control.layers(null,{
        'Senderos PatagoniK':trailGroup,
        'Navegaciones':navGroup,
        'Porterías y referencias':refGroup,
        'Límite del área protegida':boundaryGroup
      },{collapsed:true}).addTo(map);

      if (allBounds.length) map.fitBounds(allBounds,{padding:[24,24]});
      const activate=(key)=>{
        Object.entries(layers).forEach(([k,o])=>o.line.setStyle({weight:k===key?7:(routes[k].type==='nav'?4:5),opacity:k===key?1:.35}));
        this.q('[data-map-route]').forEach(b=>b.classList.toggle('is-active',b.getAttribute('data-map-route')===key));
        const o=layers[key];
        if(o){ map.fitBounds(o.bounds,{padding:[48,48],maxZoom:13}); o.marker.openPopup(); }
      };
      this.q('[data-map-route]').forEach(btn=>this.on(btn,'click',()=>activate(btn.getAttribute('data-map-route'))));
      Object.entries(layers).forEach(([key,o])=>{o.line.on('click',()=>activate(key));o.marker.on('click',()=>activate(key));});
      const loading=this.one('#pk-map-loading'); if(loading) loading.style.display='none';
      this.pkGeneralMap=map;
      setTimeout(()=>map.invalidateSize(),80);
    });
  }

  setupMiniExperienceMap(key) {
    const wrap=this.one('#pk-exp-map-wrap');
    const el=this.one('#pk-exp-mini-map');
    if(!wrap||!el) return;

    const views={
      '1':  {name:'Base Torres',              scale:2.45, x:-7,  y:13},
      '2':  {name:'Valle del Francés',        scale:2.35, x:17,  y:2},
      '3':  {name:'Navegación Grey',          scale:2.10, x:31,  y:-1},
      '6':  {name:'Sector Pingo · Chorrillo', scale:2.20, x:31,  y:-18},
      '7':  {name:'Aonikenk · Laguna Azul',   scale:2.05, x:-27, y:13},
      '10': {name:'Sector Laguna Cebolla',    scale:1.80, x:-30, y:18},
      '11': {name:'Sector Lazo – Weber',      scale:1.65, x:-20, y:-19},
      '12': {name:'Trekking Escénico',        scale:1.55, x:-5,  y:-5},
      '13': {name:'Mirador Ferrier',          scale:2.30, x:23,  y:-15},
      '14': {name:'Sector La Feria – Weber',  scale:1.70, x:-17, y:-17}
    };

    /*
      Resaltados sobre la misma cartografía oficial.
      Solo se dibujan donde el trazado del mapa base se reconoce con suficiente claridad.
    */
    const highlights={
      '1':  {kind:'trail', caption:'Base Torres · sendero oficial',
              points:[[847,543],[823,525],[801,506],[784,482],[767,454],[749,425],[733,396],[720,368],[706,348],[691,337]]},
      '2':  {kind:'trail', caption:'Valle del Francés · sendero oficial',
              points:[[552,695],[568,666],[587,634],[608,605],[629,577],[645,550],[653,520],[653,486],[647,454],[639,422]]},
      '3':  {kind:'nav', caption:'Glaciar Grey · navegación',
              points:[[558,785],[536,744],[515,705],[493,664],[472,623],[454,584],[441,553]]},
      '13': {kind:'trail', caption:'Mirador Ferrier · sendero oficial',
              points:[[509,784],[493,800],[476,812],[456,823],[435,831]]}
    };

    const excluded=new Set(['4','5','8','9','15','16']);
    const v=views[String(key)];
    const route=highlights[String(key)] || null;

    if(excluded.has(String(key))||!v){
      wrap.style.display='none';
      el.innerHTML='';
      return;
    }

    wrap.style.display='block';
    el.innerHTML='';

    const img=document.createElement('img');
    img.className='pk-official-map-image';
    img.alt='Mapa oficial del Parque Nacional Torres del Paine';
    img.src='v20/img/a7e10c1e-ac30-527d-9c3e-a13d5e31cb8c.webp';
    img.style.transform='translate('+v.x+'%, '+v.y+'%) scale('+v.scale+')';

    el.append(img);

    if(route && route.points && route.points.length>1){
      const ns='http://www.w3.org/2000/svg';
      const svg=document.createElementNS(ns,'svg');
      svg.classList.add('pk-official-map-overlay');
      svg.setAttribute('viewBox','0 0 1500 1151');
      svg.setAttribute('aria-hidden','true');
      svg.style.transform=img.style.transform;

      const pathData=route.points.map((p,i)=>(i?'L':'M')+p[0]+' '+p[1]).join(' ');

      const glow=document.createElementNS(ns,'path');
      glow.setAttribute('d',pathData);
      glow.setAttribute('class','pk-official-map-route-glow');

      const line=document.createElementNS(ns,'path');
      line.setAttribute('d',pathData);
      line.setAttribute('class','pk-official-map-route-line');
      line.setAttribute('data-kind',route.kind || 'trail');

      svg.append(glow,line);
      el.append(svg);
    }

    const shade=document.createElement('div');
    shade.className='pk-official-map-shade';

    const marker=document.createElement('div');
    marker.className='pk-official-map-marker';

    const label=document.createElement('div');
    label.className='pk-official-map-label';
    label.textContent=route && route.caption ? route.caption : v.name;

    el.append(shade,marker,label);
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

  /* Hero accepts an mp4: prop URL, or a video file dropped straight onto the frame */
  setupHeroVideo() {
    const frame = this.one('[data-video-frame]');
    const vid = this.one('[data-hero-video]');
    if (!frame || !vid) return;
    vid.muted = true;
    vid.defaultMuted = true;
    vid.loop = true;
    vid.playsInline = true;
    vid.setAttribute('muted', '');
    const slot = frame.querySelector('image-slot');
    const show = (src) => {
      vid.src = src;
      vid.style.display = 'block';
      if (slot) slot.style.display = 'none';
      vid.loop = true;
      const p = vid.play();
      if (p && p.catch) p.catch(() => {});
    };
    this.on(vid, 'ended', () => { vid.currentTime = 0; const p = vid.play(); if (p && p.catch) p.catch(() => {}); });
    this.on(vid, 'pause', () => {
      if (!vid.src || vid.style.display === 'none') return;
      if (vid.currentTime >= vid.duration - 0.15) { vid.currentTime = 0; }
      const p = vid.play(); if (p && p.catch) p.catch(() => {});
    });
    if (this.props.heroVideoUrl) show(this.props.heroVideoUrl);
    const isVid = (t) => !!t && t.indexOf('video/') === 0;
    this.on(frame, 'dragover', (e) => {
      const dt = e.dataTransfer;
      if (dt && Array.from(dt.items || []).some(i => isVid(i.type))) {
        e.preventDefault(); e.stopPropagation();
        dt.dropEffect = 'copy';
      }
    }, true);
    this.on(frame, 'drop', (e) => {
      const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      if (f && isVid(f.type)) { e.preventDefault(); e.stopPropagation(); show(URL.createObjectURL(f)); }
    }, true);
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
