/**
 * Chinese Chiwchiw — University Matcher API (Google Apps Script web app)
 *
 * The Programme Database sheet stays PRIVATE. The website never downloads it.
 * This script reads the sheet on Google's side and answers with:
 *   • one best match for the quiz,
 *   • at most CONFIG.maxPageSize rows per request for the list,
 *   • only the student-facing fields built in pub_() — Internal Notes, sources,
 *     partner status, package, GPA and URLs never leave the sheet.
 *
 * SETUP (once)
 * 1. Open the Programme Database sheet → Extensions → Apps Script.
 * 2. Replace the editor content with this file and Save.
 * 3. Deploy → New deployment → type "Web app"
 *      Execute as: Me    ·    Who has access: Anyone
 *    → Deploy → allow access → copy the Web app URL (ends in /exec).
 * 4. Paste that URL into data-api="…" on the website block.
 * After editing this script later: Deploy → Manage deployments → Edit → Version: New.
 *
 * OPTIONAL TABS for university photos and descriptions:
 *   Any tab name works. The script uses every tab whose first row has a
 *   "University" column plus a description, logo or photo column, e.g.
 *   the imported "WordPress university images (…).csv" and university-descriptions.csv.
 *   University matches Master Data with or without the "(CODE)" at the end.
 *   URLs must start with https://. The photo credit is shown on the photo
 *   (Wikimedia licences require it).
 *
 * OPTIONAL COLUMNS in Master Data for extra requirements (Yes/No):
 *   Portfolio Required? | Entrance Exam Required? | Interview Required? | Study Plan Required?
 *   Without them, the script looks for these words in "Academic Prerequisites".
 *
 * STATS: every visit to the matcher page adds one anonymous row to "Matcher Stats"
 * (device, where they came from, how many quiz questions answered, the match, searches,
 * filters, universities opened, clicks, time on page). "Matcher Dashboard" adds it all
 * up and also lists AI matches per day from before the stats existed.
 * To rebuild the dashboard: run setupMatcherDashboard() from the editor.
 *
 * LEADS from the email form go to three places:
 *   1. the "Matcher Leads" tab here (created automatically),
 *   2. the "UG/PG" tab of the Website leads sheet (CONFIG.webLeadsId), source "Chiwchiw Match",
 *   3. two emails: an alert to CONFIG.alertTo and the match report to the student
 *      ("Report sent?" turns Yes). The report is built from the match saved on
 *      Google's side when the quiz ran, never from text the browser sends, so the
 *      form can't be used to send someone else's words from your Gmail.
 * The first deploy after this change asks for two new permissions (open another
 * spreadsheet, send email as you). Gmail allows ~100 emails/day on a free account,
 * ~1,500 on Google Workspace; when the quota runs out the lead is still saved.
 *
 * AI MATCHING (Claude by Anthropic)
 * The rules below shortlist ~15 programmes; Claude picks the best one from that
 * shortlist and writes the reasons, preparation steps and timeline in Thai.
 * It only sees the shortlisted, student-facing fields — never the whole sheet.
 * 1. Get an API key at https://console.anthropic.com → API Keys.
 * 2. Apps Script → Project Settings → Script properties → Add:
 *      ANTHROPIC_API_KEY = sk-ant-…
 * Without a key (or if the AI fails, refuses, or the daily limit is reached)
 * the page still shows the rule-based best match with a standard plan.
 */

var CONFIG = {
  dataSheet: 'Master Data',
  leadsSheet: 'Matcher Leads',
  statsSheet: 'Matcher Stats',          // one anonymous row per visit (no names or emails)
  dashSheet: 'Matcher Dashboard',       // totals and charts-ready tables, built from the two tabs above
  onlyCanApply: false,     // true = hide programmes where "Chinese Chiwchiw Can Apply?" isn't Yes
  thbPerRmb: 4.6,          // keep in sync with data-rate on the page
  pageSize: 12,
  maxPageSize: 24,
  cacheSeconds: 600,       // sheet edits show on the site within ~10 minutes
  answerSeconds: 1800,     // a ready-made answer (list page, search) is reused for 30 minutes
  aiModel: 'claude-sonnet-5-5',
  aiEffort: 'low',         // low keeps answers fast; medium/high think longer and cost more
  aiShortlist: 10,         // fewer candidates = a faster AI answer
  aiDailyLimit: 300,       // AI calls per day; after that the rule-based plan is used
  aiCacheSeconds: 21600,   // same answers within 6 hours reuse the saved AI result
  leadsPerHour: 60,        // spam guard: at most this many new leads are saved per hour
  statsPerHour: 1500,      // and at most this many new visit rows
  webLeadsId: '1JsmK4E5_GQb3IZP4h7tMGi3dyiNCZHgnVOj3plTly4o',   // "Website leads" sheet ('' = off)
  webLeadsTab: 'UG/PG',
  alertTo: 'admin@chinesechiwchiw.com',   // new-lead alert ('' = off)
  sendReport: true,        // email the match report to the student
  lineUrl: 'https://lin.ee/C0CmZGa',   // official LINE OA link (opens the LINE app on phones)
  siteUrl: 'https://chinesechiwchiw.com/'
};

/* ───────────── reference tables ───────────── */

var TIERS = {THU:['C9','985','211','DFC'],PKU:['C9','985','211','DFC'],FUDAN:['C9','985','211','DFC'],SJTU:['C9','985','211','DFC'],ZJU:['C9','985','211','DFC'],NJU:['C9','985','211','DFC'],USTC:['C9','985','211','DFC'],HIT:['C9','985','211','DFC'],XJTU:['C9','985','211','DFC'],
  BUAA:['985','211','DFC'],BIT:['985','211','DFC'],DUT:['985','211','DFC'],WHU:['985','211','DFC'],CQU:['985','211','DFC'],ECNU:['985','211','DFC'],HNU:['985','211','DFC'],OUC:['985','211','DFC'],RUC:['985','211','DFC'],SYSU:['985','211','DFC'],SCUT:['985','211','DFC'],SCU:['985','211','DFC'],
  SWUFE:['211','DFC'],GXU:['211','DFC'],JNU:['211','DFC'],JINAN:['211','DFC'],SISU:['211','DFC'],SCNU:['211','DFC'],SILC:['211','SF'],SWPU:['DFC'],NUIST:['DFC'],NBU:['DFC'],SUSTECH:['DFC'],XJTLU:['SF'],BLCU:['DFC']};

var CITY_TH = {Shanghai:'เซี่ยงไฮ้',Beijing:'ปักกิ่ง',Chengdu:'เฉิงตู',Guangzhou:'กวางโจว',Qingdao:'ชิงเต่า',Hangzhou:'หางโจว',Nanjing:'หนานจิง',Wuhan:'อู่ฮั่น',"Xi'an":'ซีอาน',Shenzhen:'เซินเจิ้น',Tianjin:'เทียนจิน',Kunming:'คุนหมิง',Xiamen:'เซี่ยเหมิน',Chongqing:'ฉงชิ่ง',Harbin:'ฮาร์บิน',Dalian:'ต้าเหลียน',Changsha:'ฉางซา',Jinan:'จี่หนาน',Suzhou:'ซูโจว',Nanning:'หนานหนิง',Hefei:'เหอเฝย',Shenyang:'เสิ่นหยาง',Zhengzhou:'เจิ้งโจว',Fuzhou:'ฝูโจว',Wuxi:'อู๋ซี',Ningbo:'หนิงปัว',Zhuhai:'จูไห่',Quanzhou:'เฉวียนโจว',Kunshan:'คุนซาน',Zhenjiang:'เจิ้นเจียง',Weihai:'เวยไห่',Yantai:'เยียนไถ',Changchun:'ฉางชุน',Lanzhou:'หลานโจว',Guiyang:'กุ้ยหยาง',Taiyuan:'ไท่หยวน',Nanchang:'หนานชาง',Haikou:'ไหโข่ว',Guilin:'กุ้ยหลิน',Shijiazhuang:'สือเจียจวง',Urumqi:'อุรุมชี',Hohhot:'ฮูฮอต',Xining:'ซีหนิง',Yinchuan:'อิ๋นชวน',Lhasa:'ลาซา',Wenzhou:'เวินโจว',Shaoxing:'เซ่าซิง',Jinhua:'จินหัว',Yangzhou:'หยางโจว',Changzhou:'ฉางโจว',Nantong:'หนานทง',Xuzhou:'สวีโจว',Luoyang:'ลั่วหยาง',Mianyang:'เหมียนหยาง',"Ya'an":'หย่าอาน'};

// Order matters: first match wins. [field, sub, pattern]
var TAXO = [
  ['med','tcm',/chinese medicine|\btcm\b|acupunct|tuina/],
  ['med','dent',/dental|dentist|stomatolog/],
  ['med','pharm',/pharma/],
  ['med','nurs',/nursing/],
  ['med','mbbs',/clinical|mbbs|surgery|internal medicine|pediatric|paediatric|obstetric|gynecolog|oncolog|anesthes|radiolog|ophthalm|neurolog|psychiatr|emergency medicine|^medicine/],
  ['med','ph',/public health|health|epidemiol|biomedical|nutrition|rehabilitat|laborator|medical imaging|preventive|medic/],
  ['eng','cs',/computer|software|artificial intelligence|intelligen|\bdata\b|big data|cyber|network|internet of things|\biot\b|information security/],
  ['eng','ee',/electr|telecom|communication engineering|information engineering|microelectron|integrated circuit|optoelectr|signal/],
  ['eng','me',/mechan|automat|vehicle|robot|manufactur|aerospace|aeronaut|astronaut|control|instrument|industrial engineering/],
  ['eng','civ',/civil|architect|urban|planning|construct|transportation|hydraul|water resource|survey|landscape|geomatic/],
  ['eng','mat',/material|chemical engineering|energy|power|nuclear|petroleum|mining|textile|metallurg|environmental engineering/],
  ['soc','law',/\blaw\b|legal|juris/],
  ['soc','pol',/politic|international relation|diplomac|public admin|public policy|governance|international affairs|global affairs|marx|international studies|area studies|country and region/],
  ['biz','acc',/account|audit/],
  ['biz','econ',/econom|financ|invest|actuar|fintech|banking|insurance/],
  ['biz','trade',/trade|logistic|supply chain|e-commerce|commerce/],
  ['biz','mkt',/marketing/],
  ['biz','tour',/touris|hospitality|hotel/],
  ['biz','ba',/business|manag|mba|human resource|administration/],
  ['soc','media',/journalism|media|communication stud|broadcast|advertis|public relations/],
  ['soc','edu',/educat|pedagog|psycholog|teaching|sport|physical education/],
  ['soc','socio',/sociolog|social work|anthropolog|social science/],
  ['art','design',/design|animation|fashion/],
  ['art','fine',/fine art|\barts?\b|music|dance|drama|theat|film|painting|calligraph|photograph|television/],
  ['lang','cnlit',/chinese|tcsol|sinolog/],
  ['lang','forlang',/english|translat|interpret|japanese|korean|french|german|russian|spanish|arabic|thai|vietnam|linguist|foreign lang/],
  ['lang','hum',/histor|philosoph|cultur|archaeolog|religio|literat/],
  ['sci','math',/mathemat|statist/],
  ['sci','phys',/physic|chemi/],
  ['sci','bio',/biolog|bioinformat|ecolog|environment|marine|ocean|geograph|geolog|atmospher|astronom/],
  ['sci','agri',/agricult|crop|animal|veterin|forest|plant|food|horticult|aquacult|agronom|soil/],
  ['eng','mat',/engineering|technology/]
];

/* ───────────── Apps Script entry points ───────────── */

function doGet(e) {
  var p = (e && e.parameter) || {};
  var action = p.action || '';
  // Answers for the list (meta / search / uni) are the same for everyone with the same
  // filters, so they are kept ready for 10 minutes. Popular searches skip loading the data.
  var rkey = null, cache = CacheService.getScriptCache();
  if (action === 'ping') return json_(ping_());
  if (action === 'meta' || action === 'search' || action === 'uni') {
    rkey = 'r:' + Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.MD5,
      action + '|' + (p.f || '') + '|' + (p.name || ''), Utilities.Charset.UTF_8));
    var hit = cache.get(rkey) || readWarm_(rkey);
    if (hit) return ContentService.createTextOutput(hit).setMimeType(ContentService.MimeType.JSON);
  }
  var out, t0 = Date.now(), data;
  LOAD_PATH_ = '';
  try {
    data = getData_();
    var t1 = Date.now();
    out = handle_(action, p, data, {ai: aiPlan_, today: Utilities.formatDate(new Date(), 'Asia/Bangkok', 'yyyy-MM-dd')});
    if (action === 'match' && out && out.item) { try { out.rid = keepReport_(out, p.a); } catch (err) {} }
    if (Date.now() - t0 > 4000) logSlow_({a: action, path: LOAD_PATH_, load: t1 - t0, work: Date.now() - t1});
  } catch (err) {
    out = {error: 'unavailable'};
  }
  var text = JSON.stringify(out);
  if (rkey && !out.error && text.length < 95000) { try { cache.put(rkey, text, CONFIG.answerSeconds); } catch (err) {} }
  return ContentService.createTextOutput(text).setMimeType(ContentService.MimeType.JSON);
}

