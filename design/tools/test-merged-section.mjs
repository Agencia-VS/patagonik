/**
 * C2 acceptance: quiz and quote form live in one section, the quiz choice
 * prefills the experience select, the menu points at a single anchor, and the
 * section reports one screen label.
 *
 * Also covers two pre-existing bugs fixed alongside the merge: the Portuguese
 * submit path referenced an undeclared `modalidade`, and the experience select
 * was missing Astrofotografía.
 *
 * Usage: node tools/test-merged-section.mjs [dist/PatagoniK_Landing.html]
 */
import { chromium } from 'playwright';
import path from 'node:path';

const file = process.argv[2] || 'dist/PatagoniK_Landing.html';
const browser = await chromium.launch({ executablePath: process.env.CHROME_BIN || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));

await page.goto('file://' + path.resolve(file), { waitUntil: 'load' });
await page.waitForFunction(() => !!document.querySelector('#pk-quote-form'), null, { timeout: 45000 });

const fail = [];
const check = (cond, msg) => { if (!cond) fail.push(msg); };

const structure = await page.evaluate(() => {
  const cotiza = document.querySelector('#cotiza');
  const quiz = document.querySelector('#pk-quiz-grid');
  const form = document.querySelector('#pk-quote-form');
  const sel = document.querySelector('#pk-quote-experience');
  return {
    sections: Array.from(document.querySelectorAll('section[id]')).map((s) => s.id),
    selectorIsSection: document.querySelector('#selector')?.tagName || null,
    quizInsideCotiza: !!(cotiza && quiz && cotiza.contains(quiz)),
    formInsideCotiza: !!(cotiza && form && cotiza.contains(form)),
    headingsInCotiza: Array.from(cotiza.querySelectorAll('h2')).map((h) => h.textContent.trim()),
    screenLabels: Array.from(document.querySelectorAll('[data-screen-label]')).map((n) => n.getAttribute('data-screen-label')),
    menuLinks: Array.from(document.querySelectorAll('[data-menu-link]')).map((a) => a.getAttribute('href')),
    options: Array.from(sel.options).map((o) => o.textContent.trim()),
  };
});

check(!structure.sections.includes('selector'), '#selector is still a <section>');
check(structure.selectorIsSection === 'DIV', `#selector should survive as a DIV, got ${structure.selectorIsSection}`);
check(structure.quizInsideCotiza, 'quiz grid is not inside #cotiza');
check(structure.formInsideCotiza, 'quote form is not inside #cotiza');
check(structure.headingsInCotiza.length === 1, `merged section has ${structure.headingsInCotiza.length} h2s: ${JSON.stringify(structure.headingsInCotiza)}`);
check(structure.menuLinks.filter((h) => h === '#cotiza' || h === '#selector').length === 1,
  `menu should point at one anchor, got ${JSON.stringify(structure.menuLinks)}`);
check(new Set(structure.screenLabels).size === structure.screenLabels.length,
  `duplicate data-screen-label: ${JSON.stringify(structure.screenLabels)}`);
check(structure.options.includes('Astrofotografía'), 'experience select is missing Astrofotografía');
check(structure.options.length === 17, `expected 16 experiences + placeholder, got ${structure.options.length}`);

// Quiz -> form prefill.
const prefill = await page.evaluate(() => {
  const pick = (g, v) => document.querySelector(`[data-quiz-group="${g}"][data-quiz-value="${v}"]`).click();
  pick('interest', 'glaciares');
  pick('level', 'moderado');
  pick('days', '2-3');
  const sel = document.querySelector('#pk-quote-experience');
  return {
    resultShown: getComputedStyle(document.querySelector('#pk-quiz-result')).display !== 'none',
    recs: Array.from(document.querySelectorAll('#pk-quiz-recs span')).map((s) => s.textContent.trim()),
    selected: sel.value,
  };
});
check(prefill.resultShown, 'quiz result did not appear');
check(prefill.selected === 'Glaciar Grey en navegación',
  `quiz did not prefill the select, got "${prefill.selected}" (recs: ${JSON.stringify(prefill.recs)})`);

// A manual choice must not be clobbered by a later quiz answer.
const manual = await page.evaluate(() => {
  const sel = document.querySelector('#pk-quote-experience');
  sel.value = 'Mirador Ferrier';
  sel.dispatchEvent(new Event('change', { bubbles: true }));
  document.querySelector('[data-quiz-group="interest"][data-quiz-value="fauna"]').click();
  return document.querySelector('#pk-quote-experience').value;
});
check(manual === 'Mirador Ferrier', `manual selection was overwritten with "${manual}"`);

// Portuguese submit path (previously threw ReferenceError on `modalidade`).
const ptSubmit = await page.evaluate(() => {
  document.querySelector('[data-lang="pt"]').click();
  let opened = null;
  const real = window.open;
  window.open = (url) => { opened = url; return null; };
  document.querySelector('#pk-quote-form').requestSubmit();
  window.open = real;
  return opened;
});
check(!!ptSubmit && /Modalidade/.test(decodeURIComponent(ptSubmit)),
  `pt submit did not build a WhatsApp url: ${ptSubmit}`);

console.log(JSON.stringify({ structure, prefill, manual, ptSubmit: ptSubmit && decodeURIComponent(ptSubmit).slice(0, 120) }, null, 2));
if (errors.length) fail.push('page errors: ' + errors.slice(0, 3).join(' | '));

console.log(fail.length ? '\nFAIL:\n' + fail.map((f) => '  ✗ ' + f).join('\n') : '\n✓ C2 acceptance passed');
await browser.close();
process.exit(fail.length ? 1 : 0);
