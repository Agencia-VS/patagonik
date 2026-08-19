/**
 * Trae el marcado real de las secciones del bundle a componentes Astro.
 *
 * Dos conversiones y nada más — la idea es no reinterpretar el diseño:
 *
 *   <image-slot id="pt-exp-1" src="uuid">   ->  el mismo <image-slot> con un
 *                                               <img> dentro apuntando a
 *                                               /images/exp-1.webp
 *
 *   <p data-t="hero.sub">texto español</p>  ->  <p data-t="hero.sub">{t('hero.sub')}</p>
 *
 * El <image-slot> se conserva como envoltorio a propósito: hay 17 reglas del
 * CSS original que lo seleccionan por nombre de elemento y por id, y
 * cambiarlo por un <img> las rompería todas.
 *
 * Uso: node scripts/port-markup.mjs
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const template = readFileSync('design/src/template.html', 'utf8');

/**
 * Copia del template con el CUERPO de <script> y <style> sustituido por
 * espacios, conservando las posiciones.
 *
 * Hace falta por dos motivos: las vistas de ruta viajan como HTML dentro de
 * <script type="text/html">, y los comentarios del archivo mencionan
 * etiquetas en prosa ("ahora hay un solo <section>"). Contando sobre el texto
 * crudo, ambas cosas cuentan como marcado y el recorte se pasa de largo.
 */
const blank = (s) => ' '.repeat(s.length);
const masked = template
  .replace(/(<(script|style)\b[^>]*>)([\s\S]*?)(<\/\2>)/g, (all, open, tag, body, close) => open + blank(body) + close)
  .replace(/<!--[\s\S]*?-->/g, blank);
const assetMap = JSON.parse(readFileSync('src/styles/asset-map.json', 'utf8'));

function slice(startMarker, endMarker, from = 0) {
  const i = template.indexOf(startMarker, from);
  if (i === -1) throw new Error(`no encuentro: ${startMarker}`);
  const j = template.indexOf(endMarker, i);
  if (j === -1) throw new Error(`no encuentro cierre de: ${startMarker}`);
  return template.slice(i, j);
}

/**
 * Recorta un elemento completo contando profundidad de etiquetas.
 *
 * Buscar el cierre por texto ("\n  </div>\n") falla en cuanto un hijo está
 * indentado igual que el padre: corta a media sección y el fragmento sale
 * descuadrado.
 */
function sliceElement(startMarker, tag) {
  const start = template.indexOf(startMarker);
  if (start === -1) throw new Error(`no encuentro: ${startMarker}`);
  const re = new RegExp(`<(/?)${tag}\\b[^>]*?(/?)>`, 'g');
  re.lastIndex = start;
  let depth = 0;
  // Se cuenta sobre la copia enmascarada, se recorta sobre el original.
  for (let m; (m = re.exec(masked)); ) {
    if (m[2]) continue;
    depth += m[1] ? -1 : 1;
    if (depth === 0) return template.slice(start, m.index + m[0].length);
  }
  throw new Error(`${startMarker}: no encuentro el </${tag}> que cierra`);
}

/**
 * Normaliza los elementos y atributos propios del runtime de Claude Design.
 *
 * En el bundle los resolvía su runtime en el navegador; en Astro se emite HTML
 * directamente, así que hay que dejarlos en su forma estándar. <sc-raw-select>
 * era lo que hacía que los desplegables salieran como listas abiertas: sin el
 * runtime, el navegador lo trata como un elemento desconocido y pinta las
 * <option> como texto suelto.
 */
function normalizeRuntimeTags(html) {
  const counts = {};
  const bump = (k) => (counts[k] = (counts[k] ?? 0) + 1);
  let out = html
    .replace(/<sc-raw-select\b/g, () => (bump('sc-raw-select'), '<select'))
    .replace(/<\/sc-raw-select>/g, '</select>')
    // viewBox distingue mayúsculas y el runtime lo transportaba "descamelizado".
    .replace(/\bsc-camel-view-box=/g, () => (bump('sc-camel-view-box'), 'viewBox='))
    // scrollLeft es una propiedad, no un atributo: la posición inicial del
    // carrusel la fija el script de comportamiento.
    .replace(/\s*\bsc-camel-scroll-left="[^"]*"/g, () => (bump('sc-camel-scroll-left'), ''));
  return [out, counts];
}