// Ready-made answers (header numbers + default lists) are also kept in Script Properties, which
// Google never clears early, so the first screen stays fast even when the cache drops them.
function readWarm_(rkey) {
  try {
    var props = PropertiesService.getScriptProperties(), n = +(props.getProperty('w:' + rkey + ':n') || 0);
    if (!n) return null;
    var b64 = '';
    for (var i = 0; i < n; i++) b64 += props.getProperty('w:' + rkey + ':' + i) || '';
    var text = unpack_(b64);
    try { CacheService.getScriptCache().put(rkey, text, CONFIG.answerSeconds); } catch (err) {}
    return text;
  } catch (err) { return null; }
}
function writeWarm_(parts) {
  var props = PropertiesService.getScriptProperties(), all = props.getProperties(), out = {}, keep = {};
  Object.keys(parts).forEach(function (rkey) {
    var b64 = pack_(parts[rkey]), size = 8000, n = Math.ceil(b64.length / size);
    if (n > 4) return;   // only small answers belong here (properties hold 500 KB in total)
    for (var i = 0; i < n; i++) out['w:' + rkey + ':' + i] = b64.substr(i * size, size);
    out['w:' + rkey + ':n'] = String(n);
  });
  Object.keys(all).forEach(function (k) { if (k.indexOf('w:') === 0 && !(k in out)) props.deleteProperty(k); });
  props.setProperties(out);
}

// Keeps the last few slow requests (timings only, no data) for the ping health check.
var LOAD_PATH_ = '';
function logSlow_(o) {
  try {
    var cache = CacheService.getScriptCache(), list = JSON.parse(cache.get('slowlog') || '[]');
    o.at = Utilities.formatDate(new Date(), 'Asia/Bangkok', 'HH:mm:ss');
    list.unshift(o);
    cache.put('slowlog', JSON.stringify(list.slice(0, 8)), 21600);
  } catch (err) {}
}

// Health check only (no sheet data): is the fast copy ready, and when was it last refreshed?
function ping_() {
  var cache = CacheService.getScriptCache(), n = +(cache.get('um:n') || 0), props = PropertiesService.getScriptProperties();
  var have = n ? Object.keys(cache.getAll(Array.apply(null, Array(n)).map(function (_, i) { return 'um:' + i; }))).length : 0;
  var last = +(props.getProperty('lastRefresh') || 0);
  return {slow: JSON.parse(cache.get('slowlog') || '[]'), fastCopy: !!n && have === n, chunks: n, autoRefresh: props.getProperty('autoRefresh') === 'on',
    minutesSinceRefresh: last ? Math.round((Date.now() - last) / 60000) : null, refreshSeconds: +(props.getProperty('refreshSeconds') || 0)};
}

function doPost(e) {
  var out;
  try {
    var body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    out = body.t === 'stats' ? saveStats_(body) : saveLead_(body);
  } catch (err) {
    out = {error: 'invalid'};
  }
  return json_(out);
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

// Data is built from the sheet, gzipped, and kept in two places:
//  • CacheService (fastest, but small and short-lived)
//  • a hidden tab "_matcher_cache" in this spreadsheet (private, survives restarts)
// setupAutoRefresh() rebuilds it every 10 minutes so visitors never wait for a rebuild.
var CACHE_TAB_ = '_matcher_cache';

function getData_() {
  var cache = CacheService.getScriptCache(), n = +(cache.get('um:n') || 0);
  if (n) {
    var keys = [];
    for (var i = 0; i < n; i++) keys.push('um:' + i);
    var got = cache.getAll(keys);
    if (Object.keys(got).length === n) {
      var b64 = '';
      for (var j = 0; j < n; j++) b64 += got['um:' + j];
      try { LOAD_PATH_ = 'cache'; return hydrate_(JSON.parse(unpack_(b64))); } catch (err) {}
    }
  }
  LOAD_PATH_ = 'sheet';
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var saved = readSaved_(ss), age = saved ? Date.now() - saved.t : Infinity;
  var auto = PropertiesService.getScriptProperties().getProperty('autoRefresh') === 'on';
  if (saved && (auto || age < CONFIG.cacheSeconds * 1000)) {
    putCache_(saved.b64, auto ? 3600 : CONFIG.cacheSeconds);
    return hydrate_(JSON.parse(unpack_(saved.b64)));
  }
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(500)) {
    if (saved) return hydrate_(JSON.parse(unpack_(saved.b64)));   // someone else is rebuilding; use the older copy
    lock.waitLock(120000);
    var fresh = readSaved_(ss);
    if (fresh) { lock.releaseLock(); return hydrate_(JSON.parse(unpack_(fresh.b64))); }
  }
  try {
    LOAD_PATH_ = 'rebuild';
    return rebuild_(ss);
  } finally {
    lock.releaseLock();
  }
}

function buildData_(ss) {
  var data = {rows: readProgrammes_(ss).rows, profiles: {}};
  // Any tab whose first row has "University" plus a description, logo or photo column
  // counts as profile data, whatever the tab is called.
  ss.getSheets().forEach(function (t) {
    var n = t.getName();
    if (n === CONFIG.dataSheet || n === CONFIG.leadsSheet || n === CONFIG.statsSheet || n === CONFIG.dashSheet || SKIP_TABS_[n] || t.getLastRow() < 2) return;
    var head = t.getRange(1, 1, 1, Math.max(1, t.getLastColumn())).getDisplayValues()[0].join('|').toLowerCase();
    if (!/(^|\|)university( name)?( \((en|english)\))?(\||$)/.test(head) || !/description|logo|photo/.test(head)) return;
    // Cells that show a picture via =IMAGE("https://…") display as empty, so use the link inside the formula.
    var range = t.getDataRange(), vals = range.getDisplayValues(), forms = range.getFormulas();
    for (var i = 0; i < vals.length; i++) for (var j = 0; j < vals[i].length; j++) {
      var m = !vals[i][j] && forms[i][j] && forms[i][j].match(/IMAGE\(\s*"([^"]+)"/i);
      if (m) vals[i][j] = m[1];
    }
    mergeProfiles_(data.profiles, buildProfiles_(vals));
  });
  return data;
}

function rebuild_(ss, ttl) {
  var data = buildData_(ss), b64 = pack_(JSON.stringify(slim_(data)));
  writeSaved_(ss, b64);
  putCache_(b64, ttl);
  return data;
}

function pack_(str) {
  return Utilities.base64Encode(Utilities.gzip(Utilities.newBlob(str, 'application/json')).getBytes());
}
function unpack_(b64) {
  return Utilities.ungzip(Utilities.newBlob(Utilities.base64Decode(b64), 'application/x-gzip')).getDataAsString('UTF-8');
}

function putCache_(b64, ttl) {
  var size = 95000, parts = {}, count = Math.ceil(b64.length / size);
  for (var k = 0; k < count; k++) parts['um:' + k] = b64.substr(k * size, size);
  parts['um:n'] = String(count);
  try { CacheService.getScriptCache().putAll(parts, ttl || CONFIG.cacheSeconds); } catch (err) {}
}

function readSaved_(ss) {
  var sh = ss.getSheetByName(CACHE_TAB_);
  if (!sh || sh.getLastRow() < 2) return null;
  var v = sh.getRange(1, 1, sh.getLastRow(), 1).getValues(), t = +v[0][0];
  if (!t) return null;
  var b64 = '';
  for (var i = 1; i < v.length; i++) b64 += String(v[i][0]).slice(1);   // each chunk starts with "x" so Sheets keeps it as text
  return b64 ? {t: t, b64: b64} : null;
}

function writeSaved_(ss, b64) {
  var sh = ss.getSheetByName(CACHE_TAB_);
  if (!sh) { sh = ss.insertSheet(CACHE_TAB_); sh.hideSheet(); }
  var size = 45000, rows = [[String(Date.now())]];
  for (var k = 0; k < b64.length; k += size) rows.push(['x' + b64.substr(k, size)]);
  sh.clear();
  sh.getRange(1, 1, rows.length, 1).setNumberFormat('@').setValues(rows);
}

// Time-trigger target. Rebuilds the saved copy from the sheet.
function refreshMatcherData() {
  var started = Date.now(), props = PropertiesService.getScriptProperties();
  // Kept for an hour; the trigger replaces it every 10 minutes, so it never runs out between runs.
  var data = rebuild_(SpreadsheetApp.getActiveSpreadsheet(), 3600), cache = CacheService.getScriptCache(), parts = {};
  var keyOf = function (a, f, name) {
    return 'r:' + Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, a + '|' + f + '|' + name, Utilities.Charset.UTF_8));
  };
  var add = function (a, fObj) {
    var f = fObj ? JSON.stringify(fObj) : '', text = JSON.stringify(handle_(a, {f: f, name: ''}, data, {}));
    if (text.length < 95000) parts[keyOf(a, f, '')] = text;
    return JSON.parse(text);
  };
  // Pre-compute what most visitors see first: header numbers, every page of the default
  // university list and the first course pages. (Kept small so the cache doesn't drop the data copy.)
  add('meta', null);
  var first = add('search', defaultSearch_('uni'));
  for (var pg = 2; first.total && pg <= Math.ceil(first.total / first.size); pg++) add('search', defaultSearch_('uni', pg));
  for (var pp = 1; pp <= 3; pp++) add('search', defaultSearch_('prog', pp));
  try { cache.putAll(parts, CONFIG.answerSeconds + 600); } catch (err) {}
  try { writeWarm_(parts); } catch (err) {}
  props.setProperties({autoRefresh: 'on', lastRefresh: String(Date.now()), refreshSeconds: String(Math.round((Date.now() - started) / 1000))});
}

// Must match the first request the page sends (F in the page script, plus view and page).
function defaultSearch_(view, page) {
  return {q: '', uni: '', lv: [], city: [], sub: [], lang: [], tier: [], max: 0, myHsk: '', open: false, nohsk: false, nocsca: false, sch: false, sort: 'rel', view: view, page: page || 1};
}


// Run ONCE from the Apps Script editor (select setupAutoRefresh → Run).
// Rebuilds the data now and then every 10 minutes, so sheet edits reach the
// website within ~10 minutes and visitors never wait for a rebuild.
function setupAutoRefresh() {
  ScriptApp.getProjectTriggers().forEach(function (tr) {
    if (tr.getHandlerFunction() === 'refreshMatcherData') ScriptApp.deleteTrigger(tr);
  });
  ScriptApp.newTrigger('refreshMatcherData').timeBased().everyMinutes(10).create();
  PropertiesService.getScriptProperties().setProperty('autoRefresh', 'on');
  refreshMatcherData();
  var data = getData_();
  SpreadsheetApp.getActiveSpreadsheet().toast('Auto refresh is on. ' + data.rows.length + ' programmes saved for the website.', 'University Matcher', 8);
}

// Programme rows come from Master Data plus every other tab laid out the same way
// (e.g. one tab per university). A tab counts if one of its first 5 rows has both
// "University" and "Programme / Major". Rows already read (same Programme ID, or same
// university + level + programme + teaching language) are skipped, Master Data first.
var SKIP_TABS_ = {'Profile Check': 1, 'Data Check': 1, '_matcher_cache': 1};

function headerRow_(values) {
  for (var i = 0; i < Math.min(5, values.length); i++) {
    var h = values[i].map(function (x) { return String(x).trim().toLowerCase(); });
    if (h.indexOf('university') > -1 && h.indexOf('programme / major') > -1) return i;
  }
  return -1;
}

function readProgrammes_(ss, stats) {
  var sheets = ss.getSheets().filter(function (t) {
    var n = t.getName();
    return !SKIP_TABS_[n] && n !== CONFIG.leadsSheet && n !== CONFIG.statsSheet && n !== CONFIG.dashSheet && t.getLastRow() > 1;
  });
  sheets.sort(function (a, b) { return (b.getName() === CONFIG.dataSheet) - (a.getName() === CONFIG.dataSheet); });
  var rows = [], seen = {}, tabs = [];
  sheets.forEach(function (t) {
    var values = t.getDataRange().getDisplayValues(), hi = headerRow_(values);
    if (hi < 0) return;
    var got = buildRows_(values.slice(hi), stats), added = 0, dup = 0;
    got.forEach(function (r) {
      var k = r.id ? 'id:' + r.id.toLowerCase() : 'k:' + [r.u, r.lv, r.prog, r.lang].join('|').toLowerCase();
      if (seen[k]) { dup++; return; }
      seen[k] = 1; rows.push(r); added++;
    });
    tabs.push({name: t.getName(), rows: values.length - 1 - hi, added: added, dup: dup});
  });
  return {rows: rows, tabs: tabs};
}

// Run from the Apps Script editor (select checkData → Run). Writes a "Data Check" tab
// explaining how many Master Data rows the website uses and why the others are skipped.
function checkData() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var st = {blank: 0, missingName: 0, duplicate: 0, cannotApply: {}, skippedUnis: {}};
  var read = readProgrammes_(ss, st), rows = read.rows, used = {}, total = 0;
  read.tabs.forEach(function (t) { total += t.rows; });
  rows.forEach(function (r) { used[r.u] = (used[r.u] || 0) + 1; });
  var out = [['Check', 'Count', 'Notes'],
    ['Rows in programme tabs (below the header)', total, read.tabs.length + ' tabs read'],
    ['Rows shown on the website', rows.length, Object.keys(used).length + ' universities'],
    ['Skipped: completely empty rows', st.blank, 'Normal — the sheet has spare empty rows'],
    ['Skipped: University or Programme / Major is empty', st.missingName, 'Fill both columns to include these rows'],
    ['Skipped: marked as duplicate', st.duplicate, 'From the "Duplicate Check" column']];
  Object.keys(st.cannotApply).forEach(function (v) {
    out.push(['Skipped: "Chinese Chiwchiw Can Apply?" = ' + v, st.cannotApply[v], 'Only "Yes" rows are shown (CONFIG.onlyCanApply)']);
  });
  out.push(['', '', ''], ['Tab', 'Programmes used', 'Already read in an earlier tab']);
  read.tabs.forEach(function (t) { out.push([t.name, t.added, t.dup]); });
  out.push(['', '', ''], ['Universities on the website', 'Programmes', '']);
  Object.keys(used).sort().forEach(function (u) { out.push([u, used[u], '']); });
  var skippedNames = Object.keys(st.skippedUnis).filter(function (u) { return !used[u]; }).sort();
  if (skippedNames.length) {
    out.push(['', '', ''], ['Universities hidden by "Can Apply?"', 'Rows', '']);
    skippedNames.forEach(function (u) { out.push([u, st.skippedUnis[u], '']); });
  }
  var sh = ss.getSheetByName('Data Check') || ss.insertSheet('Data Check');
  sh.clear();
  sh.getRange(1, 1, out.length, 3).setValues(out);
  sh.setFrozenRows(1);
  sh.autoResizeColumn(1);
  ss.toast(rows.length + ' programmes from ' + Object.keys(used).length + ' universities are shown on the website. See the Data Check tab.', 'Data Check', 10);
}

