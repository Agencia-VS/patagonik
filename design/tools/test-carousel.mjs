/**
 * C3 acceptance: no "Mostrar más" anywhere, all 16 experiences reachable
 * through the arrows, arrows disabled at each end, keyboard navigable.
 *
 * Usage: node tools/test-carousel.mjs [dist/PatagoniK_Landing.html]
 */
import { chromium } from 'playwright';
import path from 'node:path';

const file = process.argv[2] || 'dist/PatagoniK_Landing.html';
const browser = await chromium.launch({ executablePath: process.env.CHROME_BIN || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });

const fail = [];
const check = (cond, msg) => { if (!cond) fail.push(msg); };

async function run(label, viewport, trackSel, sectionSel) {
  const page = await browser.newPage({ viewport });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('file://' + path.resolve(file), { waitUntil: 'load' });
  await page.waitForFunction((s) => {
    const t = document.querySelector(s);
    return t && t.querySelectorAll('[data-exp-detail]').length > 0;
  }, trackSel, { timeout: 45000 });
  await page.waitForTimeout(400);

  const state = () => page.evaluate(([t, s]) => {
    const track = document.querySelector(t);
    const arrows = document.querySelector(`${s} .pk-exp-arrows`);
    const btns = arrows ? Array.from(arrows.querySelectorAll('.pk-exp-arrow')) : [];
    return {
      cards: track.querySelectorAll('[data-exp-detail]').length,
      hiddenCards: track.querySelectorAll('.pk-exp-preview-hidden').length,
      scrollLeft: Math.round(track.scrollLeft),
      maxScroll: Math.round(track.scrollWidth - track.clientWidth),
      overflowX: getComputedStyle(track).overflowX,
      arrowsVisible: arrows ? getComputedStyle(arrows).display !== 'none' : false,
      prevDisabled: btns[0]?.disabled ?? null,
      nextDisabled: btns[1]?.disabled ?? null,
      prevAria: btns[0]?.getAttribute('aria-label') ?? null,
      nextAria: btns[1]?.getAttribute('aria-label') ?? null,
    };
  }, [trackSel, sectionSel]);

  const click = (i) => page.evaluate(([s, n]) => {
    document.querySelectorAll(`${s} .pk-exp-arrow`)[n].click();
  }, [sectionSel, i]);

  const first = await state();
  check(first.cards === 16, `${label}: expected 16 cards, got ${first.cards}`);
  check(first.hiddenCards === 0, `${label}: ${first.hiddenCards} cards still hidden by preview class`);
  check(first.overflowX === 'auto' || first.overflowX === 'scroll', `${label}: track overflow-x is ${first.overflowX}`);
  check(first.maxScroll > 0, `${label}: track has no scrollable distance`);
  check(first.arrowsVisible, `${label}: arrows not visible`);
  check(first.prevDisabled === true, `${label}: prev should start disabled`);
  check(first.nextDisabled === false, `${label}: next should start enabled`);

  // Next advances.
  await click(1);
  await page.waitForTimeout(700);
  const afterNext = await state();
  check(afterNext.scrollLeft > first.scrollLeft, `${label}: next arrow did not scroll (${first.scrollLeft} -> ${afterNext.scrollLeft})`);
  check(afterNext.prevDisabled === false, `${label}: prev should enable after moving`);

  // Prev goes back.
  await click(0);
  await page.waitForTimeout(700);
  const afterPrev = await state();
  check(afterPrev.scrollLeft < afterNext.scrollLeft, `${label}: prev arrow did not scroll back`);

  // Walk to the far end; next must end up disabled.
  for (let i = 0; i < 25; i++) {
    const s = await state();
    if (s.nextDisabled) break;
    await click(1);
    await page.waitForTimeout(230);
  }
  const atEnd = await state();
  check(atEnd.nextDisabled === true, `${label}: next never disabled at the end (x=${atEnd.scrollLeft}/${atEnd.maxScroll})`);
  check(atEnd.prevDisabled === false, `${label}: prev should be enabled at the end`);

  // Keyboard.
  await page.evaluate((t) => document.querySelector(t).focus(), trackSel);
  await page.keyboard.press('ArrowLeft');
  await page.waitForTimeout(650);
  const afterKey = await state();
  check(afterKey.scrollLeft < atEnd.scrollLeft, `${label}: ArrowLeft did not scroll the track`);

  // Arrow labels must follow the language switch.
  await page.evaluate(() => document.querySelector('[data-lang="en"]').click());
  await page.waitForTimeout(200);
  const en = await state();
  check(en.nextAria === 'See more experiences', `${label}: EN arrow aria wrong: ${en.nextAria}`);

  if (errors.length) fail.push(`${label}: page errors: ${errors.slice(0, 2).join(' | ')}`);
  console.log(label, JSON.stringify({ first, afterNext, atEnd, enAria: en.nextAria }, null, 1));
  await page.close();
}

await run('desktop', { width: 1440, height: 900 }, '#tours [data-hs-track]', '#tours');
await run('mobile', { width: 390, height: 844 }, '#pk-mobile-exp-track', '#tours-mobile');

// "Mostrar más" must be gone from the source entirely, not just hidden.
const page = await browser.newPage();
await page.goto('file://' + path.resolve(file), { waitUntil: 'load' });
await page.waitForFunction(() => !!document.querySelector('[data-exp-detail]'), null, { timeout: 45000 });
const leftovers = await page.evaluate(() => ({
  buttons: document.querySelectorAll('#pk-exp-showmore-desktop, #pk-exp-showmore-mobile, #pk-exp-showmore-mobile-wrap').length,
  text: /Mostrar m[aá]s|Show more|Mostrar mais/i.test(document.body.innerText),
}));
check(leftovers.buttons === 0, `showmore elements still present: ${leftovers.buttons}`);
check(leftovers.text === false, 'the string "Mostrar más" is still rendered somewhere');
await page.close();

console.log(fail.length ? '\nFAIL:\n' + fail.map((f) => '  ✗ ' + f).join('\n') : '\n✓ C3 acceptance passed');
await browser.close();
process.exit(fail.length ? 1 : 0);
