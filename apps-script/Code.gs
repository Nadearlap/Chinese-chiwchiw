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
 * OPTIONAL TAB "University Profiles" (row 1 headers):
 *   University | Description | Photo URL
 *   University must match the "University" column of Master Data exactly.
 *   Description = 1–2 Thai sentences. Photo URL = an https:// image (e.g. from
 *   the WordPress media library).
 *
 * Leads from the email form are appended to the "Matcher Leads" tab (created
 * automatically). Sending the report email is not set up yet.
 */

var CONFIG = {
  dataSheet: 'Master Data',
  profileSheet: 'University Profiles',
  leadsSheet: 'Matcher Leads',
  onlyCanApply: true,      // only programmes where "Chinese Chiwchiw Can Apply?" starts with Yes
  thbPerRmb: 4.6,          // keep in sync with data-rate on the page
  pageSize: 12,
  maxPageSize: 24,
  cacheSeconds: 600        // sheet edits show on the site within ~10 minutes
};

/* ───────────── reference tables ───────────── */

var TIERS = {THU:['C9','985','211','DFC'],PKU:['C9','985','211','DFC'],FUDAN:['C9','985','211','DFC'],SJTU:['C9','985','211','DFC'],ZJU:['C9','985','211','DFC'],NJU:['C9','985','211','DFC'],USTC:['C9','985','211','DFC'],HIT:['C9','985','211','DFC'],XJTU:['C9','985','211','DFC'],
  BUAA:['985','211','DFC'],BIT:['985','211','DFC'],DUT:['985','211','DFC'],WHU:['985','211','DFC'],CQU:['985','211','DFC'],ECNU:['985','211','DFC'],HNU:['985','211','DFC'],OUC:['985','211','DFC'],RUC:['985','211','DFC'],SYSU:['985','211','DFC'],SCUT:['985','211','DFC'],SCU:['985','211','DFC'],
  SWUFE:['211','DFC'],GXU:['211','DFC'],JNU:['211','DFC'],JINAN:['211','DFC'],SISU:['211','DFC'],SCNU:['211','DFC'],SILC:['211','SF'],SWPU:['DFC'],NUIST:['DFC'],NBU:['DFC'],SUSTECH:['DFC'],XJTLU:['SF'],BLCU:['DFC']};

var CITY_TH = {Shanghai:'เซี่ยงไฮ้',Beijing:'ปักกิ่ง',Chengdu:'เฉิงตู',Guangzhou:'กวางโจว',Qingdao:'ชิงเต่า',Hangzhou:'หางโจว',Nanjing:'หนานจิง',Wuhan:'อู่ฮั่น',"Xi'an":'ซีอาน',Shenzhen:'เซินเจิ้น',Tianjin:'เทียนจิน',Kunming:'คุนหมิง',Xiamen:'เซี่ยเหมิน',Chongqing:'ฉงชิ่ง',Harbin:'ฮาร์บิน',Dalian:'ต้าเหลียน',Changsha:'ฉางซา',Jinan:'จี่หนาน',Suzhou:'ซูโจว',Nanning:'หนานหนิง',Hefei:'เหอเฝย',Shenyang:'เสิ่นหยาง',Zhengzhou:'เจิ้งโจว',Fuzhou:'ฝูโจว',Wuxi:'อู๋ซี',Ningbo:'หนิงปัว',Zhuhai:'จูไห่'};

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
  var out;
  try {
    out = handle_(p.action || '', p, getData_());
  } catch (err) {
    out = {error: 'unavailable'};
  }
  return json_(out);
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