// Run from the Apps Script editor (select checkProfiles → Run). Writes a "Profile Check"
// tab showing which universities still need a description, campus photo or logo.
function checkProfiles() {
  var data = rebuild_(SpreadsheetApp.getActiveSpreadsheet()), count = {};
  data.rows.forEach(function (r) { count[r.u] = (count[r.u] || 0) + 1; });
  var out = [['University', 'Programmes', 'Description', 'Campus photo', 'Logo']], missing = 0;
  Object.keys(count).sort().forEach(function (u) {
    var p = profileOf_(data.profiles, u);
    if (!p.desc || !p.photo || !p.logo) missing++;
    out.push([u, count[u], p.desc ? '✓' : 'missing', p.photo ? '✓' : 'missing', p.logo ? '✓' : 'missing']);
  });
  var ss = SpreadsheetApp.getActiveSpreadsheet(), sh = ss.getSheetByName('Profile Check') || ss.insertSheet('Profile Check');
  sh.clear();
  sh.getRange(1, 1, out.length, out[0].length).setValues(out);
  sh.setFrozenRows(1);
  SpreadsheetApp.getActiveSpreadsheet().toast((out.length - 1) + ' universities checked, ' + missing + ' need something.', 'Profile Check', 8);
}

function saveLead_(b) {
  if (b.hp) return {ok: true};
  var name = clean_(b.name, 100), email = clean_(b.email, 150).toLowerCase();
  var line = clean_(b.line, 60), phone = clean_(b.phone, 30);
  if (!name || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return {error: 'invalid'};
  if (phone && !/^[0-9+\-\s()]{6,30}$/.test(phone)) return {error: 'invalid'};
  if (!b.consent) return {error: 'consent'};
  var cache = CacheService.getScriptCache(), key = 'lead:' + email;
  if (cache.get(key)) return {ok: true};
  // At most CONFIG.leadsPerHour new leads an hour, so an automated flood can't fill the sheet.
  var hourKey = 'leads:' + Utilities.formatDate(new Date(), 'Asia/Bangkok', 'yyyyMMddHH'), n = +(cache.get(hourKey) || 0);
  if (n >= CONFIG.leadsPerHour) return {error: 'busy'};
  cache.put(hourKey, String(n + 1), 3700);
  // The match this student saw, as saved on Google's side by doGet (see keepReport_).
  var rid = clean_(b.rid, 40), rep = null;
  if (/^[0-9a-f-]{36}$/.test(rid)) { try { rep = JSON.parse(cache.get('rep:' + rid) || 'null'); } catch (err) {} }
  var lead = {name: name, email: email, line: line, phone: phone, answers: clean_(b.answers, 600), marketing: b.marketing === true,
    matchId: rep ? rep.id : clean_(b.matchId, 40), matchUni: rep ? rep.u : clean_(b.matchUni, 150),
    matchProg: rep ? rep.prog : clean_(b.matchProg, 200), exact: rep ? rep.exact : !!b.exact, q: b.q && typeof b.q === 'object' ? b.q : {},
    page: /^https:\/\/chinesechiwchiw\.com\//.test(String(b.page || '')) ? clean_(b.page, 300) : ''};
  var sh, row, lock = LockService.getScriptLock();
  lock.waitLock(5000);
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    sh = ss.getSheetByName(CONFIG.leadsSheet);
    if (!sh) {
      sh = ss.insertSheet(CONFIG.leadsSheet);
      sh.appendRow(['Timestamp', 'Name', 'Email', 'LINE ID', 'Phone', 'Quiz answers', 'Matched Programme ID', 'Matched University', 'Matched Programme', 'Exact match?', 'Privacy consent', 'Email list opt-in', 'Report sent?']);
    }
    sh.appendRow([new Date(), safe_(name), safe_(email), safe_(line), safe_(phone), safe_(lead.answers),
      safe_(lead.matchId), safe_(lead.matchUni), safe_(lead.matchProg), lead.exact ? 'Yes' : 'Closest',
      'Yes', lead.marketing ? 'Yes' : 'No', '']);
    row = sh.getLastRow();
  } finally {
    lock.releaseLock();
  }
  cache.put(key, '1', 60);
  // Everything below is extra: if one step fails, the lead above is already saved.
  try { webLead_(lead, rep); } catch (err) { console.error('Website leads: ' + err); }
  var sent = 'No';
  try { sent = sendReport_(lead, rep); } catch (err) { sent = 'Failed'; console.error('Report email: ' + err); }
  try { sh.getRange(row, 13).setValue(sent); } catch (err) {}
  try { sendAlert_(lead, rep, sent); } catch (err) { console.error('Alert email: ' + err); }
  return {ok: true};
}

// Saves the student-facing part of a match for 6 hours, so the report email shows
// exactly what the student saw. Returns the id the page sends back with the lead form.
function keepReport_(out, rawAnswers) {
  var it = out.item, u = out.uni || {}, pl = out.plan || {}, rid = Utilities.getUuid();
  var rep = {id: it.id, u: it.u, short: u.short || shortName_(it.u), cn: u.cn || it.cn, city: it.city, prog: clean_(it.prog, 200), track: clean_(it.track, 150),
    lv: it.lv, lang: it.lang, dur: it.dur, tu: it.tu, tot: it.tot, hsk: it.hsk, hskTxt: it.hskTxt, ielts: it.ielts, dl: it.dl, past: it.past, sch: it.sch,
    exact: !!out.exact, ai: !!out.ai,
    others: (out.others || []).map(function (o) { return {short: o.short || o.name, cn: o.cn, city: o.city}; }),
    plan: {headline: pl.headline || '', why_fit: pl.why_fit || [], watch_out: pl.watch_out || [], prepare: pl.prepare || [], timeline: pl.timeline || []}};
  CacheService.getScriptCache().put('rep:' + rid, JSON.stringify(rep), 21600);
  return rid;
}

// Adds the lead to the "UG/PG" tab of the Website leads sheet, matching its header row by name.
function webLead_(L, rep) {
  if (!CONFIG.webLeadsId) return;
  var sh = SpreadsheetApp.openById(CONFIG.webLeadsId).getSheetByName(CONFIG.webLeadsTab);
  if (!sh) return;
  var q = L.q, t = function (k, max) { return clean_(q[k], max || 150); };
  var val = {
    timestamp: new Date().toISOString(), nickname: L.name, who: '', grade: '',
    line_or_phone: [L.line, L.phone].filter(String).join(' / '), email: L.email,
    intake: t('intake'), level: t('level'), field: t('field', 300), teach_lang: t('lang'), budget: t('budget'),
    city_vibe: t('cities', 300), test_scores: t('tests'),
    result_city: rep ? cityTh_(rep.city) : '',
    recommended_1: L.matchUni ? L.matchUni + (L.matchProg ? ' — ' + L.matchProg : '') : '',
    recommended_2: rep ? rep.others.map(function (o) { return o.short; }).join(', ') : '',
    province_interest: '', contact_consent: 'yes', marketing_consent: L.marketing ? 'yes' : 'no',
    source: 'Chiwchiw Match', page: L.page || CONFIG.siteUrl + 'university-match/'
  };
  var head = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  sh.appendRow(head.map(function (h) { var v = val[String(h).trim()]; return v == null ? '' : safe_(String(v)); }));
}

/* ───────────── visit stats ───────────── */

var STATS_HEAD_ = ['เวลา', 'Visit', 'อุปกรณ์', 'มาจาก', 'ตอบ quiz (ข้อ)', 'ดูผลแล้ว', 'ส่งอีเมลแล้ว', 'มหาลัยที่ได้',
  'คำตอบ quiz', 'คำค้นหา', 'ตัวกรองที่ใช้', 'มหาลัยที่เปิดดู', 'คลิก', 'เวลาบนหน้า (วินาที)'];

// The page sends its row when the visitor leaves or switches tab, and again if they come back
// and do more; the same visit id updates its own row instead of adding a new one.
function saveStats_(b) {
  var sid = clean_(b.sid, 30);
  if (!/^[a-z0-9]{8,30}$/.test(sid)) return {ok: true};
  var list = function (v) {
    return (Array.isArray(v) ? v : []).slice(0, 15).map(function (x) { return clean_(x, 60).replace(/\|/g, '/'); }).filter(String).join(' | ');
  };
  var step = Math.max(0, Math.min(8, Math.floor(+b.step || 0)));
  var row = [sid, b.dev === 'mobile' ? 'มือถือ' : 'คอม', clean_(b.src, 60) || 'direct', step, b.done ? 1 : 0, b.email ? 1 : 0,
    clean_(b.uni, 120), clean_(b.ans, 400), list(b.q), list(b.fl), list(b.unis), list(b.cl), Math.max(0, Math.min(86400, Math.round(+b.secs || 0)))]
    .map(function (v) { return typeof v === 'string' ? safe_(v) : v; });
  var cache = CacheService.getScriptCache(), rk = 'srow:' + sid, at = +(cache.get(rk) || 0);
  if (!at) {
    var hourKey = 'stats:' + Utilities.formatDate(new Date(), 'Asia/Bangkok', 'yyyyMMddHH'), n = +(cache.get(hourKey) || 0);
    if (n >= CONFIG.statsPerHour) return {ok: true};
    cache.put(hourKey, String(n + 1), 3700);
  }
  var lock = LockService.getScriptLock();
  try { lock.waitLock(5000); } catch (err) { return {ok: true}; }
  try {
    var sh = statsSheet_();
    if (at && at <= sh.getLastRow() && sh.getRange(at, 2).getValue() === sid) {
      sh.getRange(at, 2, 1, row.length).setValues([row]);
    } else {
      sh.appendRow([new Date()].concat(row));
      cache.put(rk, String(sh.getLastRow()), 21600);
    }
  } finally {
    lock.releaseLock();
  }
  return {ok: true};
}

function statsSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet(), sh = ss.getSheetByName(CONFIG.statsSheet);
  if (sh) return sh;
  sh = ss.insertSheet(CONFIG.statsSheet);
  sh.appendRow(STATS_HEAD_);
  sh.setFrozenRows(1);
  sh.getRange(1, 1, 1, STATS_HEAD_.length).setFontWeight('bold').setBackground('#FFF1E6');
  sh.getRange('A:A').setNumberFormat('yyyy-mm-dd hh:mm');
  try { setupMatcherDashboard(); } catch (err) { console.error('Dashboard: ' + err); }
  return sh;
}