/** <image-slot src="uuid"> -> medio administrable o fallback local. */
function convertImageSlots(html, component) {
  let n = 0;
  const out = html.replace(
    /<image-slot([^>]*)><\/image-slot>/g,
    (all, attrs) => {
      const id = attrs.match(/\bid="([^"]*)"/)?.[1];
      const fit = attrs.match(/\bfit="([^"]*)"/)?.[1] ?? 'cover';
      const src = id ? assetMap[id] : undefined;
      const declared = attrs.match(/\bsrc="([^"]*)"/)?.[1];
      /* Un hueco sin src es intencionado (el vídeo del hero). Pero un slot que
         SÍ declara imagen y no encuentra ruta es un fallo silencioso: así se
         quedó "Nuestra Esencia" sin foto, porque su src venía como
         v20/img/<uuid>.webp y el mapa sólo reconocía el uuid pelado. */
      if (!src && declared) {
        throw new Error(`image-slot "${id}" declara src="${declared}" pero no hay imagen en el mapa`);
      }
      if (!src) return `<image-slot${attrs}></image-slot>`;
      n++;
      const keep = attrs.replace(/\s*\bsrc="[^"]*"/, '').replace(/\s*\bplaceholder="[^"]*"/, '');
      let editable = null;
      if (component === 'Landing') {
        const fixed = {
          'pt-band-valle': ["landing.band-valle", 'band'],
          'pt-exp-bg-extended': ["landing.experiences-background", 'experience-background'],
          'pt-exp-bg': ["landing.experiences-background", 'experience-background'],
          'pt-final-band': ["landing.final-cta", 'final-cta'],
        }[id];
        const experience = id?.match(/^pt-exp-(\d+)$/)?.[1];
        if (fixed) editable = `<CloudinaryImage asset={asset('${fixed[0]}')} locale={locale} preset="${fixed[1]}" decorative />`;
        else if (experience) editable = `<CloudinaryImage asset={experienceAsset(${experience})} locale={locale} preset="experience-card" decorative />`;
      } else if (component === 'AboutSections' && id === 'pt-esc-main') {
        editable = `<CloudinaryImage asset={asset('about.essence')} locale={locale} preset="essence" decorative />`;
      }
      // alt vacío: son fotos decorativas, el texto de la tarjeta va al lado.
      const child = editable ?? `<img src="${src}" alt="" loading="lazy" decoding="async" style="width:100%;height:100%;object-fit:${fit};display:block;" />`;
      return `<image-slot${keep}>${child}</image-slot>`;
    },
  );
  return [out, n];
}

function convertHero(html, component) {
  if (component !== 'Landing') return html;
  const hero = /<video\b[^>]*data-hero-video[^>]*><\/video>\s*<image-slot\b([^>]*\bid="pt-hero-video"[^>]*)><\/image-slot>/;
  if (!hero.test(html)) throw new Error('Landing: no encuentro el hero para conectarlo al catálogo de medios');
  return html.replace(hero, (_all, attrs) => {
    const keep = attrs.replace(/\s*\bplaceholder="[^"]*"/, '').replace(/\s*\bstyle="[^"]*"/, '');
    return `{heroAsset.resourceType === 'video' && <CloudinaryVideo asset={heroAsset} locale={locale} hero style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;display:block;" />}
          <image-slot${keep} style="display:block;width:100%;height:100%;">
            {heroAsset.resourceType === 'image' && <CloudinaryImage asset={heroAsset} locale={locale} preset="hero" loading="eager" decorative />}
          </image-slot>`;
  });
}

/** data-t="clave">texto<  ->  data-t="clave">{t('clave')}< */
function convertTranslations(html) {
  let n = 0;
  let out = html.replace(
    /(<(\w+)([^>]*\bdata-t="([^"]+)"[^>]*)>)([^<]*)(<\/\2>)/g,
    (all, open, tag, attrs, key, _text, close) => {
      n++;
      // tour.N.t/.s/.d/.c describen una experiencia y viven en la content
      // collection, no en el diccionario de UI: se resuelven con otro helper
      // para no duplicar la fuente de verdad.
      const tourKey = key.match(/^tour\.(\d+)\.([tsdc])$/);
      const expr = tourKey ? `tour('${tourKey[1]}', '${tourKey[2]}')` : `t('${key}')`;
      return `${open}{${expr}}${close}`;
    },
  );
  // Atributos traducibles (aria-label del cierre del modal, flechas…)
  out = out.replace(
    /\sdata-t-attr="([^"]+)"/g,
    (all, spec) => {
      const pairs = spec.split(',').map((p) => p.split(':').map((s) => s.trim()));
      return pairs.map(([attr, key]) => ` ${attr}={t('${key}')}`).join('') + ` data-t-attr="${spec}"`;
    },
  );
  // El atributo original queda duplicado; se quita el estático.
  out = out.replace(/\s(aria-label|title)="[^"]*"(?=[^>]*\1=\{)/g, '');
  return [out, n];
}

