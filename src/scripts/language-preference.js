const LANGUAGE_STORAGE_KEY = 'patagonik.locale';
const SUPPORTED_LANGUAGES = ['es', 'en', 'pt'];

const safeRead = () => {
  try {
    const value = window.localStorage.getItem(LANGUAGE_STORAGE_KEY);
    return SUPPORTED_LANGUAGES.includes(value) ? value : null;
  } catch {
    return null;
  }
};

const safeWrite = (locale) => {
  if (!SUPPORTED_LANGUAGES.includes(locale)) return;
  try {
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, locale);
  } catch {
    // La navegación debe seguir funcionando aunque el navegador bloquee storage.
  }
};

const preferredLocale = () => {
  const languages = Array.isArray(navigator.languages) && navigator.languages.length
    ? navigator.languages
    : [navigator.language];
  for (const language of languages) {
    const base = String(language || '').toLowerCase().split('-')[0];
    if (SUPPORTED_LANGUAGES.includes(base)) return base;
  }
  // Para viajeros con un cuarto idioma, inglés es el fallback más útil.
  return 'en';
};

document.addEventListener('click', (event) => {
  const link = event.target instanceof Element ? event.target.closest('[data-lang]') : null;
  if (link) safeWrite(link.getAttribute('data-lang'));
}, { capture: true });

/*
  Sólo inferimos en la raíz. Una URL interior compartida o encontrada en Google
  se respeta tal cual; así la detección nunca secuestra una navegación explícita.
*/
if (window.location.pathname === '/') {
  const targetLocale = safeRead() || preferredLocale();
  const currentLocale = document.documentElement.dataset.locale || 'es';
  if (targetLocale !== currentLocale) {
    const hreflang = targetLocale === 'pt' ? 'pt-BR' : targetLocale;
    const alternate = document.querySelector(`link[rel="alternate"][hreflang="${hreflang}"]`);
    if (alternate instanceof HTMLLinkElement && alternate.href) window.location.replace(alternate.href);
  }
}