// Builds (or rebuilds) the "Matcher Dashboard" tab. Everything on it is a formula over
// "Matcher Stats" and "Matcher Leads", so it updates by itself.
function setupMatcherDashboard() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss.getSheetByName(CONFIG.statsSheet)) { statsSheet_(); return; }   // statsSheet_ builds the dashboard
  var old = ss.getSheetByName(CONFIG.dashSheet);
  if (old) ss.deleteSheet(old);
  var d = ss.insertSheet(CONFIG.dashSheet, 0), S = "'" + CONFIG.statsSheet + "'!", L = "'" + CONFIG.leadsSheet + "'!";
  var top = function (col, label, limit) {
    return '=IFERROR(QUERY(FLATTEN(ARRAYFORMULA(IFERROR(TRIM(SPLIT(' + S + col + '2:' + col + ',"|"))))),"select Col1, count(Col1) where Col1 <> \'\' group by Col1 order by count(Col1) desc limit ' +
      limit + ' label Col1 \'' + label + '\', count(Col1) \'ครั้ง\'",0),"ยังไม่มีข้อมูล")';
  };
  var cells = [
    ['A1', '📊 Chiwchiw Match — สถิติ (อัปเดตอัตโนมัติ)'],
    ['A3', 'ผู้เข้าชมหน้า Matcher'], ['B3', '=COUNTA(' + S + 'B2:B)'],
    ['A4', 'เริ่มทำ quiz (ตอบ ≥ 1 ข้อ)'], ['B4', '=COUNTIF(' + S + 'E2:E,">=1")'],
    ['A5', 'ตอบครบ 8 ข้อ (ถึงหน้ากรอกอีเมล)'], ['B5', '=COUNTIF(' + S + 'E2:E,">=8")'],
    ['A6', 'กรอกอีเมล + ดูผลจับคู่'], ['B6', '=SUM(' + S + 'F2:F)'],
    ['A7', 'Lead ที่บันทึกสำเร็จ (ตั้งแต่เริ่มเก็บสถิติ)'], ['B7', '=SUM(' + S + 'G2:G)'],
    ['A8', '% ผู้เข้าชม → lead'], ['B8', '=IFERROR(B7/B3,0)'],
    ['A9', '% ตอบครบ 8 ข้อ → กรอกอีเมล'], ['B9', '=IFERROR(B6/B5,0)'],
    ['A10', 'ใช้ช่องค้นหา / ตัวกรอง'], ['B10', '=SUMPRODUCT((LEN(' + S + 'J2:J)+LEN(' + S + 'K2:K)>0)*1)'],
    ['A11', 'คลิก LINE'], ['B11', '=COUNTIF(' + S + 'M2:M,"*LINE*")'],
    ['A12', 'เวลาเฉลี่ยบนหน้า (นาที)'], ['B12', '=IFERROR(ROUND(AVERAGE(' + S + 'N2:N)/60,1),0)'],
    ['A13', 'Lead ทั้งหมดใน Matcher Leads'], ['B13', '=IFERROR(COUNTA(' + L + 'A2:A),0)'],
    ['A14', 'AI จับคู่ทั้งหมด (นับตั้งแต่เปิดใช้)'], ['B14', '=SUM(V3:V)'],
    ['D2', 'ตอบ quiz ถึงข้อ'], ['E2', 'คน'],
    ['G2', 'รายวัน'],
    ['G3', '=IFERROR(QUERY(' + S + 'A2:G,"select toDate(A), count(B), sum(F), sum(G) where A is not null group by toDate(A) order by toDate(A) desc label toDate(A) \'วันที่\', count(B) \'ผู้เข้าชม\', sum(F) \'ดูผล\', sum(G) \'Lead\'",0),"ยังไม่มีข้อมูล")'],
    ['L2', 'AI จับคู่ให้บ่อยที่สุด'],
    ['L3', '=IFERROR(QUERY(' + S + 'H2:H,"select H, count(H) where H <> \'\' group by H order by count(H) desc limit 10 label H \'มหาลัย\', count(H) \'ครั้ง\'",0),"ยังไม่มีข้อมูล")'],
    ['L16', 'มหาลัยที่คนเปิดดูมากสุด'], ['L17', top('L', 'มหาลัย', 15)],
    ['O2', 'คำค้นหายอดนิยม'], ['O3', top('J', 'คำค้นหา', 15)],
    ['O20', 'ตัวกรองที่ใช้บ่อย'], ['O21', top('K', 'ตัวกรอง', 15)],
    ['R2', 'คลิก'], ['R3', top('M', 'ปุ่ม', 12)],
    ['A17', 'มาจากไหน'],
    ['A18', '=IFERROR(QUERY(' + S + 'D2:D,"select D, count(D) where D <> \'\' group by D order by count(D) desc limit 15 label D \'ที่มา\', count(D) \'คน\'",0),"ยังไม่มีข้อมูล")'],
    ['D14', 'อุปกรณ์'],
    ['D15', '=IFERROR(QUERY(' + S + 'C2:C,"select C, count(C) where C <> \'\' group by C label C \'อุปกรณ์\', count(C) \'คน\'",0),"ยังไม่มีข้อมูล")'],
    ['U1', 'ก่อนมีสถิติ: AI จับคู่ต่อวัน'], ['U2', 'วันที่'], ['V2', 'ครั้ง'],
    ['X1', 'Lead ต่อวัน (Matcher Leads)'],
    ['X2', '=IFERROR(QUERY(' + L + 'A2:A,"select toDate(A), count(A) where A is not null group by toDate(A) order by toDate(A) desc label toDate(A) \'วันที่\', count(A) \'Lead\'",0),"ยังไม่มีข้อมูล")']
  ];
  for (var k = 1; k <= 8; k++) cells.push(['D' + (k + 2), k], ['E' + (k + 2), '=COUNTIF(' + S + 'E2:E,">=' + k + '")']);
  cells.forEach(function (c) {
    var r = d.getRange(c[0]);
    if (typeof c[1] === 'string' && c[1].charAt(0) === '=') r.setFormula(c[1]); else r.setValue(c[1]);
  });
  // AI matches per day, counted by takeAiQuota_ since launch (repeat answers served from the
  // 6-hour cache aren't counted, so real quiz runs were a little higher).
  var props = PropertiesService.getScriptProperties().getProperties(), hist = [];
  Object.keys(props).forEach(function (key) { var m = key.match(/^aiCount:(\d{4}-\d{2}-\d{2})$/); if (m) hist.push([m[1], +props[key] || 0]); });
  hist.sort(function (x, y) { return x[0] < y[0] ? 1 : -1; });
  if (hist.length) d.getRange(3, 21, hist.length, 2).setValues(hist);
  d.getRange('A1').setFontSize(16).setFontWeight('bold').setFontColor('#FF6B00');
  ['A3:A14', 'D2:E2', 'G2', 'L2', 'L16', 'O2', 'O20', 'R2', 'A17', 'D14', 'U1:V2', 'X1'].forEach(function (a) { d.getRange(a).setFontWeight('bold'); });
  d.getRange('B3:B14').setFontWeight('bold').setFontColor('#1A0A00').setBackground('#FFF1E6');
  d.getRange('B8:B9').setNumberFormat('0.0%');
  ['G4:G', 'U3:U', 'X3:X'].forEach(function (a) { d.getRange(a).setNumberFormat('dd/mm/yyyy'); });   // QUERY's toDate() shows as a plain number otherwise
  d.setColumnWidth(1, 270);
  d.setFrozenRows(1);
}

/* ───────────── emails ───────────── */

var LV_TH_ = {UG: 'ปริญญาตรี', PG: 'ปริญญาโท', PHD: 'ปริญญาเอก', LANG: 'คอร์สภาษาจีน'};
function h_(v) { return String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
function commas_(n) { return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }
function cityTh_(c) { return CITY_TH[c] ? CITY_TH[c] + ' (' + c + ')' : String(c || ''); }
function langTh_(l) { return l === 'zh' ? 'ภาษาจีน' : l === 'en' ? 'ภาษาอังกฤษ' : 'จีน / อังกฤษ'; }
// Emails left today, or -1 when Google won't let the script send email (permission not given yet).
function mailLeft_() { try { return MailApp.getRemainingDailyQuota(); } catch (err) { console.error('MailApp: ' + err); return -1; } }

// The student's report. Returns the value for the "Report sent?" column.
function sendReport_(L, rep) {
  if (!CONFIG.sendReport) return 'Off';
  if (!rep) return 'No (match expired)';
  var cache = CacheService.getScriptCache(), mk = 'mail:' + L.email;
  if (cache.get(mk)) return 'No (sent earlier today)';   // one report per address every 6 hours
  var left = mailLeft_();
  if (left < 0) return 'No (email not allowed yet: run testEmail)';
  if (left < 2) return 'No (daily email limit)';
  var cost = rep.tot || rep.tu, pl = rep.plan, url = CONFIG.siteUrl + 'university-match/';
  var facts = [
    ['ระดับ', LV_TH_[rep.lv] || rep.lv],
    ['สอนเป็น', langTh_(rep.lang)],
    rep.dur ? ['ระยะเวลา', rep.dur + ' ปี'] : null,
    cost ? ['ค่าใช้จ่าย', '≈ ' + commas_(cost * CONFIG.thbPerRmb) + ' บาท/ปี' + (rep.tot ? ' (รวมค่าเรียน ที่พัก และค่าครองชีพโดยประมาณ)' : ' (เฉพาะค่าเรียน)')] : null,
    rep.lang !== 'en' && rep.hsk ? ['เกณฑ์ภาษาจีน', String(rep.hskTxt || 'HSK ' + rep.hsk).replace(/\s*\+\s*HSKK.*$/i, '')] : null,
    rep.lang !== 'zh' && rep.ielts ? ['เกณฑ์ภาษาอังกฤษ', 'IELTS ' + rep.ielts] : null,
    ['ปิดรับสมัคร', 'ทีม Chinese Chiwchiw จะเช็กวันปิดรับสมัครล่าสุดให้ค่ะ'],   // sheet dates are often last year's round
    rep.sch ? ['ทุนการศึกษา', 'มีทุนให้ยื่นสมัคร'] : null
  ].filter(Boolean);
  var O = '#FF6B00', D = '#1A0A00', font = "font-family:'Noto Sans Thai',Tahoma,Arial,sans-serif;";
  var list = function (title, items) {
    items = (items || []).filter(Boolean);
    if (!items.length) return '';
    return '<h3 style="margin:24px 0 8px;font-size:17px;color:' + D + '">' + title + '</h3><ul style="margin:0;padding-left:20px;line-height:1.7">' +
      items.map(function (x) { return '<li>' + h_(x) + '</li>'; }).join('') + '</ul>';
  };
  // Timeline labels without years (e.g. "ต.ค. 2026" → "ต.ค."); the team confirms the real dates.
  var noYear = function (t) {
    return String(t || '').replace(/(ต้น|กลาง|ปลาย)?\s*(?:ภายใน|ใน)?ปี\s*(?:พ\.ศ\.|ค\.ศ\.)?\s*(?:20|25)\d{2}\b/g, function (m, part) { return part ? ' ' + part + 'ปี' : ''; })
      .replace(/\s*(?:พ\.ศ\.|ค\.ศ\.)?\s*(?:20|25)\d{2}\b/g, '').replace(/\s{2,}/g, ' ').trim();
  };
  var tl = (pl.timeline || []).filter(function (x) { return x && x.task; }).map(function (x) { return {when: noYear(x.when) || '•', task: noYear(x.task)}; });
  var html = '<div style="background:#FFFBF7;padding:24px 12px;' + font + 'color:' + D + '">' +
    '<div style="max-width:600px;margin:0 auto;background:#fff;border:1px solid #EDE5DC;border-radius:16px;overflow:hidden">' +
    '<div style="background:' + O + ';color:#fff;padding:22px 24px"><div style="font-size:13px;letter-spacing:1px">CHIWCHIW MATCH · CHINESE CHIWCHIW</div>' +
    '<div style="font-size:22px;font-weight:bold;margin-top:4px">รายงานผลจับคู่มหาวิทยาลัยจีนของคุณ</div></div>' +
    '<div style="padding:24px;font-size:15px;line-height:1.7">' +
    '<p style="margin:0 0 12px">สวัสดีค่ะ คุณ' + h_(L.name.slice(0, 60)) + '</p>' +
    '<p style="margin:0 0 18px">ขอบคุณที่ลองใช้ CHIWCHIW MATCH ค่ะ นี่คือหลักสูตรที่เหมาะกับคุณที่สุดจากคำตอบของคุณ พร้อมแผนเตรียมตัว</p>' +
    '<div style="border:1px solid #EDE5DC;border-radius:16px;padding:18px;background:#FFFBF7">' +
    '<div style="font-size:12px;color:' + O + ';font-weight:bold">' + (rep.exact ? '⭐ BEST MATCH' : '⭐ ใกล้เคียงที่สุด') + '</div>' +
    '<div style="font-size:20px;font-weight:bold;margin:4px 0 2px">' + h_(rep.short) + (rep.cn ? ' <span style="font-weight:normal;color:#7A6A5E">' + h_(rep.cn) + '</span>' : '') + '</div>' +
    '<div style="color:#7A6A5E">📍 ' + h_(cityTh_(rep.city)) + '</div>' +
    '<div style="font-size:16px;font-weight:bold;margin-top:10px">' + h_(rep.prog) + (rep.track ? ' <span style="font-weight:normal">· ' + h_(rep.track) + '</span>' : '') + '</div>' +
    '<table style="width:100%;border-collapse:collapse;margin-top:10px;font-size:14px">' +
    facts.map(function (f) { return '<tr><td style="padding:5px 0;color:#7A6A5E;width:38%;vertical-align:top">' + h_(f[0]) + '</td><td style="padding:5px 0;vertical-align:top">' + h_(f[1]) + '</td></tr>'; }).join('') +
    '</table></div>' +
    (pl.headline ? '<p style="margin:20px 0 0;font-size:16px;font-weight:bold;color:' + O + '">' + h_(pl.headline) + '</p>' : '') +
    list('✅ ทำไมถึงเหมาะกับคุณ', pl.why_fit) +
    list('⚠️ สิ่งที่ควรรู้', pl.watch_out) +
    list('📝 สิ่งที่ต้องเตรียม', pl.prepare) +
    (tl.length ? '<h3 style="margin:24px 0 8px;font-size:17px">🗓️ Timeline เตรียมตัว</h3><table style="width:100%;border-collapse:collapse;font-size:14px">' +
      tl.map(function (x) { return '<tr><td style="padding:7px 10px 7px 0;color:' + O + ';font-weight:bold;width:32%;vertical-align:top;border-top:1px solid #EDE5DC">' + h_(x.when) + '</td><td style="padding:7px 0;vertical-align:top;border-top:1px solid #EDE5DC">' + h_(x.task) + '</td></tr>'; }).join('') + '</table>' : '') +
    (rep.others.length ? '<h3 style="margin:24px 0 8px;font-size:17px">🏫 มหาวิทยาลัยอื่นที่น่าดู</h3><ul style="margin:0;padding-left:20px;line-height:1.7">' +
      rep.others.map(function (o) { return '<li>' + h_(o.short) + (o.cn ? ' ' + h_(o.cn) : '') + ' · ' + h_(cityTh_(o.city)) + '</li>'; }).join('') + '</ul>' : '') +
    '<div style="text-align:center;margin:28px 0 8px">' +
    '<a href="' + h_(CONFIG.lineUrl) + '" style="display:inline-block;background:#06C755;color:#fff;text-decoration:none;font-weight:bold;padding:13px 26px;border-radius:999px;margin:4px">💬 ปรึกษาฟรีทาง LINE @chiwchiw</a>' +
    '<a href="' + h_(url) + '" style="display:inline-block;background:#fff;color:' + O + ';border:1px solid ' + O + ';text-decoration:none;font-weight:bold;padding:12px 24px;border-radius:999px;margin:4px">🔎 ดูหลักสูตรอื่น</a></div>' +
    '<p style="margin:18px 0 0;font-size:13px;color:#7A6A5E">ทีม Chinese Chiwchiw จะช่วยเช็กเกณฑ์ ค่าใช้จ่าย และวันปิดรับสมัครล่าสุดกับมหาวิทยาลัยให้อีกครั้งก่อนยื่นจริง ' +
    'ตอบกลับอีเมลนี้ได้เลยหากมีคำถามค่ะ 🧡</p></div>' +
    '<div style="background:#FFFBF7;border-top:1px solid #EDE5DC;padding:14px 24px;font-size:12px;color:#9A8A7E;line-height:1.6">' +
    'ข้อมูลในรายงานนี้อ้างอิงจากฐานข้อมูลของ Chinese Chiwchiw ณ วันที่ส่ง เกณฑ์และค่าใช้จ่ายอาจเปลี่ยนแปลงตามประกาศของมหาวิทยาลัย' +
    (rep.ai ? ' · คำแนะนำเขียนโดย CHIWCHIW AI' : '') +
    '<br>คุณได้รับอีเมลนี้เพราะขอรายงานผลจาก ' + h_(url) + '</div></div></div>';
  var text = 'สวัสดีค่ะ คุณ' + L.name.slice(0, 60) + '\n\nผล CHIWCHIW MATCH ของคุณ: ' + rep.short + ' (' + cityTh_(rep.city) + ')\n' + rep.prog + '\n\n' +
    facts.map(function (f) { return f[0] + ': ' + f[1]; }).join('\n') +
    (pl.headline ? '\n\n' + pl.headline : '') +
    (tl.length ? '\n\nTimeline:\n' + tl.map(function (x) { return '• ' + x.when + ' — ' + x.task; }).join('\n') : '') +
    '\n\nปรึกษาฟรีทาง LINE: ' + CONFIG.lineUrl + '\nดูหลักสูตรอื่น: ' + url + '\n\nทีม Chinese Chiwchiw';
  MailApp.sendEmail({to: L.email, subject: 'รายงานผล CHIWCHIW MATCH ของคุณ: ' + rep.short + ' 🎓', body: text, htmlBody: html,
    name: 'Chinese Chiwchiw', replyTo: CONFIG.alertTo || undefined});
  cache.put(mk, '1', 21600);
  return 'Yes';
}

// Run from the editor (choose testEmail next to ▷ Run). The first run makes Google ask for
// permission to send email and open the Website leads sheet; then one test email goes to
// CONFIG.alertTo. If something is still blocked, the error shows in the Execution log.
function testEmail() {
  var left = MailApp.getRemainingDailyQuota();
  var tab = CONFIG.webLeadsId ? SpreadsheetApp.openById(CONFIG.webLeadsId).getSheetByName(CONFIG.webLeadsTab) : null;
  MailApp.sendEmail({to: CONFIG.alertTo, subject: 'Chiwchiw Match: อีเมลใช้งานได้แล้ว ✅',
    body: 'ระบบส่งอีเมลของ Chiwchiw Match ใช้งานได้แล้ว\nส่งได้อีกวันนี้: ' + left + ' ฉบับ\nWebsite leads tab: ' + (tab ? 'พบแล้ว' : 'ไม่พบ'), name: 'Chiwchiw Match'});
  console.log('OK: test email sent to ' + CONFIG.alertTo + ' · emails left today: ' + (left - 1) + ' · Website leads tab ' + (tab ? 'found' : 'NOT found'));
}

// Run from the editor to email the report to every lead in "Matcher Leads" whose
// "Report sent?" isn't Yes (for example leads from before the emails existed).
// Uses the matched programme from the sheet; the AI plan from that day isn't kept,
// so the email shows the programme details and invites them to talk to the team.
function sendMissingReports() {
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CONFIG.leadsSheet);
  if (!sh || sh.getLastRow() < 2) { console.log('No leads yet.'); return; }
  var rows = getData_().rows, byId = {}, done = 0;
  rows.forEach(function (r) { byId[r.id] = r; });
  var vals = sh.getRange(2, 1, sh.getLastRow() - 1, 13).getValues();
  vals.forEach(function (v, i) {
    if (String(v[12]) === 'Yes') return;
    var email = String(v[2]).trim().toLowerCase(), r = byId[String(v[6]).trim()];
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return;
    var lead = {name: String(v[1]), email: email};
    var rep = r ? JSON.parse(JSON.stringify({id: r.id, u: r.u, short: shortName_(r.u), cn: r.cn, city: r.city, prog: clean_(r.prog, 200), track: clean_(r.track, 150),
      lv: r.lv, lang: r.lang, dur: r.dur, tu: r.tu, tot: r.tot, hsk: r.hsk, hskTxt: r.hskTxt, ielts: r.ielts, dl: r.dl, past: r.past, sch: r.sch,
      exact: String(v[9]) === 'Yes', ai: false, others: [],
      plan: {headline: 'ทีม Chinese Chiwchiw พร้อมช่วยเช็กเกณฑ์และวางแผนยื่นสมัครให้ฟรี ทักมาทาง LINE ได้เลยค่ะ', why_fit: [], watch_out: [], prepare: [], timeline: []}})) : null;
    var res;
    try { res = sendReport_(lead, rep); } catch (err) { res = 'Failed'; console.error(email + ': ' + err); }
    sh.getRange(i + 2, 13).setValue(res);
    if (res === 'Yes') done++;
    console.log((i + 2) + ': ' + res);
  });
  console.log('Reports sent: ' + done);
}

