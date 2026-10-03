// Runs apps-script/Code.gs in Node with Google's services mocked (no real sheet, no real email).
// Feeds one match + one lead through keepReport_ / saveLead_ and writes the two emails as HTML + PNG.
// Usage: node tools/matcher-tests/gs-mock.js [match.json]
//   match.json = a real answer from the live API (?action=match&a=...), else a built-in sample.
const fs = require('fs'), vm = require('vm'), path = require('path');
const {launch, OUT} = require('./_browser');
const store = {}, mails = [], rows = {};
function sheet(n, head) { rows[n] = head ? [head] : []; return {
  appendRow: r => rows[n].push(r), getLastRow: () => rows[n].length, getLastColumn: () => (rows[n][0] || []).length,
  setFrozenRows() {}, setColumnWidth() {},
  getRange: (r, c, nr, nc) => ({getValues: () => rows[n].slice(r - 1, r - 1 + (nr || 1)).map(x => x.slice(c - 1, c - 1 + (nc || 1))),
    setValue: v => { rows[n][r - 1][c - 1] = v; }, setValues() {}, setFontWeight() { return this; }, setBackground() { return this; }, setNumberFormat() { return this; }})}; }
const web = sheet('UG/PG', ['timestamp', 'nickname', 'who', 'grade', 'line_or_phone', 'email', 'intake', 'level', 'field', 'teach_lang', 'budget', 'city_vibe', 'test_scores', 'result_city', 'recommended_1', 'recommended_2', 'province_interest', 'contact_consent', 'marketing_consent', 'source', 'page']);
let leads = null;
const ctx = {console, JSON, Math, Date, String, Array, Object, RegExp,
  CacheService: {getScriptCache: () => ({get: k => store[k] || null, put: (k, v) => { store[k] = v; }, getAll: () => ({})})},
  LockService: {getScriptLock: () => ({waitLock() {}, releaseLock() {}})},
  Utilities: {getUuid: () => '123e4567-e89b-12d3-a456-426614174000', formatDate: () => '2026100312'},
  MailApp: {getRemainingDailyQuota: () => 100, sendEmail: o => mails.push(o)},
  UrlFetchApp: {fetch: u => ({getResponseCode: () => /\.webp$/.test(u) ? 200 : 404})},
  PropertiesService: {getScriptProperties: () => ({getProperty: () => null, getProperties: () => ({})})},
  ContentService: {MimeType: {}, createTextOutput: t => ({setMimeType: () => t})},
  SpreadsheetApp: {getActiveSpreadsheet: () => ({getSheetByName: n => n === 'Matcher Leads' ? leads : null, insertSheet: n => (leads = sheet(n)), getUrl: () => 'https://docs.google.com/x'}),
    openById: () => ({getSheetByName: () => web})}};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, '../../apps-script/Code.gs'), 'utf8'), ctx);
ctx.out = process.argv[2] ? JSON.parse(fs.readFileSync(process.argv[2], 'utf8')) : {
  item: {id: 'FUD-PG-012', u: 'Fudan University (FUDAN)', cn: '复旦大学', city: 'Shanghai', lv: 'PG', prog: 'International Relations', lang: 'en', dur: '2', tu: 40000, ielts: 6.5, dl: '15 Mar 2026', past: true, sch: true},
  uni: {short: 'Fudan University', cn: '复旦大学'}, exact: true, ai: true, others: [{name: 'Tsinghua University (THU)', short: 'Tsinghua University', cn: '清华大学', city: 'Beijing'}],
  plan: {headline: 'หลักสูตร IR ภาษาอังกฤษที่ตรงกับเป้าหมายของนักเรียน', why_fit: ['สอนเป็นภาษาอังกฤษ', 'มีทุน'], watch_out: ['IELTS ต้อง 6.5'], prepare: ['สอบ IELTS', 'Study plan'], timeline: [{when: 'ตอนนี้', task: 'คุยกับทีม'}, {when: 'ก่อนปิดรับ', task: 'ยื่นสมัคร'}]}};
const rid = vm.runInContext('keepReport_(out, "{}")', ctx);
ctx.b = {name: 'มิ้นท์ <test>', email: 'Mint@Example.com', line: 'mint123', phone: '0812345678', consent: true, marketing: true, rid, answers: 'ยื่นรอบหน้า · ปริญญาโท',
  matchUni: 'FAKE (the server must ignore this)', q: {intake: 'ยื่นรอบหน้า', level: 'ปริญญาโท', field: 'รัฐศาสตร์', lang: 'สอนอังกฤษ', tests: 'IELTS 6.5', budget: 'งบ ≤ ฿300,000/ปี', cities: 'เซี่ยงไฮ้'}, page: 'https://chinesechiwchiw.com/university-match/'};
console.log('saveLead_:', JSON.stringify(vm.runInContext('saveLead_(b)', ctx)));
console.log('Matcher Leads row:', JSON.stringify(rows['Matcher Leads'][1]));
console.log('Website leads row:', JSON.stringify(rows['UG/PG'][1]));
mails.forEach(m => console.log('email →', m.to, '|', m.subject, '| replyTo', m.replyTo));
console.log('HTML escaped:', mails.every(m => !/<test>/.test(m.htmlBody)));
(async () => {
  const b = await launch();
  for (const [i, w] of [[0, 420], [1, 600]]) {
    if (!mails[i]) continue;
    const f = path.join(OUT, i ? 'email-alert.html' : 'email-student.html');
    fs.writeFileSync(f, mails[i].htmlBody);
    const p = await b.newPage({viewport: {width: w, height: 800}});
    await p.goto('file://' + f); await p.screenshot({path: f.replace('.html', '.png'), fullPage: true});
  }
  await b.close(); console.log('emails saved in', OUT);
})();
