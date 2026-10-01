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
 * Leads from the email form are appended to the "Matcher Leads" tab (created
 * automatically). Sending the report email is not set up yet.
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
  onlyCanApply: false,     // true = hide programmes where "Chinese Chiwchiw Can Apply?" isn't Yes
  thbPerRmb: 4.6,          // keep in sync with data-rate on the page
  pageSize: 12,
  maxPageSize: 24,
  cacheSeconds: 600,       // sheet edits show on the site within ~10 minutes
  aiModel: 'claude-sonnet-5-5',
  aiEffort: 'low',         // low keeps answers fast; medium/high think longer and cost more
  aiShortlist: 15,
  aiDailyLimit: 300,       // AI calls per day; after that the rule-based plan is used
  aiCacheSeconds: 21600    // same answers within 6 hours reuse the saved AI result
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
  if (action === 'meta' || action === 'search' || action === 'uni') {
    rkey = 'r:' + Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.MD5,
      action + '|' + (p.f || '') + '|' + (p.name || ''), Utilities.Charset.UTF_8));
    var hit = cache.get(rkey);
    if (hit) return ContentService.createTextOutput(hit).setMimeType(ContentService.MimeType.JSON);
  }
  var out;
  try {
    out = handle_(action, p, getData_(), {ai: aiPlan_, today: Utilities.formatDate(new Date(), 'Asia/Bangkok', 'yyyy-MM-dd')});
  } catch (err) {
    out = {error: 'unavailable'};
  }
  var text = JSON.stringify(out);
  if (rkey && !out.error && text.length < 95000) { try { cache.put(rkey, text, CONFIG.cacheSeconds); } catch (err) {} }
  return ContentService.createTextOutput(text).setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  var out;
  try {
    var body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    out = saveLead_(body);
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
      try { return JSON.parse(unpack_(b64)); } catch (err) {}
    }
  }
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var saved = readSaved_(ss), age = saved ? Date.now() - saved.t : Infinity;
  var auto = PropertiesService.getScriptProperties().getProperty('autoRefresh') === 'on';
  if (saved && age < (auto ? 6 * 3600e3 : CONFIG.cacheSeconds * 1000)) {
    putCache_(saved.b64);
    return JSON.parse(unpack_(saved.b64));
  }
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(500)) {
    if (saved) return JSON.parse(unpack_(saved.b64));   // someone else is rebuilding; use the older copy
    lock.waitLock(120000);
    var fresh = readSaved_(ss);
    if (fresh) { lock.releaseLock(); return JSON.parse(unpack_(fresh.b64)); }
  }
  try {
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
    if (n === CONFIG.dataSheet || n === CONFIG.leadsSheet || SKIP_TABS_[n] || t.getLastRow() < 2) return;
    var head = t.getRange(1, 1, 1, Math.max(1, t.getLastColumn())).getDisplayValues()[0].join('|').toLowerCase();
    if (!/(^|\|)university( name)?( \((en|english)\))?(\||$)/.test(head) || !/description|logo|photo/.test(head)) return;
    mergeProfiles_(data.profiles, buildProfiles_(t.getDataRange().getDisplayValues()));
  });
  return data;
}

function rebuild_(ss) {
  var data = buildData_(ss), b64 = pack_(JSON.stringify(data));
  writeSaved_(ss, b64);
  putCache_(b64);
  return data;
}

function pack_(str) {
  return Utilities.base64Encode(Utilities.gzip(Utilities.newBlob(str, 'application/json')).getBytes());
}
function unpack_(b64) {
  return Utilities.ungzip(Utilities.newBlob(Utilities.base64Decode(b64), 'application/x-gzip')).getDataAsString('UTF-8');
}

function putCache_(b64) {
  var size = 95000, parts = {}, count = Math.ceil(b64.length / size);
  for (var k = 0; k < count; k++) parts['um:' + k] = b64.substr(k * size, size);
  parts['um:n'] = String(count);
  try { CacheService.getScriptCache().putAll(parts, CONFIG.cacheSeconds); } catch (err) {}
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
  var data = rebuild_(SpreadsheetApp.getActiveSpreadsheet()), cache = CacheService.getScriptCache();
  // Pre-compute the answers every visitor asks for first, so the page opens instantly.
  var warm = [['meta', '', ''], ['search', JSON.stringify(defaultSearch_('uni')), ''], ['search', JSON.stringify(defaultSearch_('prog')), '']];
  warm.forEach(function (w) {
    var key = 'r:' + Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, w[0] + '|' + w[1] + '|' + w[2], Utilities.Charset.UTF_8));
    var text = JSON.stringify(handle_(w[0], {f: w[1]}, data, {}));
    if (text.length < 95000) { try { cache.put(key, text, CONFIG.cacheSeconds); } catch (err) {} }
  });
}

