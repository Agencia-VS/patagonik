# PatagoniK — landing

Fuente editable de la landing de PatagoniK y las herramientas para volver a
empaquetarla como un bundle de Claude Design.

## Por qué el repo está partido así

La landing venía como un único HTML de **21 MB**, que es lo que impedía
importarla de vuelta a una sesión de Design. Casi nada de ese peso era código:
el HTML real son ~315 kB y el resto eran imágenes incrustadas en base64, más
varias que ya no usaba nadie.

Un bundle de Design es un HTML con cuatro islas de datos en el `<body>`:

| isla | contenido |
|------|-----------|
| `__bundler/manifest` | `{uuid: {mime, compressed, data}}` — los binarios en base64 |
| `__bundler/ext_resources` | React / ReactDOM mapeados a uuids del manifest |
| `__bundler/page_order` | páginas anidadas (aquí, vacío) |
| `__bundler/template` | el documento HTML entero, como string JSON |

Al abrirlo, el cargador convierte cada entrada del manifest en una `blob:` URL
y hace `template.split(uuid).join(url)`. Por eso el template se refiere a las
imágenes por uuid pelado, y por eso se puede desempaquetar y volver a armar sin
tocar el cargador.

```
src/
  template.html        el documento (aquí se edita todo)
  shell.html           el cargador original, intacto, con marcadores @@ISLA@@
  ext_resources.json
  assets/              originales + index.json (uuid -> archivo, mime, compresión)
tools/
  unpack.py            bundle -> src/
  build.py             src/ -> bundle
  optimize_images.py   src/assets -> dist/assets-web (copias al tamaño real de uso)
  verify.mjs           humo: que arranque y pinte
  test-*.mjs           criterios de aceptación C1–C4 en navegador
dist/
  PatagoniK_Landing.html   el bundle listo para importar
```

## Uso

```bash
python3 tools/optimize_images.py                       # sólo si cambiaron las fotos
python3 tools/build.py --assets dist/assets-web        # -> dist/PatagoniK_Landing.html

node tools/verify.mjs dist/PatagoniK_Landing.html      # humo
node tools/test-routes.mjs                             # C1
node tools/test-merged-section.mjs                     # C2
node tools/test-carousel.mjs                           # C3
node tools/test-modal-i18n.mjs                         # C4
```

`build.py` empaqueta **sólo** los assets que el template todavía nombra, así que
borrar un `<image-slot>` basta para que sus bytes desaparezcan del build.

Para partir de un bundle nuevo exportado desde Design:
`python3 tools/unpack.py <bundle.html> --out src`.

## Peso

| | antes | ahora |
|---|---|---|
| bundle | 21.0 MB | **4.7 MB** |
| imágenes | 15.5 MB | 3.2 MB |
| assets muertos | 2.1 MB | 0 |
| fondos duplicados | 1.9 MB | 0 |
| HTML | 315 kB | 316 kB |

Los originales se quedan en `src/assets/` y no se tocan; `optimize_images.py`
escribe copias aparte, así que se puede volver a correr sin recomprimir sobre
lo ya comprimido. Los tamaños salen de lo que la página realmente pinta: una
foto de experiencia se ve a 340×250 en la tarjeta y a 571×1058 en el modal, y
es el modal el que manda.

## i18n

Sistema propio por atributos, sin librería:

- `data-t="clave"` traduce el `textContent` del nodo.
- `data-t-attr="aria-label:clave"` traduce atributos (añadido para el modal).
- `cacheSpanish()` guarda el español original y es **incremental**: se le puede
  pasar un root para indexar sólo lo recién inyectado.
- `applyLang(root)` aplica el idioma a un subárbol.

**Regla del proyecto: todo nodo que entre al DOM después del arranque necesita
su pasada de traducción.** Vale para las vistas del router y para cualquier
cosa que se monte dinámicamente.

El detalle de experiencia es la excepción al patrón: no se traduce por atributos
porque se arma desde datos. `EXPERIENCE_DATA` es el español y
`EXPERIENCE_I18N.en` / `.pt` lo cubren con la misma forma (mismos facts en el
mismo orden, listas del mismo largo). Si agregas una experiencia, agrégala en
los tres idiomas o el modal caerá al español sólo para ella.

> Las traducciones en/pt de las 16 experiencias se redactaron en este trabajo:
> el diccionario sólo tenía las claves de tarjeta. Conviene revisarlas con el
> equipo comercial antes de usarlas en campañas.

## Rutas

`/` · `/tabs/quienes-somos` (esencia + por qué nosotros + reseñas) · `/tabs/faq`

History API cuando la página se sirve por http(s); si no —`file://`, o un
hosting sin rewrites donde recargar `/tabs/faq` daría 404— cae solo a hash
(`#/tabs/faq`). Los enlaces llevan `href` real en los dos modos.

**Si se publica con History API, el hosting tiene que servir el mismo HTML en
`/tabs/*`** (rewrite tipo SPA). Sin eso funciona la navegación interna pero no
recargar ni entrar directo por URL.

Las vistas viven como texto inerte en `<script type="text/html"
data-route-view="...">`, **fuera de `<x-dc>`**. No es capricho: dentro, el
runtime de Design reconstruye el DOM recorriendo `childNodes`, y el contenido de
un `<template>` vive en su `DocumentFragment`, así que llegaba vacío al
navegador.

## Detalles que conviene no re-descubrir

- `#tours` **no** era un scroll horizontal: era una sección de 300vh pineada
  donde el scroll de la página manejaba un `transform`. Ahora sí es un
  `overflow-x` normal con scroll-snap.
- Un bundle self-contained decodifica todas sus imágenes al arrancar, así que
  `loading="lazy"` no ahorra bytes. Lo que sí ahorra es que haya menos imágenes
  y más chicas — y que las vistas de ruta no entren al DOM hasta que se visitan.
- Los bloques `<style id="pk-*-vNN">` son capas de parches acumuladas y muchos
  usan `!important`. Al añadir uno nuevo hay que ponerlo al final y, para ganarle
  a una regla por id, usar dos ids (`#cotiza #selector`) en vez de subir la
  escalera de `!important`.
