// Taps through the LIVE matcher page on an emulated iPhone (real data; lead/stat POSTs are blocked so
// nothing is written to Dear's sheets). Checks nothing covers the buttons. Screenshots go to $OUT.
// Usage: node tools/matcher-tests/live-tap.js   (cloud sessions: ignoreHTTPSErrors handles the proxy CA)
const path = require('path');
const {launch, devices, OUT} = require('./_browser');
(async () => {
  const b = await launch(), p = await (await b.newContext({...devices['iPhone 13'], ignoreHTTPSErrors: true})).newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.route('**/*', r => { const q = r.request(); if (q.method() === 'POST') return r.fulfill({contentType: 'application/json', body: '{"ok":true}'}); if (/facebook|fbevents|pixel\.wp|stats\.wp/.test(q.url())) return r.abort(); return r.continue(); });
  for (let i = 0; i < 4; i++) { try { await p.goto('https://chinesechiwchiw.com/university-match/?v=t' + Date.now(), {waitUntil: 'domcontentloaded', timeout: 120000}); break; } catch (e) { console.log('retry load', i); } }
  await p.waitForTimeout(8000);
  const cover = s => p.evaluate(sel => { const el = document.querySelector(sel); if (!el) return 'missing'; const r = el.getBoundingClientRect(); const t = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return t === el || el.contains(t) ? 'ok' : 'COVERED by ' + (t ? t.tagName + '.' + t.className : 'null'); }, s);
  const tap = async s => { const l = p.locator(s).first(); await l.scrollIntoViewIfNeeded(); console.log('tap', s, '→', await cover(s)); await l.tap(); await p.waitForTimeout(700); };
  await tap('button[data-n="when"][data-v="next"]'); await tap('button[data-n="deg"][data-v="ug"]');
  await tap('button[data-n="major"][data-v="biz"]'); await tap('.um-next');
  await tap('button[data-n="lang"][data-v="zh"]'); await tap('button[data-n="hsk"][data-v="4"]'); await tap('.um-next');
  await tap('button[data-n="budget"][data-v="250000"]'); await p.waitForTimeout(1200);
  await tap('.um-cities button[data-v="Shanghai"]'); await tap('.um-next'); await tap('button[data-n="schol"][data-v="nice"]');
  await p.screenshot({path: path.join(OUT, 'live-contact.png')});
  console.log('on step:', await p.$eval('.um-step.um-on', e => e.dataset.step), '| page errors:', errs.length ? errs : 'none');
  await b.close();
})();