const VOID = new Set(['img', 'br', 'hr', 'input', 'meta', 'link', 'source', 'path', 'circle', 'rect', 'use', 'stop', 'polyline', 'line', 'ellipse', 'polygon']);

/** Comprueba que cada etiqueta abierta se cierra dentro del fragmento. */
function assertBalanced(name, rawHtml) {
  // Mismo criterio que el recorte: comentarios y cuerpos de script/style no
  // son marcado, aunque mencionen etiquetas.
  const html = rawHtml
    .replace(/(<(script|style)\b[^>]*>)([\s\S]*?)(<\/\2>)/g, (all, open, tag, body, close) => open + blank(body) + close)
    .replace(/<!--[\s\S]*?-->/g, blank);
  const stack = [];
  for (const m of html.matchAll(/<(\/?)([a-zA-Z][\w-]*)([^>]*?)(\/?)>/g)) {
    const [, closing, tag, attrs, selfClose] = m;
    const t = tag.toLowerCase();
    if (VOID.has(t) || selfClose) continue;
    if (closing) {
      const last = stack.pop();
      if (last !== t) {
        throw new Error(`${name}: <${last ?? 'nada'}> se cierra con </${t}> — fragmento descuadrado`);
      }
    } else {
      stack.push(t);
    }
  }
  if (stack.length) throw new Error(`${name}: sin cerrar -> ${stack.join(', ')}`);
}

/**
 * Sustituye la lista de enlaces del menú por una generada desde routes.ts.
 *
 * El marcado del diseño trae los href del bundle (/tabs/quienes-somos, y
 * anclas como #cotiza) y en Astro eso es 404 o sólo funciona en la portada.
 * Los estilos en línea de cada enlace se conservan tal cual: hay dos
 * variantes, la normal y la del CTA.
 */
function rewriteMenu(html) {
  const nav = html.match(/(<nav data-menu[^>]*>)([\s\S]*?)(<\/nav>)/);
  if (!nav) return [html, false];

  const links = [...nav[2].matchAll(/<a [^>]*data-menu-link[^>]*>[\s\S]*?<\/a>/g)];
  if (!links.length) return [html, false];

  const styleOf = (key) => {
    const hit = links.find((l) => l[0].includes(`data-t="${key}"`));
    return hit?.[0].match(/style="([^"]*)"/)?.[1] ?? '';
  };
  const plain = styleOf('menu.home');
  const cta = styleOf('menu.quote');

  const generated = `{MENU.map((item) => (
        <a
          data-menu-link
          href={item.href}
          aria-current={item.current ? 'page' : undefined}
          style={item.cta ? ${JSON.stringify(cta)} : ${JSON.stringify(plain)}}
        >{t(item.key)}</a>
      ))}`;

  const rest = nav[2].replace(/<a [^>]*data-menu-link[^>]*>[\s\S]*?<\/a>\s*/g, '');
  return [html.replace(nav[0], `${nav[1]}\n      ${generated}\n${rest}${nav[3]}`), true];
}

/** Quita el bloque del mapa del modal: fuera del alcance del proyecto. */
function stripMap(html) {
  const start = html.indexOf('<div id="pk-exp-map-wrap"');
  if (start === -1) return [html, false];
  let depth = 0;
  const re = /<(\/?)div\b[^>]*?(\/?)>/g;
  re.lastIndex = start;
  for (let m; (m = re.exec(html)); ) {
    if (m[2]) continue;
    depth += m[1] ? -1 : 1;
    if (depth === 0) return [html.slice(0, start) + html.slice(m.index + m[0].length), true];
  }
  return [html, false];
}

