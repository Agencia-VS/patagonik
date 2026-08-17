/**
 * C1 acceptance: /tabs/faq and /tabs/quienes-somos mount on demand, translate
 * in es/en/pt, carry their own title/description, and leave the landing
 * without their DOM.
 *
 * Runs twice: over http (History API, the production mode, with the SPA
 * rewrite a host would need) and over file:// (the hash fallback, which is
 * also what a Claude Design preview gets).
 *
 * Usage: node tools/test-routes.mjs [dist/PatagoniK_Landing.html]
 */
import { chromium } from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const file = path.resolve(process.argv[2] || 'dist/PatagoniK_Landing.html');
const html = fs.readFileSync(file);

// Any path serves the document — the rewrite a History-API SPA requires.
const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(html);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;

const browser = await chromium.launch({ executablePath: process.env.CHROME_BIN || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const fail = [];
const check = (cond, msg) => { if (!cond) fail.push(msg); };

const ready = (page) => page.waitForFunction(() => !!document.querySelector('#pk-landing'), null, { timeout: 45000 });

const snapshot = (page) => page.evaluate(() => {
  const outlet = document.querySelector('#pk-route-outlet');
  const landing = document.querySelector('#pk-landing');
  const seen = (sel) => !!document.querySelector(sel);
  return {
    landingHidden: landing.hidden,
    outletHidden: outlet.hidden,
    outletSections: Array.from(outlet.querySelectorAll('section[id]')).map((s) => s.id),
    faqInDom: seen('#faq'),
    esenciaInDom: seen('#esencia'),
    resenasInDom: seen('#resenas'),
    nosotrosInDom: seen('#nosotros'),
    title: document.title,
    description: document.querySelector('meta[name="description"]')?.getAttribute('content') || null,
    activeLinks: Array.from(document.querySelectorAll('[data-route-link][aria-current="page"]')).map((a) => a.getAttribute('data-route-path')),
    hrefs: Array.from(document.querySelectorAll('[data-route-link]')).map((a) => a.getAttribute('href')),
    untranslated: Array.from(document.querySelectorAll('#pk-route-outlet [data-t]')).filter((el) => !el.textContent.trim()).length,
    firstHeading: outlet.querySelector('h2,h3')?.textContent.trim() || null,
  };
});

const clickRoute = async (page, routePath) => {
  await page.evaluate((p) => {
    document.querySelector(`[data-route-link][data-route-path="${p}"]`).click();
  }, routePath);
  await page.waitForTimeout(320);
};

async function run(label, gotoUrl, deepLink) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(gotoUrl, { waitUntil: 'load' });
  await ready(page);
  await page.waitForTimeout(300);

  // Landing must not carry the routed sections at all.
  const landing = await snapshot(page);
  check(landing.landingHidden === false, `${label}: landing hidden on /`);
  check(landing.outletHidden === true, `${label}: outlet shown on /`);
  check(!landing.faqInDom, `${label}: #faq is in the landing DOM`);
  check(!landing.esenciaInDom, `${label}: #esencia is in the landing DOM`);
  check(!landing.resenasInDom, `${label}: #resenas is in the landing DOM`);
  check(!landing.nosotrosInDom, `${label}: #nosotros is in the landing DOM`);
  check(/Torres del Paine/.test(landing.title), `${label}: landing title wrong: ${landing.title}`);

  // Navigate to FAQ.
  await clickRoute(page, '/tabs/faq');
  const faq = await snapshot(page);
  check(faq.landingHidden === true, `${label}: landing still visible on /tabs/faq`);
  check(faq.faqInDom, `${label}: #faq did not mount`);
  check(faq.outletSections.includes('faq'), `${label}: outlet sections ${JSON.stringify(faq.outletSections)}`);
  check(/Preguntas frecuentes/.test(faq.title), `${label}: faq title wrong: ${faq.title}`);
  check(/reservas/.test(faq.description || ''), `${label}: faq description wrong: ${faq.description}`);
  check(faq.activeLinks.join() === '/tabs/faq', `${label}: active link ${JSON.stringify(faq.activeLinks)}`);
  check(faq.untranslated === 0, `${label}: ${faq.untranslated} empty [data-t] nodes in the mounted view`);

  // Quiénes somos groups the three sections.
  await clickRoute(page, '/tabs/quienes-somos');
  const qs = await snapshot(page);
  check(['esencia', 'nosotros', 'resenas'].every((id) => qs.outletSections.includes(id)),
    `${label}: quienes-somos sections ${JSON.stringify(qs.outletSections)}`);
  check(!qs.faqInDom, `${label}: #faq leaked into quienes-somos`);
  check(/Qui[eé]nes somos/.test(qs.title), `${label}: qs title wrong: ${qs.title}`);

  // Language must reach the mounted view and the metadata.
  const en = await page.evaluate(() => {
    document.querySelector('[data-lang="en"]').click();
    const el = document.querySelector('#pk-route-outlet [data-t="esc.title.main"]');
    return { heading: el?.textContent.trim(), title: document.title,
             desc: document.querySelector('meta[name="description"]')?.getAttribute('content') };
  });
  check(en.heading === 'Our essence', `${label}: view did not translate to EN: ${en.heading}`);
  check(/About us/.test(en.title), `${label}: EN title wrong: ${en.title}`);
  check(/certified local guides/.test(en.desc || ''), `${label}: EN description wrong: ${en.desc}`);

  const pt = await page.evaluate(() => {
    document.querySelector('[data-lang="pt"]').click();
    return { heading: document.querySelector('#pk-route-outlet [data-t="esc.title.main"]')?.textContent.trim(),
             title: document.title };
  });
  check(pt.heading === 'Nossa essência', `${label}: view did not translate to PT: ${pt.heading}`);
  check(/Quem somos/.test(pt.title), `${label}: PT title wrong: ${pt.title}`);
  await page.evaluate(() => document.querySelector('[data-lang="es"]').click());

  // Back / forward.
  await page.goBack();
  await page.waitForTimeout(320);
  const back = await snapshot(page);
  check(back.faqInDom, `${label}: going back did not restore /tabs/faq`);
  await page.goForward();
  await page.waitForTimeout(320);
  const fwd = await snapshot(page);
  check(fwd.esenciaInDom, `${label}: going forward did not restore quienes-somos`);

  // Returning to the landing must tear the view down.
  await clickRoute(page, '/');
  const home = await snapshot(page);
  check(!home.esenciaInDom && !home.faqInDom, `${label}: view not unmounted on return to /`);
  check(home.landingHidden === false, `${label}: landing not restored`);

  // Deep link straight into a route.
  if (deepLink) {
    const p2 = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    p2.on('pageerror', (e) => errors.push('deep: ' + e.message));
    await p2.goto(deepLink, { waitUntil: 'load' });
    await ready(p2);
    await p2.waitForTimeout(400);
    const deep = await snapshot(p2);
    check(deep.faqInDom, `${label}: deep link ${deepLink} did not mount the FAQ`);
    check(deep.landingHidden === true, `${label}: deep link left the landing visible`);
    await p2.close();
  }

  if (errors.length) fail.push(`${label}: page errors: ${errors.slice(0, 3).join(' | ')}`);
  console.log(label, JSON.stringify({ landing: landing.outletSections, faq: faq.outletSections, qs: qs.outletSections, hrefs: faq.hrefs, title: faq.title }, null, 1));
  await page.close();
}

await run('history', `${base}/`, `${base}/tabs/faq`);
await run('hash', 'file://' + file, 'file://' + file + '#/tabs/faq');

console.log(fail.length ? '\nFAIL:\n' + fail.map((f) => '  ✗ ' + f).join('\n') : '\n✓ C1 acceptance passed');
await browser.close();
server.close();
process.exit(fail.length ? 1 : 0);
