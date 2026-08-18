# PatagoniK

Sitio de PatagoniK en **Astro + TypeScript**, desplegado en **Vercel**.

```
src/
  content/
    experiences/     16 experiencias, una por archivo, con es/en/pt dentro
    testimonials/    reseñas reales de pasajeros
  content.config.ts  schema zod de ambas colecciones
  i18n/
    routes.ts        segmentos de URL por idioma (única fuente de verdad)
    index.ts         t(), fallback a español y aviso en desarrollo
    ui.generated.json  ← lo reescribe el exportador; no editar a mano
    ui.overrides.json  ← textos propios de esta versión; gana sobre lo generado
  layouts/           BaseLayout: canonical, hreflang, Open Graph
  components/        Header, Footer, ExperienceCard + páginas
  pages/[...path].astro   una sola ruta genera las 57 páginas
scripts/
  check-i18n.mjs     rompe el build si una clave llega al HTML sin resolver
design/              el bundle de Claude Design: fuente de la que se migró
```

## Comandos

```bash
npm run dev       # servidor local
npm run build     # build + comprobación de i18n
npm run check     # astro check + tsc
npm run content:export   # re-vuelca el contenido desde design/src/template.html
```

## Cómo está montado el multi-idioma

Español en la raíz, inglés y portugués con prefijo, y **el segmento traducido**:

| | es | en | pt |
|---|---|---|---|
| inicio | `/` | `/en/` | `/pt/` |
| experiencias | `/experiencias` | `/en/experiences` | `/pt/experiencias` |
| quiénes somos | `/quienes-somos` | `/en/about-us` | `/pt/quem-somos` |
| preguntas | `/preguntas-frecuentes` | `/en/faq` | `/pt/perguntas-frequentes` |
| experiencia | `/experiencias/:slug` | `/en/experiences/:slug` | `/pt/experiencias/:slug` |

El menú sale de una tabla en `scripts/port-markup.mjs` (`rewriteMenu`), en
orden jerárquico: navegar → conocer → contactar, y **Cotiza tu viaje al
final** como CTA. Los anclas (`#cotiza`, `#contacto`) apuntan a la portada
con ruta absoluta, para que también funcionen desde otra página.

Los segmentos salen de `src/i18n/routes.ts`; cambiarlos ahí cambia las URLs y
el `hreflang` a la vez, que es lo que evita que se desincronicen.

En el bundle los tres idiomas compartían una sola URL y se conmutaban por JS,
así que un buscador sólo veía la versión en español. Ahora cada idioma es una
página indexable y el selector de idioma es navegación real.

## Reglas del contenido

- **Una experiencia = un archivo.** Antes su texto vivía repartido en tres
  sitios (el DOM para el español de la tarjeta, `EXPERIENCE_DATA` para el
  detalle, `EXPERIENCE_I18N` para en/pt).
- **El schema exige paridad de forma** entre idiomas: mismo número de `facts`,
  `includes` y `excludes`. Una traducción incompleta rompe el build en vez de
  publicar una ficha coherente a medias.
- **Las reseñas no se traducen.** Son palabras de una persona real; se guarda
  el idioma en que se escribieron y la página lo indica cuando no coincide con
  el del visitante.

## Pendiente

- **Fotos.** `src/components/ExperienceCard.astro` tiene el hueco marcado con
  `data-image`; cuando lleguen, entra `<Image>` de `astro:assets` y genera
  `srcset` y formatos modernos.
- **GA4 y captura de leads** — a la espera de decisión del cliente. Hoy el
  formulario abre WhatsApp y no guarda nada.

## El diseño

Está portado desde `design/` con tres scripts, reproducibles con `npm run port`:

| | |
|---|---|
| `port-design.mjs` | tipografías y fotos a `public/`, los 51 bloques `<style>` a `src/styles/design.css` **en su orden** |
| `port-markup.mjs` | el marcado de cada sección a `src/components/design/*.astro` |
| `port-behaviour.mjs` | el script del diseño, sin el runtime de Claude Design |

**Re-ejecutar `npm run port` sobrescribe lo generado.** Si el diseño cambia en
Claude Design: exportar el bundle, `python3 design/tools/unpack.py <bundle>
--out design/src`, y volver a portar.

Detalles que conviene no re-descubrir:

- Los `<image-slot>` se conservan como elemento: 17 reglas del CSS los
  seleccionan por nombre e id.
- `setupDesktopExperiences` no se puede quitar del script: reconstruye cada
  tarjeta con los atributos `data-desktop-exp-*` de los que depende el CSS.
- El diseño usa `<sc-raw-select>` y `sc-camel-view-box`, que resolvía el
  runtime; el port los normaliza.