function getData_() {
  var cache = CacheService.getScriptCache();
  var head = cache.get('um:n');
  if (head) {
    var n = +head, keys = [];
    for (var i = 0; i < n; i++) keys.push('um:' + i);
    var got = cache.getAll(keys);
    if (Object.keys(got).length === n) {
      var s = '';
      for (var j = 0; j < n; j++) s += got['um:' + j];
      return JSON.parse(s);
    }
  }
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(CONFIG.dataSheet);
  var data = {rows: buildRows_(sh.getDataRange().getDisplayValues()), profiles: {}};
  var ps = ss.getSheetByName(CONFIG.profileSheet);
  if (ps) data.profiles = buildProfiles_(ps.getDataRange().getDisplayValues());
  var str = JSON.stringify(data), size = 90000, parts = {}, count = Math.ceil(str.length / size);
  for (var k = 0; k < count; k++) parts['um:' + k] = str.substr(k * size, size);
  parts['um:n'] = String(count);
  try { cache.putAll(parts, CONFIG.cacheSeconds); } catch (err) {}
  return data;
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

function handle_(action, p, data) {
  var f = parseJSON_(p.f), rows = data.rows;
  if (action === 'meta') return meta_(rows);
  if (action === 'search') return search_(rows, data.profiles, f);
  if (action === 'uni') return uniDetail_(rows, data.profiles, String(p.name || ''), f);
  if (action === 'match') return bestMatch_(rows, data.profiles, parseJSON_(p.a));
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

function buildRows_(values) {
  var H = {};
  values[0].forEach(function (h, i) { H[String(h).trim().toLowerCase()] = i; });
  var out = [];
  for (var k = 1; k < values.length; k++) {
    var r = values[k];
    var g = function (n) { var i = H[n.toLowerCase()]; return i == null ? '' : String(r[i] == null ? '' : r[i]).trim(); };
    var uni = g('University'), prog = g('Programme / Major');
    if (!uni || !prog) continue;
    if (CONFIG.onlyCanApply && g('Chinese Chiwchiw Can Apply?') && !yes_(g('Chinese Chiwchiw Can Apply?'))) continue;
    if (/dup/i.test(g('Duplicate Check'))) continue;

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
      campus: g('Campus')
    };
    var low = (prog + ' ' + row.school + ' ' + row.track + ' ' + g('Search Keywords / Tags')).toLowerCase();
    row.f = 'oth'; row.s = '';
    if (lv === 'LANG') { row.f = 'lang'; row.s = 'cnprog'; }
    else for (var t = 0; t < TAXO.length; t++) if (TAXO[t][2].test(low)) { row.f = TAXO[t][0]; row.s = TAXO[t][1]; break; }
    row.code = codeOf_(uni);
    row.hay = (uni + ' ' + row.cn + ' ' + row.city + ' ' + (CITY_TH[row.city] || '') + ' ' + low).toLowerCase();
    out.push(row);
  }
  return out;
}

function buildProfiles_(values) {
  var H = {}, out = {};
  values[0].forEach(function (h, i) { H[String(h).trim().toLowerCase()] = i; });
  for (var k = 1; k < values.length; k++) {
    var r = values[k], u = String(r[H['university']] || '').trim();
    if (!u) continue;
    var photo = String(r[H['photo url']] || '').trim();
    out[u] = {desc: String(r[H['description']] || '').trim().slice(0, 400), photo: /^https:\/\//.test(photo) ? photo : ''};
  }
  return out;
}

// The ONLY programme fields that are ever sent to the website.
function pub_(r) {
  return {id: r.id, u: r.u, cn: r.cn, city: r.city, lv: r.lv, prog: r.prog, track: r.track, school: r.school, lang: r.lang,
    dur: r.dur, tu: r.tu, tot: r.tot, hsk: r.hsk, hskTxt: r.hskTxt, hskk: r.hskk, hskkLv: r.hskkLv, ielts: r.ielts, toefl: r.toefl,
    eng: r.eng, csca: r.csca, cscaSub: r.cscaSub, sch: r.sch, dl: r.dl, cyc: r.cyc, open: r.open, past: r.past, review: r.review,
    campus: r.campus, f: r.f, s: r.s};
}

function uniSummary_(name, list, profiles) {
  var r0 = list[0], prof = profiles[name] || {}, fees = [], lv = {}, fc = {}, open = false, sch = false, en = 0;
  list.forEach(function (r) {
    if (r.tu) fees.push(r.tu);
    lv[r.lv] = 1; if (r.f !== 'oth') fc[r.f] = (fc[r.f] || 0) + 1;
    if (r.open) open = true; if (r.sch) sch = true; if (r.lang !== 'zh') en++;
  });
  return {name: name, short: shortName_(name), cn: r0.cn, city: r0.city, prov: r0.prov, code: r0.code, tiers: TIERS[r0.code] || [],
    desc: prof.desc || '', photo: prof.photo || '', n: list.length,
    feeMin: fees.length ? Math.min.apply(null, fees) : 0, feeMax: fees.length ? Math.max.apply(null, fees) : 0,
    levels: ['UG', 'PG', 'PHD', 'LANG'].filter(function (k) { return lv[k]; }),
    top: Object.keys(fc).sort(function (a, b) { return fc[b] - fc[a]; }).slice(0, 2), open: open, sch: sch, en: en};
}

function meta_(rows) {
  var unis = {}, cities = {}, en = 0;
  rows.forEach(function (r) {
    unis[r.u] = 1;
    var c = cities[r.city] || (cities[r.city] = {UG: 0, PG: 0, PHD: 0, LANG: 0, all: 0});
    c[r.lv]++; c.all++;
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
  if (city.length && city.indexOf(r.city) < 0) return false;
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

// Scores every programme at the chosen level; the lowest penalty wins.
// Returns exactly one programme. exact=false means nothing met every condition.
function bestMatch_(rows, profiles, a) {
  var lvMap = {ug: 'UG', ma: 'PG', phd: 'PHD'}, want = lvMap[a.deg] || 'UG';
  var groups = arr_(a.groups), text = String(a.text || '').toLowerCase().trim().slice(0, 80);
  var anyMajor = !!a.anyMajor || (!groups.length && !text);
  var myHsk = +a.hsk || 0, myIelts = +a.ielts || 0, budget = +a.budget || 0, cities = arr_(a.cities);
  var best = null;
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
    if (useZh && a.lang !== 'en') { g.hskGap = r.hsk ? Math.max(0, r.hsk - myHsk) : 0; pen += Math.min(36, g.hskGap * 12); }
    else if (!useZh && a.lang !== 'zh') { g.ieltsGap = r.ielts ? Math.max(0, Math.round((r.ielts - myIelts) * 10) / 10) : 0; pen += Math.min(40, g.ieltsGap * 20); }
    else { g.hskGap = 0; g.ieltsGap = 0; g.testUnknown = true; }
    var cost = r.tot || r.tu;
    g.thb = cost ? Math.round(cost * CONFIG.thbPerRmb) : 0;
    g.over = budget && g.thb > budget ? g.thb - budget : 0;
    if (g.over) pen += Math.min(40, g.over / budget * 60);
    if (!cost) pen += 3;
    g.city = !cities.length || cities.indexOf(r.city) > -1;
    if (!g.city) pen += 15;
    if (a.schol === 'must') pen += r.sch ? -6 : 6; else if (a.schol === 'nice' && r.sch) pen -= 3;
    if (r.open) pen -= 2;
    if (r.review) pen += 1;
    if (useZh && r.hsk && myHsk > r.hsk) pen -= 2;
    g.exact = g.major && g.lang && !g.hskGap && !g.ieltsGap && !g.over && g.city;
    if (!best || pen < best.pen || (pen === best.pen && (cost || 1e9) < (best.cost || 1e9))) best = {pen: pen, cost: cost, r: r, g: g};
  });
  if (!best) return {item: null};
  var all = rows.filter(function (x) { return x.u === best.r.u; });
  var u = uniSummary_(best.r.u, all, profiles);
  return {item: pub_(best.r), uni: {name: u.name, short: u.short, cn: u.cn, city: u.city, photo: u.photo, desc: u.desc, tiers: u.tiers},
    gaps: best.g, exact: best.g.exact};
}