// Short alert to the team. Reply goes straight to the student.
function sendAlert_(L, rep, sent) {
  if (!CONFIG.alertTo || mailLeft_() < 1) return;   // also skips when email isn't allowed yet
  var rows = [
    ['ชื่อ', L.name], ['อีเมล', L.email], ['LINE', L.line || '-'], ['โทร', L.phone || '-'],
    ['คำตอบ', L.answers || '-'],
    ['Best match', (L.matchUni || '-') + (L.matchProg ? ' — ' + L.matchProg : '') + (L.exact ? '' : ' (ใกล้เคียงที่สุด)')],
    ['มหาลัยอื่น', rep && rep.others.length ? rep.others.map(function (o) { return o.short; }).join(', ') : '-'],
    ['รับข่าวสาร', L.marketing ? 'Yes' : 'No'], ['ส่งรายงานให้นักเรียนแล้ว?', sent]
  ];
  var sheetUrl = SpreadsheetApp.getActiveSpreadsheet().getUrl();
  var html = '<div style="font-family:Tahoma,Arial,sans-serif;font-size:14px;color:#1A0A00">' +
    '<p style="margin:0 0 10px"><b style="color:#FF6B00">🎓 Lead ใหม่จาก Chiwchiw Match</b></p><table style="border-collapse:collapse">' +
    rows.map(function (r) { return '<tr><td style="padding:4px 14px 4px 0;color:#7A6A5E;vertical-align:top">' + h_(r[0]) + '</td><td style="padding:4px 0;vertical-align:top">' + h_(r[1]) + '</td></tr>'; }).join('') +
    '</table><p style="margin:14px 0 0;font-size:12px;color:#7A6A5E">กด Reply เพื่อตอบนักเรียนได้เลย · <a href="' + h_(sheetUrl) + '">เปิด Matcher Leads</a></p></div>';
  MailApp.sendEmail({to: CONFIG.alertTo, subject: '🎓 Lead ใหม่: ' + L.name.slice(0, 60) + ' → ' + (rep ? rep.short : L.matchUni || 'Chiwchiw Match'),
    body: rows.map(function (r) { return r[0] + ': ' + r[1]; }).join('\n') + '\n\n' + sheetUrl, htmlBody: html, name: 'Chiwchiw Match', replyTo: L.email});
}

function clean_(v, max) { return String(v == null ? '' : v).replace(/[\u0000-\u001f]/g, ' ').replace(/[\u200c\u200d\u2060]/g, '').trim().slice(0, max); }
// Stops a submitted value from being run as a spreadsheet formula.
function safe_(v) { return /^[=+\-@]/.test(v) ? "'" + v : v; }

/* ───────────── pure logic (also runs in the preview) ───────────── */

function handle_(action, p, data, deps) {
  var f = parseJSON_(p.f), rows = data.rows;
  if (action === 'meta') return meta_(rows);
  if (action === 'search') return search_(rows, data.profiles, f);
  if (action === 'uni') return uniDetail_(rows, data.profiles, String(p.name || ''), f);
  if (action === 'match') return bestMatch_(rows, data.profiles, parseJSON_(p.a), deps || {});
  return {error: 'unknown action'};
}

function parseJSON_(s) { try { var o = JSON.parse(s || '{}'); return o && typeof o === 'object' ? o : {}; } catch (e) { return {}; } }
function num_(s) { var m = String(s == null ? '' : s).replace(/,/g, '').match(/\d+(\.\d+)?/); return m ? parseFloat(m[0]) : 0; }
function yes_(s) { return /^\s*(yes|y|true)/i.test(s || ''); }
function codeOf_(u) {
  var m = u.match(/\(([^)]+)\)\s*$/); if (m) return m[1].toUpperCase();
  if (/tsinghua/i.test(u)) return 'THU'; if (/fudan/i.test(u)) return 'FUDAN'; if (/jinan/i.test(u)) return 'JINAN';
  return u.split(' ')[0].toUpperCase();
}
function shortName_(u) { return u.replace(/\s*\([^)]*\)\s*$/, ''); }

function buildRows_(values, stats) {
  var H = {};
  values[0].forEach(function (h, i) { H[String(h).trim().toLowerCase()] = i; });
  var out = [];
  for (var k = 1; k < values.length; k++) {
    var r = values[k];
    var g = function (n) { var i = H[n.toLowerCase()]; return i == null ? '' : String(r[i] == null ? '' : r[i]).trim(); };
    var uni = g('University'), prog = g('Programme / Major');
    if (!uni || !prog) {
      if (stats) { if (r.join('').trim()) stats.missingName++; else stats.blank++; }
      continue;
    }
    var can = g('Chinese Chiwchiw Can Apply?');
    if (CONFIG.onlyCanApply && can && !yes_(can)) {
      if (stats) { stats.cannotApply[can] = (stats.cannotApply[can] || 0) + 1; stats.skippedUnis[uni] = (stats.skippedUnis[uni] || 0) + 1; }
      continue;
    }
    if (/dup/i.test(g('Duplicate Check'))) { if (stats) stats.duplicate++; continue; }

    var dl = g('Degree Level').toLowerCase(), pid = g('Programme ID').toUpperCase();
    var lv = /language/.test(dl) ? 'LANG' : /doctor|phd/.test(dl) ? 'PHD' : /master|postgrad/.test(dl) ? 'PG' : /under|bachelor/.test(dl) ? 'UG' :
             /^LANG|^LP-/.test(pid) ? 'LANG' : /^(PHD|DR)-/.test(pid) ? 'PHD' : /^(PG|MA|MS|MSC)-/.test(pid) ? 'PG' : 'UG';

    var hskTxt = g('HSK Requirement'), ieltsTxt = g('IELTS Requirement'), toeflTxt = g('TOEFL Requirement');
    var hsk = num_(g('HSK Level')) || num_((hskTxt.match(/hsk\s*([1-9])/i) || [])[1]);
    if (/^no/i.test(g('HSK Required'))) hsk = 0;
    var ielts = num_(g('IELTS Minimum Overall')) || num_((ieltsTxt.match(/\d(\.\d)?/) || [])[0]);
    if (ielts > 9) ielts = 0;
    var toefl = num_(g('TOEFL iBT Minimum')) || num_((toeflTxt.match(/\d{2,3}/) || [])[0]);
    var tl = g('Teaching Language').toLowerCase(), en = /english/.test(tl), zh = /chinese/.test(tl);
    var lang = en && zh ? 'both' : en ? 'en' : zh ? 'zh' : (ielts && !hsk ? 'en' : 'zh');
    var cs = g('Cycle Status');

    var row = {
      id: g('Programme ID'), u: uni, cn: g('University Chinese Name'), city: g('City') || '—', prov: g('Province'),
      lv: lv, prog: prog, track: g('Track / Specialisation'), school: g('Faculty / School'), lang: lang, dur: g('Duration (Years)'),
      tu: num_(g('Tuition RMB / Year')), tot: num_(g('Estimated Total RMB / Year')),
      hsk: hsk, hskTxt: hsk ? hskTxt : '', hskk: yes_(g('HSKK Required')) || /hskk/i.test(hskTxt), hskkLv: g('HSKK Level'),
      ielts: ielts, toefl: toefl, eng: yes_(g('English Test Required')) || ielts > 0 || toefl > 0,
      csca: yes_(g('CSCA Required?')), cscaSub: g('CSCA Subjects'), sch: yes_(g('Scholarship Available?')),
      dl: g('Final Deadline') || g('Application Deadline'), cyc: g('Admission Cycle'),
      open: /^(open|current)/i.test(cs), past: /past/i.test(cs),
      campus: g('Campus')
    };
    var low = (prog + ' ' + row.school + ' ' + row.track + ' ' + g('Search Keywords / Tags')).toLowerCase();
    row.f = 'oth'; row.s = '';
    if (lv === 'LANG') { row.f = 'lang'; row.s = 'cnprog'; }
    else for (var t = 0; t < TAXO.length; t++) if (TAXO[t][2].test(low)) { row.f = TAXO[t][0]; row.s = TAXO[t][1]; break; }
    var pre = (g('Academic Prerequisites') + ' ' + g('Chinese Requirement Notes')).toLowerCase(), req = [];
    var flag = function (col, re) { var v = g(col); return v ? yes_(v) : re.test(pre); };
    if (flag('Portfolio Required?', /portfolio|作品集/)) req.push('portfolio');
    if (/audition|演奏|面试演唱/.test(pre)) req.push('audition');
    else if (flag('Entrance Exam Required?', /entrance exam|admission exam|written exam|professional exam|校考|专业考试|入学考试/)) req.push('exam');
    if (flag('Interview Required?', /interview|面试/)) req.push('interview');
    if (flag('Study Plan Required?', /study plan|research proposal|research plan|研究计划|学习计划/)) req.push('studyplan');
    row.req = req;
    row.cl = row.city.split(/\s*[\/,;&]\s*|\s+and\s+/).map(function (c) { return c.trim(); }).filter(String);
    if (!row.cl.length) row.cl = [row.city];
    row.code = codeOf_(uni);
    row.kw = g('Search Keywords / Tags').toLowerCase();
    hay_(row);
    out.push(row);
  }
  return out;
}

