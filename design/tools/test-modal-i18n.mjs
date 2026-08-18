/**
 * C4 acceptance: the experience detail modal must render in the active
 * language, and must follow a language change made while it is open.
 *
 * Usage: node tools/test-modal-i18n.mjs [dist/PatagoniK_Landing.html]
 */
import { chromium } from 'playwright';
import path from 'node:path';

const file = process.argv[2] || 'dist/PatagoniK_Landing.html';
const browser = await chromium.launch({ executablePath: process.env.CHROME_BIN || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));

await page.goto('file://' + path.resolve(file), { waitUntil: 'load' });
await page.waitForFunction(() => !!document.querySelector('[data-exp-detail]'), null, { timeout: 45000 });

const pickLang = (lang) => page.evaluate((l) => {
  document.querySelector(`[data-lang="${l}"]`).click();
}, lang);

const openExp = (key) => page.evaluate((k) => {
  document.querySelector(`[data-exp-detail="${k}"]`).click();
}, key);

const readModal = () => page.evaluate(() => {
  const t = (s) => document.querySelector(s)?.textContent?.trim() || null;
  return {
    open: document.querySelector('#pk-exp-modal')?.getAttribute('aria-hidden') === 'false',
    kicker: t('#pk-exp-modal p[data-t="exp.modal.kicker"]'),
    title: t('#pk-exp-title'),
    lead: t('#pk-exp-lead'),
    body: t('#pk-exp-body')?.slice(0, 70),
    firstFactLabel: document.querySelector('#pk-exp-facts span')?.textContent?.trim() || null,
    firstInclude: document.querySelector('#pk-exp-includes li')?.textContent?.trim() || null,
    includesLabel: t('[data-t="exp.modal.includes"]'),
    excludesLabel: t('[data-t="exp.modal.excludes"]'),
    modality: t('#pk-exp-modality'),
    note: t('#pk-exp-note'),
    cta: t('[data-t="exp.modal.cta"]'),
    closeAria: document.querySelector('#pk-exp-close')?.getAttribute('aria-label'),
    wa: decodeURIComponent(document.querySelector('#pk-exp-wa')?.getAttribute('href') || '').slice(0, 90),
    htmlLang: document.documentElement.lang,
  };
});

const results = {};

// 1. Switch to EN *before* opening — the modal must open already in English.
await pickLang('en');
await openExp('2');
await page.waitForTimeout(120);
results.en_opened = await readModal();

// 2. Switch to PT with the modal still open — it must follow, not close.
await pickLang('pt');
await page.waitForTimeout(120);
results.pt_live_switch = await readModal();

// 3. Back to ES, still open.
await pickLang('es');
await page.waitForTimeout(120);
results.es_live_switch = await readModal();

// 4. A second experience in EN, to prove it is not experience-2 specific.
await page.evaluate(() => document.querySelector('#pk-exp-close').click());
await pickLang('en');
await openExp('15');
await page.waitForTimeout(120);
results.en_second = await readModal();

console.log(JSON.stringify(results, null, 2));

// ── assertions ──────────────────────────────────────────────────────────
const fail = [];
const check = (cond, msg) => { if (!cond) fail.push(msg); };

check(results.en_opened.open, 'modal did not open');
check(results.en_opened.title === 'French Valley', `EN title wrong: ${results.en_opened.title}`);
check(results.en_opened.kicker === 'PatagoniK experience', `EN kicker wrong: ${results.en_opened.kicker}`);
check(results.en_opened.includesLabel === 'Included', `EN includes label wrong: ${results.en_opened.includesLabel}`);
check(results.en_opened.firstFactLabel === 'Departure from Puerto Natales', `EN fact label wrong: ${results.en_opened.firstFactLabel}`);
check(/^Format:/.test(results.en_opened.modality), `EN modality label wrong: ${results.en_opened.modality}`);
check(results.en_opened.closeAria === 'Close details', `EN close aria wrong: ${results.en_opened.closeAria}`);
check(/would like information/.test(results.en_opened.wa), `EN whatsapp msg wrong: ${results.en_opened.wa}`);

check(results.pt_live_switch.open, 'modal closed on language switch');
check(results.pt_live_switch.title === 'Vale do Francês', `PT title wrong: ${results.pt_live_switch.title}`);
check(results.pt_live_switch.includesLabel === 'Inclui', `PT includes label wrong: ${results.pt_live_switch.includesLabel}`);
check(/^Modalidade:/.test(results.pt_live_switch.modality), `PT modality wrong: ${results.pt_live_switch.modality}`);

check(results.es_live_switch.title === 'Valle del Francés', `ES title wrong: ${results.es_live_switch.title}`);
check(/^Modalidad:/.test(results.es_live_switch.modality), `ES modality wrong: ${results.es_live_switch.modality}`);
check(results.es_live_switch.includesLabel === 'Incluye', `ES includes label wrong: ${results.es_live_switch.includesLabel}`);

check(results.en_second.title === 'Full Day Perito Moreno', `EN #15 title wrong: ${results.en_second.title}`);
check(results.en_second.firstInclude === 'Transport', `EN #15 first include wrong: ${results.en_second.firstInclude}`);

if (errors.length) fail.push('page errors: ' + errors.slice(0, 3).join(' | '));

console.log(fail.length ? '\nFAIL:\n' + fail.map((f) => '  ✗ ' + f).join('\n') : '\n✓ C4 acceptance passed');
await browser.close();
process.exit(fail.length ? 1 : 0);