function toComponent(name, html, { imports = '' } = {}) {
  const [stripped, removedMap] = stripMap(html);
  html = stripped;
  assertBalanced(name, html);
  const [menued, hasMenu] = rewriteMenu(html);
  const [normalized, runtime] = normalizeRuntimeTags(menued);
  const [withImages, imgs] = convertImageSlots(normalized, name);
  const [withTextRaw, keys] = convertTranslations(withImages);
  const withText = convertHero(withTextRaw, name);
  const runtimeNote = Object.entries(runtime).map(([k, v]) => `${k}×${v}`).join(' ');
  const needsTour = /\btour\(/.test(withText);
  const usesMedia = name === 'Landing' || name === 'AboutSections';
  const mediaImports = usesMedia
    ? `import CloudinaryImage from '@/components/media/CloudinaryImage.astro';
${name === 'Landing' ? "import CloudinaryVideo from '@/components/media/CloudinaryVideo.astro';\n" : ''}import type { LandingAssetMap } from '@/lib/media/types';
`
    : '';
  const menuFrontmatter = hasMenu
    ? `
import { homePath, routePath } from '@/i18n/routes';

/* Orden jerárquico: primero navegar, luego conocer, y convertir al final.
   Los anclas apuntan a la portada para que también funcionen desde /faq. */
const home = homePath(locale);
const MENU = [
  { key: 'menu.home', href: home },
  { key: 'menu.tours', href: routePath('experiences', locale) },
  { key: 'menu.about', href: routePath('about', locale) },
  { key: 'menu.faq', href: routePath('faq', locale) },
  { key: 'menu.contact', href: home === '/' ? '/#contacto' : home + '#contacto' },
  { key: 'menu.quote', href: home === '/' ? '/#cotiza' : home + '#cotiza', cta: true },
].map((item) => ({ ...item, current: item.href === Astro.url.pathname }));
`
    : '';
  const body = `---
import type { Locale } from '@/content.config';
import { useTranslations } from '@/i18n';
${needsTour ? "import { getCollection } from 'astro:content';\n" : ''}${mediaImports}${imports}
interface Props { locale: Locale${usesMedia ? '; assets: LandingAssetMap' : ''} }
const { locale${usesMedia ? ', assets' : ''} } = Astro.props;
const t = useTranslations(locale);
${usesMedia ? `const asset = (slotKey: string) => {
  const value = assets[slotKey];
  if (!value) throw new Error(\`Asset requerido no encontrado: \${slotKey}\`);
  return value;
};
${name === 'Landing' ? "const heroAsset = asset('landing.hero');\n" : ''}` : ''}${menuFrontmatter}${
  needsTour
    ? `
/* Textos de tarjeta: vienen de la colección de experiencias, en el idioma de
   la página. El diseño los pedía como tour.N.t/.s/.d/.c. */
const experiences = await getCollection('experiences');
const byOrder = new Map(experiences.map((e) => [String(e.data.order), e.data.content[locale]]));
const slugByOrder = new Map(experiences.map((e) => [String(e.data.order), e.data.slug]));
const FIELD = { t: 'cardTitle', s: 'cardSummary', d: 'cardDetail', c: 'cardCategory' } as const;
const tour = (n: string, f: keyof typeof FIELD) => byOrder.get(n)?.[FIELD[f]] ?? '';
const experienceAsset = (order: number) => asset(\`experience.\${slugByOrder.get(String(order))}.cover\`);
`
    : ''
}---

${withText.trim()}
`;
  mkdirSync('src/components/design', { recursive: true });
  writeFileSync(`src/components/design/${name}.astro`, body);
  console.log(`${name.padEnd(18)} ${(withText.length / 1000).toFixed(1)} kB  ${imgs} imágenes  ${keys} textos${runtimeNote ? '  [' + runtimeNote + ']' : ''}${removedMap ? '  [mapa retirado]' : ''}`);
}

// ── secciones ────────────────────────────────────────────────────────────
toComponent('Landing', sliceElement('<div id="pk-landing">', 'div'));

const about = slice('<script type="text/html" data-route-view="/tabs/quienes-somos">', '\n</script>')
  .replace('<script type="text/html" data-route-view="/tabs/quienes-somos">', '');
toComponent('AboutSections', about);

const faq = slice('<script type="text/html" data-route-view="/tabs/faq">', '\n</script>')
  .replace('<script type="text/html" data-route-view="/tabs/faq">', '');
toComponent('FaqSection', faq);

// Cabecera, menú, modal y pie: viven fuera de #pk-landing.
// La cabecera y el menú son hermanos: se recortan por separado y se juntan.
toComponent('SiteHeader', sliceElement('<header data-hdr=""', 'header') + '\n' + sliceElement('<nav data-menu=""', 'nav'));

toComponent('ExperienceModal', sliceElement('<div id="pk-exp-modal"', 'div'));

toComponent('SiteFooter', sliceElement('<footer id="contacto"', 'footer'));
