---
name: chiwchiw-matcher
description: Work on Chiwchiw Match, the AI university matcher at chinesechiwchiw.com/university-match/ (pages/university-matcher.html + apps-script/Code.gs) — quiz steps, cities, contact/email step, results, AI plan rules, leads, stats, logos. Use for any change, bug or question about the matcher, its emails or its leads.
---

# Chiwchiw Match

## Architecture
- **Page** `pages/university-matcher.html` (WP page 3879): hero → 8-question quiz → contact step
  (name, email, consent required) → loading screen → result card + plan → finder (all universities).
  Publish with the `chiwchiw-wp-publish` skill.
- **Backend** `apps-script/Code.gs`: Apps Script web app bound to the Programme Database sheet.
  `doGet` actions `meta | search | uni | match`; `doPost` = lead (`saveLead_`) or visit stats (`t:'stats'`).
  Dear deploys it herself — see the `chiwchiw-apps-script` skill.
- **Match**: rules shortlist ~10 programmes (`bestMatch_`), Claude (`CONFIG.aiModel`, Sonnet 5.5, effort
  low, JSON schema) picks one and writes the Thai plan; `fallbackPlan_` if the AI is unavailable.
  `keepReport_` saves the student-facing match 6 h under a `rid`; the lead sends `rid` back so the
  email is built from server data, never from browser text.
- **Lead flow**: Matcher Leads row → Website leads "UG/PG" row (source "Chiwchiw Match") →
  student report email (`sendReport_`, orange-header design) → alert to admin@ (`sendAlert_`).
  One report per address per 6 h now; `CONFIG.reportEveryDays` (0 = off, planned 30) adds a
  Matcher-Leads check.
- **Stats**: one anonymous row per visit in "Matcher Stats" via `navigator.sendBeacon`; formula tab
  "Matcher Dashboard" (`setupMatcherDashboard()` rebuilds it). No names/emails in stats.

## Must-keep rules
1. **No inputs inside labels** on the quiz (iPhone freeze, see `chiwchiw-mobile-debug`). Options are
   `<button data-n data-v [data-multi] aria-pressed>`; read with `val()` / `vals()`.
2. **Contact fields stay plain**: `type="text"` + `inputmode`, `autocomplete="off"`, no hidden honeypot
   in the quiz form, privacy link outside the label.
3. **Dates**: months only when `cycle_past` is false and a deadline exists; never years; otherwise
   relative phases + "ทีมจะยืนยันวันของรอบใหม่ให้". `noUnconfirmedDates_` strips leaks. The result card
   shows "ทีมจะเช็กให้" instead of last round's deadline.
4. **Cities**: quiz shows 7 (`QUIZ_CITIES`: Shanghai, Beijing, Guangzhou, Shenzhen, Hangzhou, Chengdu,
   Wuhan) + "ที่ไหนก็ได้" + "➕ เมืองอื่น ๆ" (dropdown of every other city; picks join `QUIZ_EXTRA`).
5. **Wording**: นักเรียน, never น้อง. LINE = `https://lin.ee/C0CmZGa`. Thai copy first.
6. **Logos**: `<data-logo-base><slug>-logo.webp` → png → jpg → gif; `slug()` drops any trailing "(…)".
7. Inline script: keep it valid after WordPress output (see the publish skill's verify step).

## Test before publishing (all in `tools/matcher-tests/`)
- `node tools/matcher-tests/flow.js` — local page, mocked API, full quiz → lead → stats.
- `node tools/matcher-tests/gs-mock.js [match.json]` — Code.gs in Node with mocked Google services;
  prints sheet rows, writes both emails as HTML/PNG (pass a real `?action=match` answer for realism).
- `node tools/matcher-tests/live-tap.js` — live page on an emulated iPhone, POSTs blocked.
- Syntax: `node -e "require('vm').createScript(require('fs').readFileSync('apps-script/Code.gs','utf8'))"`.
(Run with `NODE_PATH=$(npm root -g)` in cloud sessions.)

## Real end-to-end test (only when Dear asks)
GET `?action=match&a=<answers>` on the deployed web app URL (in `data-api` on the page), then POST a
lead with `rid` to `nadear2002+testN@gmail.com` (plus-addressing avoids the per-address limit). Tell her
it adds a test row to Matcher Leads and Website leads and an alert to admin@.

## Costs (for Dear's questions)
~$0.03–0.04 per AI match on Sonnet 5.5 (her Anthropic Console credits, separate from Claude Max);
cached repeats free; `aiDailyLimit` 300. Haiku 4.5 would halve it but needs code changes (no `effort`
param) and testing. If credits run out the page falls back to the rule-based plan; leads still flow.