// Must match the first request the page sends (F in the page script, plus view and page).
function defaultSearch_(view) {
  return {q: '', uni: '', lv: [], city: [], sub: [], lang: [], tier: [], max: 0, myHsk: '', open: false, nohsk: false, nocsca: false, sch: false, sort: 'rel', view: view, page: 1};
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
    return !SKIP_TABS_[n] && n !== CONFIG.leadsSheet && t.getLastRow() > 1;
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
  var lock = LockService.getScriptLock();
  lock.waitLock(5000);
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sh = ss.getSheetByName(CONFIG.leadsSheet);
    if (!sh) {
      sh = ss.insertSheet(CONFIG.leadsSheet);
      sh.appendRow(['Timestamp', 'Name', 'Email', 'LINE ID', 'Phone', 'Quiz answers', 'Matched Programme ID', 'Matched University', 'Matched Programme', 'Exact match?', 'Privacy consent', 'Email list opt-in', 'Report sent?']);
    }
    sh.appendRow([new Date(), safe_(name), safe_(email), safe_(line), safe_(phone), safe_(clean_(b.answers, 600)),
      safe_(clean_(b.matchId, 40)), safe_(clean_(b.matchUni, 150)), safe_(clean_(b.matchProg, 200)), b.exact ? 'Yes' : 'Closest',
      'Yes', b.marketing === true ? 'Yes' : 'No', '']);
  } finally {
    lock.releaseLock();
  }
  cache.put(key, '1', 60);
  return {ok: true};
}

function clean_(v, max) { return String(v == null ? '' : v).replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max); }
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
      open: /^(open|current)/i.test(cs), past: /past/i.test(cs), review: /review|unverified|low/i.test(g('Data Confidence')),
      campus: g('Campus'), ca: yes_(can)
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
    row.hay = (uni + ' ' + row.cn + ' ' + row.city + ' ' + row.cl.map(function (c) { return CITY_TH[c] || ''; }).join(' ') + ' ' + low).toLowerCase();
    out.push(row);
  }
  return out;
}

function nameKey_(s) { return String(s || '').toLowerCase().replace(/[^a-z0-9]/g, ''); }

// Accepts header variants, e.g. "Logo URL (WordPress)" or "Campus photo URL (WordPress)".
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
    out[nameKey_(u)] = {desc: g(C.desc).slice(0, 400), photo: url(g(C.photo)), logo: url(g(C.logo)), credit: g(C.credit).slice(0, 200), src: url(g(C.src))};
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
function pub_(r) {
  return {id: r.id, u: r.u, cn: r.cn, city: r.city, lv: r.lv, prog: r.prog, track: r.track, school: r.school, lang: r.lang,
    dur: r.dur, tu: r.tu, tot: r.tot, hsk: r.hsk, hskTxt: r.hskTxt, hskk: r.hskk, hskkLv: r.hskkLv, ielts: r.ielts, toefl: r.toefl,
    eng: r.eng, csca: r.csca, cscaSub: r.cscaSub, sch: r.sch, dl: r.dl, cyc: r.cyc, open: r.open, past: r.past, review: r.review,
    campus: r.campus, f: r.f, s: r.s, req: r.req || [], ca: !!r.ca};
}