function nameKey_(s) { return String(s || '').toLowerCase().replace(/[^a-z0-9]/g, ''); }

// Accepts header variants, e.g. "Logo URL (WordPress)" or "Campus photo URL (WordPress)".
function hay_(r) {
  r.hay = (r.u + ' ' + r.cn + ' ' + r.city + ' ' + r.cl.map(function (c) { return CITY_TH[c] || ''; }).join(' ') + ' ' +
    r.prog + ' ' + r.school + ' ' + r.track + ' ' + (r.kw || '')).toLowerCase();
}

// Saved copy leaves out the search string (rebuilt on load) to keep it small and quick to read.
function slim_(data) {
  return {profiles: data.profiles, rows: data.rows.map(function (r) {
    var o = {};
    for (var k in r) if (k !== 'hay' && r[k] !== '' && r[k] !== false && r[k] !== 0) o[k] = r[k];
    return o;
  })};
}
function hydrate_(data) {
  var defaults = {cn: '', city: '—', prov: '', track: '', school: '', dur: '', tu: 0, tot: 0, hsk: 0, hskTxt: '', hskk: false, hskkLv: '',
    ielts: 0, toefl: 0, eng: false, csca: false, cscaSub: '', sch: false, dl: '', cyc: '', open: false, past: false, campus: '', kw: '', id: '', s: '', code: ''};
  data.rows.forEach(function (r) {
    for (var k in defaults) if (!(k in r)) r[k] = defaults[k];
    if (!r.req) r.req = [];
    if (!r.cl) r.cl = [r.city];
    hay_(r);
  });
  return data;
}

