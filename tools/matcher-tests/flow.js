// Runs the whole Chiwchiw Match quiz on the LOCAL pages/university-matcher.html with the Apps Script API
// mocked: every step, the contact step validation, the lead POST, the results page and the stats beacon.
// Usage: node tools/matcher-tests/flow.js   (screenshots go to $OUT, default /tmp/matcher-tests)
const fs = require('fs'), path = require('path');
const {launch, devices, OUT} = require('./_browser');
const PAGE = path.join(__dirname, '../../pages/university-matcher.html');
(async () => {
  const file = path.join(OUT, 'matcher-local.html');
  fs.writeFileSync(file, '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body>' + fs.readFileSync(PAGE, 'utf8') + '</body></html>');
  const b = await launch(), p = await (await b.newContext({...devices['iPhone 13']})).newPage();
  const posts = [], errs = [];
  p.on('pageerror', e => errs.push(e.message));
  await p.route('**/*', r => {
    const u = r.request().url();
    if (u.startsWith('file:')) return r.continue();
    if (!u.includes('script.google.com')) return r.abort();
    if (r.request().method() === 'POST') { posts.push(JSON.parse(r.request().postData())); return r.fulfill({contentType: 'application/json', body: '{"ok":true}'}); }
    const a = new URL(u).searchParams.get('action');
    if (a === 'meta') return r.fulfill({contentType: 'application/json', body: JSON.stringify({unis: 100, progs: 7000, en: 100, rate: 4.6, cities: {Shanghai: {UG: 300, PG: 40}, Beijing: {UG: 299, PG: 50}, Xiamen: {UG: 40, PG: 5}}})});
    if (a === 'match') return r.fulfill({contentType: 'application/json', body: JSON.stringify({rid: '123e4567-e89b-12d3-a456-426614174000',
      item: {id: 'X1', u: 'Fudan University (FUDAN)', prog: 'International Relations', lv: 'PG', lang: 'en', tu: 40000, ielts: 6.5, req: []},
      uni: {name: 'Fudan University (FUDAN)', short: 'Fudan University', cn: '复旦大学', city: 'Shanghai', tiers: []},
      gaps: {major: true, lang: true, city: true}, exact: true, ai: true, others: [], plan: {headline: 'h', why_fit: ['a'], watch_out: [], prepare: ['b'], timeline: []}})});
    return r.fulfill({contentType: 'application/json', body: JSON.stringify({view: 'uni', page: 1, size: 12, total: 0, progTotal: 0, items: []})});
  });
  await p.goto('file://' + file); await p.waitForTimeout(800);
  const tap = async s => { await p.locator(s).first().click(); await p.waitForTimeout(400); };
  const step = () => p.$eval('.um-step.um-on', e => e.dataset.step);
  await tap('button[data-n="when"][data-v="next"]'); await tap('button[data-n="deg"][data-v="ma"]');
  await tap('button[data-n="major"][data-v="soc"]'); await tap('.um-next');
  await tap('button[data-n="lang"][data-v="en"]'); await tap('button[data-n="ielts"][data-v="6.5"]'); await tap('.um-next');
  await tap('button[data-n="budget"][data-v="350000"]');
  console.log('city chips:', await p.$$eval('.um-cities button', e => e.map(x => x.textContent.trim()).join(' | ')));
  await tap('.um-cities button[data-v="Shanghai"]'); await tap('.um-chip-more'); await p.selectOption('.um-cmore', 'Xiamen'); await p.waitForTimeout(300);
  console.log('cities pressed:', await p.$$eval('.um-cities button[aria-pressed="true"]', e => e.map(x => x.dataset.v)));
  await tap('.um-next'); await tap('button[data-n="schol"][data-v="nice"]');
  console.log('step:', await step());
  await tap('.um-next'); console.log('empty submit message:', await p.textContent('.um-cmsg'));
  await p.fill('#um-c-n', 'มิ้นท์'); await p.fill('#um-c-e', 'mint@gmail.com'); await tap('.um-next');
  console.log('no consent message:', await p.textContent('.um-cmsg'));
  await p.check('#um-c-ok'); await tap('.um-next'); await p.waitForTimeout(4500);
  const lead = posts.find(x => !x.t);
  console.log('lead sent:', lead ? [lead.name, lead.email, lead.rid ? 'rid ok' : 'NO rid', lead.matchUni] : 'NONE');
  console.log('results slot:', (await p.textContent('.um-lead-slot')).trim().slice(0, 80));
  await p.screenshot({path: path.join(OUT, 'flow-result.png')});
  await p.evaluate(() => { Object.defineProperty(document, 'visibilityState', {value: 'hidden', configurable: true}); document.dispatchEvent(new Event('visibilitychange')); });
  await p.waitForTimeout(400);
  console.log('stats beacon:', posts.some(x => x.t === 'stats') ? 'sent' : 'NOT sent');
  console.log('page errors:', errs.length ? errs : 'none');
  await b.close();
})();
