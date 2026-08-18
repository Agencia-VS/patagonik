/**
 * Smoke-check a built bundle in a real browser.
 *
 * The bundle boots by decoding its manifest into blob: URLs and swapping the
 * whole documentElement, so nothing meaningful exists until that finishes —
 * every probe below waits on the unpacked DOM rather than on load events.
 *
 * Usage: node tools/verify.mjs [dist/PatagoniK_Landing.html] [--shot out.png]
 */
import { chromium } from 'playwright';
import path from 'node:path';
import process from 'node:process';

const file = process.argv[2] || 'dist/PatagoniK_Landing.html';
const shotIdx = process.argv.indexOf('--shot');
const shot = shotIdx !== -1 ? process.argv[shotIdx + 1] : null;
const wide = process.argv.includes('--mobile') ? { width: 390, height: 844 } : { width: 1440, height: 900 };

const browser = await chromium.launch({ executablePath: process.env.CHROME_BIN || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const page = await browser.newPage({ viewport: wide });

const errors = [];
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(`console.error: ${m.text()}`);
});

await page.goto('file://' + path.resolve(file), { waitUntil: 'load' });

// The loader replaces documentElement; #dc-root (or the page markup) only
// exists afterwards. The bundler's own error sink is #__bundler_err.
await page.waitForFunction(() => !!document.querySelector('header[data-hdr]'), null, { timeout: 45000 })
  .catch(() => {});

const report = await page.evaluate(() => {
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => Array.from(document.querySelectorAll(s));
  const vis = (el) => {
    if (!el) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };
  return {
    bundlerError: $('#__bundler_err')?.textContent?.slice(0, 400) || null,
    header: !!$('header[data-hdr]'),
    sections: $$('section[id]').map((s) => s.id),
    imageSlots: $$('image-slot').length,
    imagesResolved: $$('image-slot').filter((s) => {
      const inner = s.shadowRoot?.querySelector('img') || s.querySelector('img');
      return inner && inner.currentSrc && inner.naturalWidth > 0;
    }).length,
    translatable: $$('[data-t]').length,
    expCards: $$('[data-exp-detail]').length,
    modal: !!$('#pk-exp-modal'),
    menuLinks: $$('[data-menu-link]').map((a) => a.getAttribute('href')),
    showMore: $$('#pk-exp-showmore-desktop, #pk-exp-showmore-mobile').length,
    langButtons: $$('[data-lang]').length,
    title: document.title,
    lang: document.documentElement.lang,
  };
});

console.log(JSON.stringify(report, null, 2));
if (errors.length) {
  console.log('\n--- page errors ---');
  console.log(errors.slice(0, 20).join('\n'));
}
if (shot) {
  await page.screenshot({ path: shot, fullPage: false });
  console.log(`\nscreenshot -> ${shot}`);
}

await browser.close();
process.exit(report.bundlerError ? 1 : 0);
