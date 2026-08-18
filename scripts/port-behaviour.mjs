/**
 * Trae los comportamientos del diseño (animación del hero, carrusel, revelados,
 * cabecera…) desde el script del bundle a un script de cliente de Astro.
 *
 * Se adapta el original en vez de reescribirlo: son 1963 líneas muy ajustadas
 * al diseño y reescribirlas "más limpias" es exactamente el error que dejó el
 * sitio sin diseño la primera vez.
 *
 * Lo que se deja fuera es sólo lo que Astro ya resuelve mejor:
 *   - router y rutas          -> ahora son páginas reales
 *   - setLang / cacheSpanish  -> cada idioma se renderiza en el servidor
 *   - clonado de tarjetas móviles -> el marcado ya viene renderizado
 *
 * Uso: node scripts/port-behaviour.mjs
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const template = readFileSync('design/src/template.html', 'utf8');

const open = template.indexOf('<script type="text/x-dc"');
const bodyStart = template.indexOf('>', template.indexOf('data-props="', open) + 12) + 1;
const js = template.slice(bodyStart, template.lastIndexOf('</script>'));

/** Recorta un método de la clase por conteo de llaves. */
function cutMethod(source, name) {
  const re = new RegExp(`\\n(\\s*)${name}\\s*\\([^)]*\\)\\s*\\{`);
  const m = re.exec(source);
  if (!m) return null;
  let depth = 0;
  let i = m.index + m[0].length - 1;
  for (; i < source.length; i++) {
    if (source[i] === '{') depth++;
    else if (source[i] === '}') {
      depth--;
      if (depth === 0) break;
    }
  }
  return { start: m.index, end: i + 1, text: source.slice(m.index, i + 1) };
}

/*
 * Métodos que ya no aplican: Astro los resuelve por otra vía.
 *
 * setupDesktopExperiences y setupMobileExperiences NO están aquí a propósito:
 * reconstruyen cada tarjeta en la estructura uniforme con
 * data-desktop-exp-image / -summary / -tech, y el CSS del diseño depende de
 * esos atributos. Sin ellos la tarjeta 2 conserva su título vertical y el
 * track móvil se queda vacío.
 */
const DROP = [
  'setupRouter', 'readRoute', 'normalizeRoute', 'detectRouteBase', 'routeHref',
  'navigateTo', 'renderRoute', 'mountRouteView', 'unmountRouteView',
  'applyRouteMeta', 'syncRouteLinks', 'setupExperienceRouting',
  'syncExperienceHash', 'clearExperienceHash',
  'setLang', 'applyLang', 'cacheSpanish', 'parseAttrKeys',
  'experienceContent', 'renderExperience', 'openExperience', 'closeExperience',
];

let out = js;
const dropped = [];
for (const name of DROP) {
  const cut = cutMethod(out, name);
  if (cut) {
    out = out.slice(0, cut.start) + out.slice(cut.end);
    dropped.push(name);
  }
}

// Las llamadas a lo eliminado se quitan del arranque.
for (const name of dropped) {
  out = out.replace(new RegExp(`\\n\\s*this\\.${name}\\([^)]*\\);`, 'g'), '');
}
// El selector de idioma y los enlaces de ruta pasan a ser enlaces reales:
// Astro sirve una URL por idioma y por página, así que estos manejadores de
// click sobran y encima interceptarían la navegación.
out = out.replace(
  /\n      const langBtn = near\(e, '\[data-lang\]'\);[\s\S]*?\n      \}\n(?=\s*if \(near\(e, '\[data-langtoggle\]'\)\))/,
  '\n',
);
out = out.replace(
  /\n      \/\* Enlaces de ruta[\s\S]*?const routeLink = near[\s\S]*?\n      \}\n/,
  '\n',
);
out = out.replace(
  /\n      \/\* Anclas de la portada[\s\S]*?const menuLink = near\(e, '\[data-menu-link\]'\);\n      if \(menuLink\) \{[\s\S]*?\n      \}\n/,
  "\n      if (near(e, '[data-menu-link]')) { this.setMenu(false); return; }\n",
);

// El popup del mapa leía EXPERIENCE_DATA; ahora los datos los inyecta Astro
// desde la content collection, ya en el idioma de la página.
out = out.replace(/EXPERIENCE_DATA\[key\]\|\|\{\}/g, '(window.__PK_EXPERIENCES || {})[key] || {}');

/**
 * Borra `const NOMBRE = {...};` contando llaves.
 *
 * Con expresión regular no vale: HTML_LANG es de una sola línea y un patrón
 * perezoso hasta el siguiente "\n};" se lleva por delante todo lo que haya en
 * medio — que es como desaparecieron WIDE_BP, COLS y los colores de flecha.
 */
function cutConst(source, name) {
  const m = new RegExp(`\\nconst ${name}\\s*=\\s*\\{`).exec(source);
  if (!m) return source;
  let depth = 0;
  let i = m.index + m[0].length - 1;
  for (; i < source.length; i++) {
    if (source[i] === '{') depth++;
    else if (source[i] === '}') {
      depth--;
      if (depth === 0) break;
    }
  }
  const end = source.indexOf(';', i) + 1;
  return source.slice(0, m.index) + source.slice(end);
}

// Los datos de experiencias y el diccionario ya viven en las content
// collections; el resto de constantes del diseño se queda.
for (const konst of ['EXPERIENCE_DATA', 'EXPERIENCE_I18N', 'EXPERIENCE_SLUGS', 'EXPERIENCE_LABELS', 'I18N', 'WA_MSG', 'LANG_CODE', 'HTML_LANG', 'ROUTES']) {
  out = cutConst(out, konst);
}
out = out.replace(/\nconst EXPERIENCE_SLUGS_REVERSE = [^\n]*\n/, '\n');

// La clase deja de extender el runtime de Claude Design y se instancia sola.
out = out.replace(
  /class Component extends DCLogic \{/,
  `class PatagonikUI {
  constructor(props) {
    this.props = props || {};
  }`,
);

const script = `/*
  Generado por scripts/port-behaviour.mjs — no editar a mano.

  Comportamientos del diseño original de PatagoniK, adaptados para correr sin
  el runtime de Claude Design. Métodos retirados por innecesarios en Astro:
  ${dropped.join(', ')}.
*/
${out.trim()}

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
`;

mkdirSync('src/scripts', { recursive: true });
writeFileSync('src/scripts/design-behaviour.js', script);

console.log(`retirados : ${dropped.length} métodos`);
console.log(`resultado : ${script.split('\n').length} líneas -> src/scripts/design-behaviour.js`);