function buildProfiles_(values) {
  var heads = values[0].map(function (h) { return String(h).trim().toLowerCase(); }), out = {};
  var col = function (test) { for (var i = 0; i < heads.length; i++) if (test(heads[i])) return i; return -1; };
  var C = {u: col(function (h) { return /^university( name)?( \((en|english)\))?$/.test(h); }), desc: col(function (h) { return h.indexOf('description') > -1; }),
    logo: col(function (h) { return h.indexOf('logo') > -1; }), photo: col(function (h) { return h.indexOf('photo') > -1 && h.indexOf('url') > -1; }),
    credit: col(function (h) { return h.indexOf('credit') > -1; }), src: col(function (h) { return h.indexOf('source') > -1; })};
  if (C.u < 0) return out;
  var url = function (v) { v = String(v || '').trim(); return /^https:\/\/[^\s"'<>]+$/.test(v) ? v : ''; };
  for (var k = 1; k < values.length; k++) {
    var r = values[k], g = function (i) { return i < 0 ? '' : String(r[i] == null ? '' : r[i]).trim(); }, u = g(C.u);
    if (!u) continue;
    out[nameKey_(u)] = {desc: g(C.desc).slice(0, 4000), photo: url(g(C.photo)), logo: url(g(C.logo)), credit: g(C.credit).slice(0, 200), src: url(g(C.src))};
  }
  return out;
}

function mergeProfiles_(into, from) {
  Object.keys(from).forEach(function (k) {
    var a = into[k] || (into[k] = {}), b = from[k];
    Object.keys(b).forEach(function (f) { if (b[f] && !a[f]) a[f] = b[f]; });
  });
}

function profileOf_(profiles, name) {
  return profiles[nameKey_(name)] || profiles[nameKey_(shortName_(name))] || {};
}

// The ONLY programme fields that are ever sent to the website.
// Invisible copy-tracing marks. A small share of records (chosen with a private seed, so the
// selection can't be guessed from this code) carry a zero-width code inside one text field.
// It doesn't show on screen or change any fact, but it survives copy-paste and scraping,
// so the "Copy Checker" can prove a copied dataset came from Chinese Chiwchiw.
var WM_SEED_ = null;
function wmSeed_() {
  if (WM_SEED_ !== null) return WM_SEED_;
  try {
    var props = PropertiesService.getScriptProperties();
    WM_SEED_ = props.getProperty('wmSeed');
    if (!WM_SEED_) { WM_SEED_ = Utilities.getUuid(); props.setProperty('wmSeed', WM_SEED_); }
  } catch (err) { WM_SEED_ = 'preview'; }
  return WM_SEED_;
}
function wmHash_(key) {
  var h = 2166136261, str = wmSeed_() + '|' + key;
  for (var i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = (h * 16777619) >>> 0; }
  return h;
}
function wmTag_(key) {
  var h = wmHash_(key), code = 'CCW' + ('000' + (h % 46656).toString(36).toUpperCase()).slice(-3), bits = '';
  for (var i = 0; i < code.length; i++) bits += ('0000000' + code.charCodeAt(i).toString(2)).slice(-8);
  return '\u2060' + bits.replace(/0/g, '\u200c').replace(/1/g, '\u200d') + '\u2060';
}
// Puts the mark after the first space (or at the end) of text, for about 1 in `every` keys.
function wm_(text, key, every) {
  text = String(text || '');
  if (!text || wmHash_(key) % every !== 7 % every) return text;
  var i = text.indexOf(' ');
  return i > 0 ? text.slice(0, i + 1) + wmTag_(key) + text.slice(i + 1) : text + wmTag_(key);
}

function pub_(r) {
  return {id: r.id, u: r.u, cn: r.cn, city: r.city, lv: r.lv, prog: wm_(r.prog, 'p:' + r.u + '|' + r.lv + '|' + r.prog + '|' + r.lang, 25), track: r.track, school: r.school, lang: r.lang,
    dur: r.dur, tu: r.tu, tot: r.tot, hsk: r.hsk, hskTxt: r.hskTxt, hskk: r.hskk, hskkLv: r.hskkLv, ielts: r.ielts, toefl: r.toefl,
    eng: r.eng, csca: r.csca, cscaSub: r.cscaSub, sch: r.sch, dl: r.dl, cyc: r.cyc, open: r.open, past: r.past,
    campus: r.campus, f: r.f, s: r.s, req: r.req || []};
}

function uniSummary_(name, list, profiles, fullDesc) {
  var r0 = list[0], prof = profileOf_(profiles, name), fees = [], lv = {}, fc = {}, open = false, sch = false, en = 0;
  list.forEach(function (r) {
    if (r.tu) fees.push(r.tu);
    lv[r.lv] = 1; if (r.f !== 'oth') fc[r.f] = (fc[r.f] || 0) + 1;
    if (r.open) open = true; if (r.sch) sch = true; if (r.lang !== 'zh') en++;
  });
  return {name: name, short: shortName_(name), cn: r0.cn, city: r0.city, prov: r0.prov, code: r0.code, tiers: TIERS[r0.code] || [],
    desc: wm_(fullDesc ? prof.desc || '' : cardDesc_(prof.desc), 'u:' + name, 8), photo: prof.photo || '', logo: prof.logo || '', credit: prof.credit || '', src: prof.src || '', n: list.length,
    feeMin: fees.length ? Math.min.apply(null, fees) : 0, feeMax: fees.length ? Math.max.apply(null, fees) : 0,
    levels: ['UG', 'PG', 'PHD', 'LANG'].filter(function (k) { return lv[k]; }),
    top: Object.keys(fc).sort(function (a, b) { return fc[b] - fc[a]; }).slice(0, 2), open: open, sch: sch, en: en};
}

// Cards show only two lines, so lists carry a shorter copy (cut at a space); the pop-up gets the full text.
function cardDesc_(d) {
  d = String(d || '');
  if (d.length <= 240) return d;
  var cut = d.lastIndexOf(' ', 240);
  return d.slice(0, cut > 120 ? cut : 240) + '…';
}

function meta_(rows) {
  var unis = {}, cities = {}, en = 0;
  rows.forEach(function (r) {
    unis[r.u] = 1;
    (r.cl || [r.city]).forEach(function (name) {
      var c = cities[name] || (cities[name] = {UG: 0, PG: 0, PHD: 0, LANG: 0, all: 0});
      c[r.lv]++; c.all++;
    });
    if (r.lang !== 'zh') en++;
  });
  return {unis: Object.keys(unis).length, progs: rows.length, en: en, cities: cities, rate: CONFIG.thbPerRmb};
}

function arr_(v) { return Array.isArray(v) ? v.map(String).slice(0, 60) : []; }

function filterRow_(r, f, skipQ) {
  if (f.uni && r.u !== String(f.uni)) return false;
  if (!skipQ && f.q && !f.uni) {
    var toks = String(f.q).toLowerCase().trim().split(/\s+/);
    for (var i = 0; i < toks.length; i++) if (toks[i].length > 1 && r.hay.indexOf(toks[i]) < 0) return false;
  }
  var lv = arr_(f.lv), city = arr_(f.city), sub = arr_(f.sub), lang = arr_(f.lang), tier = arr_(f.tier);
  if (lv.length && lv.indexOf(r.lv) < 0) return false;
  if (city.length && !(r.cl || [r.city]).some(function (c) { return city.indexOf(c) > -1; })) return false;
  if (sub.length && sub.indexOf(r.f) < 0 && sub.indexOf(r.f + '.' + r.s) < 0) return false;
  if (lang.length && !(lang.indexOf(r.lang) > -1 || (r.lang === 'both' && lang.length))) return false;
  if (tier.length) {
    var ts = TIERS[r.code] || ['OT'];
    if (!tier.some(function (t) { return ts.indexOf(t) > -1; })) return false;
  }
  if (f.max && +f.max > 0 && (!r.tu || r.tu > +f.max)) return false;
  if (f.myHsk !== undefined && f.myHsk !== '' && f.myHsk !== null && r.lang !== 'en' && r.hsk > +f.myHsk) return false;
  if (f.open && !r.open) return false;
  if (f.nohsk && r.hsk && r.lang !== 'en') return false;
  if (f.sch && !r.sch) return false;
  if (f.nocsca && r.csca) return false;
  return true;
}

function page_(f) {
  var size = Math.min(CONFIG.maxPageSize, Math.max(1, +f.size || CONFIG.pageSize));
  var page = Math.max(1, Math.min(500, Math.floor(+f.page || 1)));
  return {size: size, page: page};
}

function sortRows_(list, sort) {
  if (sort === 'low' || sort === 'high') list.sort(function (a, b) {
    if (!a.tu) return 1; if (!b.tu) return -1; return sort === 'low' ? a.tu - b.tu : b.tu - a.tu;
  });
  else if (sort === 'az') list.sort(function (a, b) { return a.prog.localeCompare(b.prog); });
  return list;
}

function search_(rows, profiles, f) {
  var pg = page_(f), res = rows.filter(function (r) { return filterRow_(r, f); });
  if (f.view === 'prog') {
    sortRows_(res, f.sort);
    return {view: 'prog', total: res.length, page: pg.page, size: pg.size,
      items: res.slice((pg.page - 1) * pg.size, pg.page * pg.size).map(pub_)};
  }
  var groups = {}, order = [];
  res.forEach(function (r) { if (!groups[r.u]) { groups[r.u] = []; order.push(r.u); } groups[r.u].push(r); });
  var us = order.map(function (u) { return uniSummary_(u, groups[u], profiles); });
  var s = f.sort;
  us.sort(function (a, b) {
    if (s === 'low') return (a.feeMin || 1e9) - (b.feeMin || 1e9);
    if (s === 'high') return (b.feeMin || 0) - (a.feeMin || 0);
    if (s === 'az') return a.short.localeCompare(b.short);
    return b.n - a.n;
  });
  return {view: 'uni', total: us.length, progTotal: res.length, page: pg.page, size: pg.size,
    items: us.slice((pg.page - 1) * pg.size, pg.page * pg.size)};
}

function uniDetail_(rows, profiles, name, f) {
  var all = rows.filter(function (r) { return r.u === name; });
  if (!all.length) return {error: 'not found'};
  var list = all.filter(function (r) { return filterRow_(r, f, true); });
  if (f.dq) {
    var toks = String(f.dq).toLowerCase().trim().split(/\s+/);
    list = list.filter(function (r) { return toks.every(function (t) { return r.hay.indexOf(t) > -1; }); });
  }
  sortRows_(list, f.sort);
  var pg = page_(f);
  return {uni: uniSummary_(name, all, profiles, true), total: list.length, page: pg.page, size: pg.size,
    items: list.slice((pg.page - 1) * pg.size, pg.page * pg.size).map(pub_)};
}

// Scores every programme at the chosen level (lower penalty = better fit), keeps a
// shortlist, then lets the AI pick one. Returns exactly one programme.
// exact=false means nothing met every condition, so the closest option is shown.
function bestMatch_(rows, profiles, a, deps) {
  var lvMap = {ug: 'UG', ma: 'PG', phd: 'PHD'}, want = lvMap[a.deg] || 'UG';
  var groups = arr_(a.groups), text = String(a.text || '').toLowerCase().trim().slice(0, 80);
  var anyMajor = !!a.anyMajor || (!groups.length && !text);
  var myHsk = +a.hsk || 0, myIelts = +a.ielts || 0, budget = +a.budget || 0, cities = arr_(a.cities);
  var scored = [];
  rows.forEach(function (r) {
    if (r.lv !== want) return;
    var g = {}, pen = 0;
    g.major = anyMajor || groups.indexOf(r.f) > -1 || groups.indexOf(r.f + '.' + r.s) > -1 ||
      (!!text && text.split(/\s+/).every(function (t) { return r.hay.indexOf(t) > -1; }));
    if (!g.major) pen += 40;
    g.lang = a.lang === 'both' || r.lang === 'both' || r.lang === a.lang;
    if (!g.lang) pen += 30;
    var useZh = r.lang === 'zh' || (r.lang === 'both' && a.lang !== 'en');
    g.useZh = useZh;
    // Only score a language test the student was actually asked about.
    var gapW = a.when === 'later' || a.when === 'explore' ? 0.5 : 1; // more time to raise a test score
    if (useZh && a.lang !== 'en') { g.hskGap = r.hsk ? Math.max(0, r.hsk - myHsk) : 0; pen += Math.min(36, g.hskGap * 12) * gapW; }
    else if (!useZh && a.lang !== 'zh') { g.ieltsGap = r.ielts ? Math.max(0, Math.round((r.ielts - myIelts) * 10) / 10) : 0; pen += Math.min(40, g.ieltsGap * 20) * gapW; }
    else { g.hskGap = 0; g.ieltsGap = 0; g.testUnknown = true; }
    var cost = r.tot || r.tu;
    g.thb = cost ? Math.round(cost * CONFIG.thbPerRmb) : 0;
    g.over = budget && g.thb > budget ? g.thb - budget : 0;
    if (g.over) pen += Math.min(40, g.over / budget * 60);
    if (!cost) pen += 3;
    g.city = !cities.length || (r.cl || [r.city]).some(function (c) { return cities.indexOf(c) > -1; });
    if (!g.city) pen += 15;
    if (a.schol === 'must') pen += r.sch ? -6 : 6; else if (a.schol === 'nice' && r.sch) pen -= 3;
    if (r.open) pen -= 2;
    if (useZh && r.hsk && myHsk > r.hsk) pen -= 2;
    g.exact = g.major && g.lang && !g.hskGap && !g.ieltsGap && !g.over && g.city && !g.testUnknown;
    scored.push({pen: pen, cost: cost || 1e9, r: r, g: g});
  });
  if (!scored.length) return {item: null};
  scored.sort(function (x, y) { return x.pen - y.pen || x.cost - y.cost; });

  var shortlist = [], perUni = {};
  for (var i = 0; i < scored.length && shortlist.length < CONFIG.aiShortlist; i++) {
    var u = scored[i].r.u;
    if ((perUni[u] || 0) >= 3) continue;
    perUni[u] = (perUni[u] || 0) + 1;
    shortlist.push(scored[i]);
  }

  var chosen = shortlist[0], plan = null, usedAI = false;
  if (deps.ai) {
    try {
      var res = deps.ai(a, shortlist, deps.today || '');
      if (res && res.plan) {
        for (var k = 0; k < shortlist.length; k++) if (shortlist[k].r.id === res.plan.pick_id) { chosen = shortlist[k]; break; }
        if (chosen.r.id === res.plan.pick_id) { plan = res.plan; usedAI = true; }
      }
    } catch (err) {}
  }
  if (!plan) plan = fallbackPlan_(chosen.r, chosen.g, a, deps.today || '');

  var all = rows.filter(function (x) { return x.u === chosen.r.u; });
  var us = uniSummary_(chosen.r.u, all, profiles);
  // Two more universities worth a look: the next best-scoring ones, names only (no course details).
  var others = [], seen = {};
  seen[chosen.r.u] = 1;
  for (var o = 0; o < scored.length && others.length < 2; o++) {
    var ou = scored[o].r.u;
    if (seen[ou]) continue;
    seen[ou] = 1;
    var op = profileOf_(profiles, ou);
    others.push({name: ou, short: shortName_(ou), cn: scored[o].r.cn, city: scored[o].r.city, logo: op.logo || ''});
  }
  return {item: pub_(chosen.r), uni: {name: us.name, short: us.short, cn: us.cn, city: us.city, photo: us.photo, logo: us.logo, credit: us.credit, src: us.src, desc: us.desc, tiers: us.tiers},
    gaps: chosen.g, exact: chosen.g.exact, ai: usedAI, others: others,
    plan: {headline: plan.headline, why_fit: plan.why_fit, watch_out: plan.watch_out, prepare: plan.prepare, timeline: plan.timeline}};
}

var MONTH_TH = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
var MONTH_EN = {jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11};

function deadlineMonth_(dl) {
  var s = String(dl || '').toLowerCase(), m = s.match(/(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/);
  if (m) return MONTH_EN[m[1]];
  var iso = s.match(/\d{4}-(\d{2})-\d{2}/);
  return iso ? +iso[1] - 1 : -1;
}
function deadlineYear_(dl) { var m = String(dl || '').match(/(20\d{2})/); return m ? +m[1] : 0; }

// Rule-based plan in the same shape the AI returns; used when the AI is unavailable.
function fallbackPlan_(r, g, a, today) {
  var short = shortName_(r.u), why = [], watch = [], prep = [], tl = [];
  if (g.major) why.push('สาขา ' + r.prog + ' ตรงกับสายที่นักเรียนสนใจ');
  if (g.lang) why.push(r.lang === 'en' ? 'เรียนเป็นภาษาอังกฤษ ตรงกับที่นักเรียนเลือก' : 'เรียนเป็นภาษาจีน ได้ทั้งปริญญาและภาษาไปพร้อมกัน');
  if (g.thb && !g.over && a.budget) why.push('ค่าใช้จ่ายต่อปีอยู่ในงบที่นักเรียนตั้งไว้');
  if (r.sch) why.push('มีทุนการศึกษาให้ยื่นสมัคร');
  if (!why.length) why.push('เป็นตัวเลือกที่ใกล้เคียงกับคำตอบของนักเรียนที่สุดในระบบตอนนี้');
  if (!g.major) watch.push('สาขานี้ไม่ตรงกลุ่มที่นักเรียนเลือกทั้งหมด ลองดูสาขาอื่นของมหาวิทยาลัยนี้ด้วย');
  if (g.hskGap) watch.push('ต้องอัป HSK อีก ' + g.hskGap + ' ระดับก่อนยื่นสมัคร');
  if (g.ieltsGap) watch.push('ต้องได้ IELTS เพิ่มอีก ' + g.ieltsGap + ' ก่อนยื่นสมัคร');
  if (g.testUnknown) watch.push(g.useZh ? 'หลักสูตรนี้สอนเป็นภาษาจีน ต้องใช้ผล HSK' : 'หลักสูตรนี้สอนเป็นภาษาอังกฤษ ต้องใช้ผล IELTS หรือ TOEFL');
  if (g.over) watch.push('ค่าใช้จ่ายเกินงบที่ตั้งไว้ประมาณ ' + Math.round(g.over / 1000) * 1000 + ' บาทต่อปี');
  if (!g.city) watch.push('มหาวิทยาลัยนี้อยู่นอกเมืองที่นักเรียนเลือก');
  var kk = r.hskk ? ' และ HSKK ' + (r.hskkLv || '') : '';
  if (r.lang !== 'en' && r.hsk) prep.push(g.hskGap || g.testUnknown ? 'เตรียมสอบ HSK ' + r.hsk + kk + ' ให้ได้คะแนนตามเกณฑ์' : 'ถ้ายังไม่มีใบผล HSK ' + r.hsk + kk + ' ให้สอบก่อนยื่นสมัคร (ผลสอบใช้ได้ 2 ปี)');
  if (r.lang !== 'zh' && r.ielts) prep.push(g.ieltsGap || g.testUnknown ? 'เตรียมสอบ IELTS ให้ได้ ' + r.ielts + ' ขึ้นไป' + (r.toefl ? ' (หรือ TOEFL ' + r.toefl + ')' : '') : 'ถ้ายังไม่มีใบผล IELTS ' + r.ielts + ' ขึ้นไป ให้สอบก่อนยื่นสมัคร (ผลสอบใช้ได้ 2 ปี)');
  if (r.csca) prep.push('เตรียมสอบ CSCA' + (r.cscaSub ? ' วิชา ' + r.cscaSub : ''));
  var req = r.req || [], needPlan = req.indexOf('studyplan') > -1 || r.lv === 'PG' || r.lv === 'PHD';
  if (req.indexOf('portfolio') > -1) prep.push('เตรียม Portfolio ผลงานตามที่คณะกำหนด');
  if (req.indexOf('exam') > -1) prep.push('เตรียมสอบเข้าเฉพาะของคณะ');
  if (req.indexOf('audition') > -1) prep.push('ซ้อมสำหรับ Audition ทดสอบความสามารถ');
  if (needPlan) prep.push('เขียน Study Plan' + (r.lv === 'PHD' ? ' / Research Proposal' : '') + ' ให้ชัดว่าอยากเรียนอะไรและทำไม');
  if (req.indexOf('interview') > -1) prep.push('ฝึกสัมภาษณ์ เล่าเป้าหมายการเรียนให้กระชับ');
  prep.push('เตรียมเอกสารหลัก: หนังสือเดินทาง ใบแสดงผลการเรียน และเอกสารที่มหาวิทยาลัยกำหนด');
  if (r.sch) prep.push('เตรียมเอกสารยื่นทุนไปพร้อมกับใบสมัคร');
  var when = a.when === 'later' || a.when === 'explore' ? a.when : 'next';
  if (when === 'explore') prep = ['เทียบมหาวิทยาลัยนี้กับอีก 2–3 แห่งในรายชื่อด้านล่าง ดูค่าใช้จ่าย เมือง และเกณฑ์ภาษา',
    'ลองเรียนภาษาจีนหรือไปค่ายระยะสั้นก่อน เพื่อดูว่าชอบการใช้ชีวิตที่จีนไหม'].concat(prep).slice(0, 5);
  var dm = deadlineMonth_(r.dl), tm = String(today || '').match(/^(\d{4})-(\d{2})/);
  var dmLabel = dm > -1 ? MONTH_TH[dm] : '';
  if (when !== 'next') {
    // Not applying this round: phases relative to the application year, no fixed dates.
    if (when === 'explore') {
      tl.push({when: 'ตอนนี้', task: 'ดูรายชื่อมหาวิทยาลัยด้านล่าง เทียบ 2–3 ที่ที่สนใจ แล้วคุยกับทีมได้ฟรี'});
      tl.push({when: 'ช่วงหาข้อมูล', task: 'ลองเรียนภาษาจีนหรือไปค่ายระยะสั้น เพื่อดูว่าชอบการเรียนที่จีนไหม'});
      tl.push({when: 'เมื่อพร้อม', task: 'เลือกปีที่จะเริ่มเรียน แล้วให้ทีมวาง Timeline ตามรอบสมัครจริง'});
    } else {
      tl.push({when: 'ตอนนี้', task: 'คุยกับทีมเพื่อยืนยันหลักสูตรและวางแผนระยะยาว'});
    }
    if (r.lang !== 'en' && r.hsk) tl.push({when: 'ประมาณ 1 ปีก่อนยื่นสมัคร', task: 'ปูพื้นภาษาจีนและสอบ HSK ' + r.hsk + (r.hskk ? ' และ HSKK' : '') + ' ให้ถึงเกณฑ์'});
    if (r.lang !== 'zh' && r.ielts) tl.push({when: 'ประมาณ 1 ปีก่อนยื่นสมัคร', task: 'เตรียมสอบ IELTS ให้ได้ ' + r.ielts + ' ขึ้นไป'});
    if (r.csca) tl.push({when: '2–3 เดือนก่อนปิดรับ', task: 'สอบ CSCA และเก็บผลสอบไว้ยื่น'});
    if (req.indexOf('portfolio') > -1 || needPlan) tl.push({when: '2–3 เดือนก่อนปิดรับ', task: [req.indexOf('portfolio') > -1 ? 'ทำ Portfolio' : '', needPlan ? 'เขียน Study Plan' : ''].filter(String).join(' และ ')});
    tl.push({when: '1–2 เดือนก่อนปิดรับ', task: 'รวบรวมเอกสารและยื่นใบสมัคร' + (r.sch ? ' พร้อมใบสมัครทุน' : '')});
    if (req.indexOf('exam') > -1 || req.indexOf('audition') > -1 || req.indexOf('interview') > -1) tl.push({when: 'หลังยื่นสมัคร', task: 'สอบเข้า / Audition / สัมภาษณ์ ตามที่คณะกำหนด'});
    tl.push({when: dmLabel ? dmLabel + ' ของปีที่ยื่น' : 'วันปิดรับสมัคร', task: 'ปิดรับสมัคร' + (dmLabel ? ' (อ้างอิงเดือนของรอบที่ผ่านมา ทีมจะยืนยันให้)' : '')});
    tl.push({when: 'หลังได้รับผล', task: 'ขอวีซ่านักเรียน เตรียมที่พัก และเข้าร่วม Pre-Departure กับทีม'});
  } else if (dm > -1 && tm) {
    // Months counted as year*12+month. A round that hasn't opened yet reuses last
    // round's deadline month and is shown without a year.
    var now = +tm[1] * 12 + (+tm[2] - 1), dy = deadlineYear_(r.dl), dl;
    if (!r.past && dy) dl = dy * 12 + dm;
    else { dl = Math.floor(now / 12) * 12 + dm; if (dl <= now) dl += 12; }
    var showYear = !r.past;
    var lab = function (x) { x = Math.max(now, x); return MONTH_TH[x % 12] + (showYear ? ' ' + Math.floor(x / 12) : ''); };
    var lgap = (r.lang !== 'en' && g.hskGap) || (r.lang !== 'zh' && g.ieltsGap);
    tl.push({when: lab(now), task: 'คุยกับทีมเพื่อยืนยันหลักสูตรและวางแผนการสอบ'});
    if (r.lang !== 'en' && r.hsk) tl.push({when: lab(dl - (lgap ? 4 : 3)), task: (g.hskGap ? 'เรียนเพิ่มและสอบ HSK ' : 'สอบหรือเตรียมใบผล HSK ') + r.hsk + (r.hskk ? ' และ HSKK' : '')});
    if (r.lang !== 'zh' && r.ielts) tl.push({when: lab(dl - (lgap ? 4 : 3)), task: 'สอบหรือเตรียมใบผล IELTS ' + r.ielts + ' ขึ้นไป'});
    if (r.csca) tl.push({when: lab(dl - 2), task: 'สอบ CSCA และเก็บผลสอบไว้ยื่น'});
    if (req.indexOf('portfolio') > -1) tl.push({when: lab(dl - 2), task: 'ทำ Portfolio ให้เสร็จ'});
    if (needPlan) tl.push({when: lab(dl - 2), task: 'เขียน Study Plan' + (r.lv === 'PHD' ? ' / Research Proposal' : '') + ' และขอจดหมายแนะนำ'});
    tl.push({when: lab(dl - 1), task: 'รวบรวมเอกสารและยื่นใบสมัคร' + (r.sch ? ' พร้อมใบสมัครทุน' : '')});
    if (req.indexOf('exam') > -1 || req.indexOf('audition') > -1 || req.indexOf('interview') > -1)
      tl.push({when: lab(dl), task: [req.indexOf('exam') > -1 ? 'สอบเข้า' : '', req.indexOf('audition') > -1 ? 'Audition' : '', req.indexOf('interview') > -1 ? 'สัมภาษณ์' : ''].filter(String).join(' / ') + ' ตามตารางของคณะ (มักจัดช่วงหลังยื่นสมัคร)'});
    tl.push({when: lab(dl), task: 'ปิดรับสมัคร' + (r.past ? ' (อ้างอิงเดือนของรอบที่ผ่านมา ทีมจะยืนยันวันของรอบใหม่ให้)' : '')});
    tl.push({when: lab(dl + 2), task: 'ได้รับผล ขอวีซ่านักเรียน เตรียมที่พัก และเข้าร่วม Pre-Departure กับทีม'});
  } else {
    tl.push({when: 'ตอนนี้', task: 'คุยกับทีมเพื่อยืนยันหลักสูตรและวางแผนการสอบ'});
    if (r.lang !== 'en' && r.hsk) tl.push({when: 'ภายใน 3–6 เดือน', task: 'สอบหรือเตรียมใบผล HSK ' + r.hsk + (r.hskk ? ' และ HSKK' : '')});
    if (r.lang !== 'zh' && r.ielts) tl.push({when: 'ภายใน 3–6 เดือน', task: 'สอบหรือเตรียมใบผล IELTS ' + r.ielts + ' ขึ้นไป'});
    if (r.csca) tl.push({when: 'ก่อนยื่นสมัคร', task: 'สอบ CSCA และเก็บผลสอบไว้ยื่น'});
    tl.push({when: 'ก่อนปิดรับ', task: 'รวบรวมเอกสารและยื่นใบสมัคร' + (r.sch ? ' พร้อมใบสมัครทุน' : '')});
    tl.push({when: 'หลังได้รับผล', task: 'ขอวีซ่านักเรียน เตรียมที่พัก และเข้าร่วม Pre-Departure กับทีม'});
  }
  var head = g.exact ? short + ' สาขา ' + r.prog + ' ตรงกับเป้าหมายของนักเรียนมากที่สุดจากคำตอบทั้งหมด' : short + ' สาขา ' + r.prog + ' เป็นตัวเลือกที่ใกล้เคียงที่สุด แม้ยังมีบางข้อที่ต้องเตรียมเพิ่ม';
  if (when === 'explore') head = short + ' สาขา ' + r.prog + ' เป็นจุดเริ่มต้นที่ดีสำหรับเทียบตัวเลือก ยังมีเวลาหาข้อมูลเพิ่มได้ไม่ต้องรีบ';
  else if (when === 'later' && !g.exact) head = short + ' สาขา ' + r.prog + ' เหมาะกับนักเรียน และยังมีเวลาเตรียมส่วนที่ยังขาด';
  return {
    headline: head,
    why_fit: why.slice(0, 4), watch_out: watch.slice(0, 3), prepare: prep.slice(0, 6), timeline: tl.slice(0, 9)
  };
}

/* ───────────── AI (Apps Script only) ───────────── */

var AI_SYSTEM = [
  'You are the University Matcher for Chinese Chiwchiw, a Thai consultancy that helps Thai students and their parents study in China.',
  'You receive one student\'s quiz answers and a shortlist of real programmes from the company database. Pick the ONE programme that fits this student best and write a short personal plan in Thai.',
  '',
  'How to choose: first the student\'s chosen fields of study, then whether they meet the language requirement or can realistically close the gap before the deadline, then budget, preferred cities and how much they want a scholarship. "gaps" is the rule-based check for each programme; use it, but you may pick a programme with a small gap if it is clearly the better fit, and say so in watch_out.',
  '',
  'Facts: use only the data given for each programme. Never invent fees, requirements, rankings, deadlines, scholarships or anything about campus life. If something is missing, say the team will confirm it (ทีมจะยืนยันให้). Never promise admission, a visa or a scholarship; "scholarship available" means the student can apply, not that they will receive it. If cycle_past is true, say the dates are from the previous round and the new round is usually announced around the same time.',
  '',
  'Timeline: 4 to 6 short steps from today (given) until departure, worked back from the deadline. Use real Thai month abbreviations and NEVER write a year (for example มี.ค., not มี.ค. 2027); the team confirms the exact dates. If cycle_past is true, base the months on the previous round\'s deadline and say in one step that the team will confirm the new round\'s dates. Cover the language test, CSCA if required, a portfolio or entrance exam or audition if listed in extra_requirements, writing the study plan (always for master and PhD, and whenever studyplan is listed; for bachelor scholarships mention that some scholarships ask for one), documents, the application, the scholarship application if available, interview preparation if interview is listed, and visa and pre-departure. Keep the steps in order. Living costs inside total cost are estimates; say so if you mention the total.',
  '',
  'Start plan: if the student is applying in the next round, use the dated timeline above. If they are planning ahead for a later year, use phases relative to the application year (for example ประมาณ 1 ปีก่อนยื่นสมัคร, 2–3 เดือนก่อนปิดรับ) with no years, and treat language gaps as time to prepare. If they are just exploring, do not push them to apply: make the plan about comparing 2–3 options from the list on the page, trying Chinese lessons or a short camp, and choosing a start year with the team; use relative phases with no dates.',
  '',
  'Writing: Thai, warm and encouraging, in the voice of the Chinese Chiwchiw team. Address the reader as นักเรียน and never as น้อง. Keep it brief so it reads well on a phone: one short sentence per bullet, no emoji, no markdown. watch_out lists honest gaps (language, budget, city) and is an empty array when there are none.'
].join('\n');

var AI_SCHEMA_BASE = {
  type: 'object', additionalProperties: false,
  required: ['pick_id', 'headline', 'why_fit', 'watch_out', 'prepare', 'timeline'],
  properties: {
    pick_id: {type: 'string', description: 'id of the chosen programme, copied exactly from the shortlist'},
    headline: {type: 'string', description: 'one Thai sentence saying why this is the best fit'},
    why_fit: {type: 'array', items: {type: 'string'}, description: '2 or 3 reasons this programme fits this student'},
    watch_out: {type: 'array', items: {type: 'string'}, description: '0 to 2 honest gaps or caveats'},
    prepare: {type: 'array', items: {type: 'string'}, description: '3 or 4 concrete preparation steps'},
    timeline: {type: 'array', items: {type: 'object', additionalProperties: false, required: ['when', 'task'],
      properties: {when: {type: 'string'}, task: {type: 'string'}}}, description: '4 to 6 steps in order, months without years'}
  }
};

function aiPlan_(a, shortlist, today) {
  var key = PropertiesService.getScriptProperties().getProperty('ANTHROPIC_API_KEY');
  if (!key) return null;
  var cache = CacheService.getScriptCache();
  var ck = 'ai:' + Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, JSON.stringify(a) + '|' + shortlist.map(function (c) { return c.r.id; }).join(',')));
  var hit = cache.get(ck);
  if (hit) return {plan: JSON.parse(hit)};
  if (!takeAiQuota_(today)) return null;

  var candidates = shortlist.map(function (c) {
    var r = c.r;
    return {id: r.id, university: r.u, city: r.city, level: r.lv, programme: r.prog + (r.track ? ' (' + r.track + ')' : ''), school: r.school,
      teaching_language: r.lang, duration_years: r.dur, tuition_rmb_per_year: r.tu || null, total_rmb_per_year: r.tot || null,
      total_includes_estimated_living_costs: !!r.tot, estimated_thb_per_year: c.g.thb || null, extra_requirements: r.req || [], hsk_requirement: r.hskTxt || (r.hsk ? 'HSK ' + r.hsk : null), hskk_level: r.hskk ? (r.hskkLv || 'required') : null,
      ielts_min: r.ielts || null, toefl_min: r.toefl || null, csca_required: r.csca, csca_subjects: r.cscaSub || null,
      scholarship_available: r.sch, deadline: r.dl || null, cycle: r.cyc || null, cycle_past: r.past,
      gaps: {major_match: c.g.major, language_match: c.g.lang, hsk_levels_short: c.g.hskGap || 0, ielts_short: c.g.ieltsGap || 0,
        language_test_not_asked: !!c.g.testUnknown, over_budget_thb: c.g.over || 0, city_match: c.g.city}};
  });
  var student = {start_plan: {next: 'applying in the next round', later: 'planning ahead for a later year', explore: 'just exploring, not ready to apply yet'}[a.when] || 'applying in the next round',
    degree: {ug: 'bachelor', ma: 'master', phd: 'phd'}[a.deg], fields: arr_(a.groups), unsure_of_field: !!a.anyMajor,
    typed_field: String(a.text || '').slice(0, 80), teaching_language_wanted: a.lang, hsk_level: a.lang !== 'en' ? (+a.hsk || 0) : null,
    ielts: a.lang !== 'zh' ? (+a.ielts || 0) : null, budget_thb_per_year: +a.budget || 'no limit', cities: arr_(a.cities),
    scholarship: {must: 'very important', nice: 'nice to have', no: 'not needed'}[a.schol] || ''};

  var schema = JSON.parse(JSON.stringify(AI_SCHEMA_BASE));
  schema.properties.pick_id['enum'] = shortlist.map(function (c) { return c.r.id; });
  var body = {
    model: CONFIG.aiModel,
    max_tokens: 8000,
    fallbacks: 'default',
    output_config: {effort: CONFIG.aiEffort, format: {type: 'json_schema', schema: schema}},
    system: AI_SYSTEM,
    messages: [{role: 'user', content: 'Today: ' + today + '\n\nStudent:\n' + JSON.stringify(student) + '\n\nShortlist:\n' + JSON.stringify(candidates)}]
  };
  var resp = UrlFetchApp.fetch('https://api.anthropic.com/v1/messages', {
    method: 'post', contentType: 'application/json', muteHttpExceptions: true,
    headers: {'x-api-key': key, 'anthropic-version': '2023-06-01', 'anthropic-beta': 'server-side-fallback-2026-07-01'},
    payload: JSON.stringify(body)
  });
  if (resp.getResponseCode() !== 200) { console.warn('AI HTTP ' + resp.getResponseCode() + ': ' + resp.getContentText().slice(0, 300)); return null; }
  var msg = JSON.parse(resp.getContentText());
  if (msg.stop_reason === 'refusal' || msg.stop_reason === 'max_tokens') return null;
  var txt = (msg.content || []).filter(function (b) { return b.type === 'text'; }).map(function (b) { return b.text; }).join('');
  var plan = JSON.parse(txt);
  plan.why_fit = arr_(plan.why_fit).slice(0, 4);
  plan.watch_out = arr_(plan.watch_out).slice(0, 3);
  plan.prepare = arr_(plan.prepare).slice(0, 6);
  plan.timeline = (Array.isArray(plan.timeline) ? plan.timeline : []).slice(0, 9).map(function (t) { return {when: String(t.when || ''), task: String(t.task || '')}; });
  try { cache.put(ck, JSON.stringify(plan), CONFIG.aiCacheSeconds); } catch (err) {}
  return {plan: plan};
}

function takeAiQuota_(today) {
  var lock = LockService.getScriptLock();
  try { lock.waitLock(3000); } catch (err) { return false; }
  try {
    var props = PropertiesService.getScriptProperties(), k = 'aiCount:' + today, n = +(props.getProperty(k) || 0);
    if (n >= CONFIG.aiDailyLimit) return false;
    props.setProperty(k, String(n + 1));
    return true;
  } finally {
    lock.releaseLock();
  }
}