function uniSummary_(name, list, profiles) {
  var r0 = list[0], prof = profileOf_(profiles, name), fees = [], lv = {}, fc = {}, open = false, sch = false, en = 0, ca = false;
  list.forEach(function (r) {
    if (r.tu) fees.push(r.tu);
    lv[r.lv] = 1; if (r.f !== 'oth') fc[r.f] = (fc[r.f] || 0) + 1;
    if (r.open) open = true; if (r.sch) sch = true; if (r.lang !== 'zh') en++; if (r.ca) ca = true;
  });
  return {name: name, short: shortName_(name), cn: r0.cn, city: r0.city, prov: r0.prov, code: r0.code, tiers: TIERS[r0.code] || [],
    desc: prof.desc || '', photo: prof.photo || '', logo: prof.logo || '', credit: prof.credit || '', src: prof.src || '', n: list.length,
    feeMin: fees.length ? Math.min.apply(null, fees) : 0, feeMax: fees.length ? Math.max.apply(null, fees) : 0,
    levels: ['UG', 'PG', 'PHD', 'LANG'].filter(function (k) { return lv[k]; }),
    top: Object.keys(fc).sort(function (a, b) { return fc[b] - fc[a]; }).slice(0, 2), open: open, sch: sch, en: en, ca: ca};
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
  return {uni: uniSummary_(name, all, profiles), total: list.length, page: pg.page, size: pg.size,
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
    if (r.ca) pen -= 2;      // small preference for programmes Chinese Chiwchiw can apply to
    if (r.review) pen += 1;
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
  return {item: pub_(chosen.r), uni: {name: us.name, short: us.short, cn: us.cn, city: us.city, photo: us.photo, logo: us.logo, credit: us.credit, src: us.src, desc: us.desc, tiers: us.tiers},
    gaps: chosen.g, exact: chosen.g.exact, ai: usedAI,
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
  if (r.review) watch.push('ข้อมูลบางส่วนของหลักสูตรนี้ทีมกำลังตรวจสอบ');
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
  'Timeline: 5 to 9 steps from today (given) until departure, worked back from the deadline. Use real Thai month abbreviations for every step. If cycle_past is false, add the Christian-era year (for example มี.ค. 2027). If cycle_past is true, the new round has not opened yet: base the months on the previous round\'s deadline, write months WITHOUT a year (for example มี.ค.), and say in one step that the team will confirm the new round\'s dates. Cover the language test, CSCA if required, a portfolio or entrance exam or audition if listed in extra_requirements, writing the study plan (always for master and PhD, and whenever studyplan is listed; for bachelor scholarships mention that some scholarships ask for one), documents, the application, the scholarship application if available, interview preparation if interview is listed, and visa and pre-departure. Keep the steps in order. Living costs inside total cost are estimates; say so if you mention the total.',
  '',
  'Start plan: if the student is applying in the next round, use the dated timeline above. If they are planning ahead for a later year, use phases relative to the application year (for example ประมาณ 1 ปีก่อนยื่นสมัคร, 2–3 เดือนก่อนปิดรับ) with no years, and treat language gaps as time to prepare. If they are just exploring, do not push them to apply: make the plan about comparing 2–3 options from the list on the page, trying Chinese lessons or a short camp, and choosing a start year with the team; use relative phases with no dates.',
  '',
  'Writing: Thai, warm and encouraging, in the voice of the Chinese Chiwchiw team. Address the reader as นักเรียน and never as น้อง. Short sentences, one idea per bullet, at most two sentences each, no emoji, no markdown. watch_out lists honest gaps (language, budget, city, data still being verified) and is an empty array when there are none.'
].join('\n');

var AI_SCHEMA_BASE = {
  type: 'object', additionalProperties: false,
  required: ['pick_id', 'headline', 'why_fit', 'watch_out', 'prepare', 'timeline'],
  properties: {
    pick_id: {type: 'string', description: 'id of the chosen programme, copied exactly from the shortlist'},
    headline: {type: 'string', description: 'one Thai sentence saying why this is the best fit'},
    why_fit: {type: 'array', items: {type: 'string'}, description: '3 or 4 reasons this programme fits this student'},
    watch_out: {type: 'array', items: {type: 'string'}, description: '0 to 3 honest gaps or caveats'},
    prepare: {type: 'array', items: {type: 'string'}, description: '3 to 6 concrete preparation steps'},
    timeline: {type: 'array', items: {type: 'object', additionalProperties: false, required: ['when', 'task'],
      properties: {when: {type: 'string'}, task: {type: 'string'}}}, description: '5 to 9 steps in order'}
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
      scholarship_available: r.sch, chinese_chiwchiw_can_apply: !!r.ca, deadline: r.dl || null, cycle: r.cyc || null, cycle_past: r.past, data_being_verified: r.review,
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
