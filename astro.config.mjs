// @ts-check
import { defineConfig } from 'astro/config';
import vercel from '@astrojs/vercel';

/**
 * Español en la raíz (/), inglés y portugués con prefijo (/en/, /pt/).
 *
 * Esto es lo que sustituye al selector de idioma por JS del bundle: allí los
 * tres idiomas compartían una sola URL, así que Google sólo veía la versión en
 * español. Con rutas reales cada idioma es indexable y se puede declarar
 * hreflang entre ellas.
 *
 * Si prefieres /es/ explícito, pon prefixDefaultLocale: true y añade una
 * redirección de / a /es/.
 */
export default defineConfig({
  site: 'https://patagoniknatales.com',
  adapter: vercel({ imageService: true }),
  // Una sola forma de cada URL: sin barra final, igual que los hreflang.
  trailingSlash: 'never',
  i18n: {
    defaultLocale: 'es',
    locales: ['es', 'en', 'pt'],
    routing: { prefixDefaultLocale: false, redirectToDefaultLocale: false },
  },
  image: {
    // Las fotos definitivas todavía no están; cuando lleguen, astro:assets
    // genera aquí los tamaños y formatos en vez de arrastrar base64.
    responsiveStyles: true,
  },
});
