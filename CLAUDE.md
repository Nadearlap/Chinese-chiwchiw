# Chinese Chiwchiw — project notes for Claude

Dear (Nadear) is the founder of Chinese Chiwchiw, a Thai consultancy for studying in China
(camps, Go Abroad, language courses, bachelor's and master's). Site: https://chinesechiwchiw.com
(WordPress, Blocksy theme + Elementor). Main session for this work: "⭐ Chinese Chiwchiw — Website +
Chiwchiw Match (MAIN, Oct 2026)".

## How to work with Dear
- Thai-first audience. Explain in simple English, step by step, with screenshots/previews when possible.
- Her data is private: never send it anywhere else; never commit passwords or API keys.
- During beta (from 3 Oct 2026) she does NOT want live changes unless she asks. Prepare changes in
  the repo and let her decide when to paste/deploy.

## What lives where
| Thing | Where | How it changes |
|---|---|---|
| Page HTML | `pages/*.html` | Published to WordPress via REST (`_elementor_data`); see below |
| Homepage / founder page | `tools/homepage/`, `tools/founder/` (`build.py` → `pages/*.html`) | Rebuild, then publish |
| Chiwchiw Match page | `pages/university-matcher.html` → WP page 3879 (`/university-match/`) | `d[0].elements[0].settings.html` |
| Matcher backend | `apps-script/Code.gs` → Apps Script bound to the "Chinese_Chiwchiw_University_Programme_Database_Oct_2026" sheet | Dear pastes it: Save → Deploy → Manage deployments → ✏️ → New version |
| Leads | Sheet tabs "Matcher Leads", "Matcher Stats", "Matcher Dashboard"; copy to "Website leads" sheet → tab "UG/PG" | Written by Code.gs |
| Emails | Report to student (orange-header design) + "🎓 Lead ใหม่" alert to admin@chinesechiwchiw.com | Code.gs `sendReport_`, `sendAlert_` |
| AI | Claude Sonnet 5.5 via Dear's own Anthropic API key (Script properties `ANTHROPIC_API_KEY`), ~$0.03–0.04 per match | `CONFIG.aiModel` |

Publishing a page: back up the live `_elementor_data` first, check that the live HTML equals
`git show HEAD:<file>` before replacing it, then `DELETE /wp-json/elementor/v1/cache`, re-fetch the
live page and `node --check` its inline script.

## Hard-won rules (do not undo)
- **WordPress output filter:** on some pages an inline script with `<` before `&&` gets `&&` turned
  into `&#038;&#038;`. Homepage/founder build scripts keep inline scripts free of `<`. Always verify
  the live script after publishing.
- **iPhone freeze:** never put `<input type=radio/checkbox>` inside a `<label>` on the matcher. The
  theme/Jetpack `label:has(input:checked)` rules froze Safari on every tap. Quiz options are
  `<button aria-pressed>`; checkboxes sit beside their labels. Keep contact fields plain
  (text inputs + inputmode, no autocomplete hints, no hidden fields).
- **Dates:** the AI and the backup plan may name months only when the database has a confirmed
  current-cycle deadline (`cycle_past` false + deadline). Otherwise relative phases and
  "ทีมจะยืนยันวันของรอบใหม่ให้". Never show years in plans. `noUnconfirmedDates_` enforces it.
- Emails say นักเรียน, never น้อง (Gmail translates น้อง as "sibling").
- LINE link: `https://lin.ee/C0CmZGa` (official OA; `line.me/ti/p/~@chiwchiw` does not open on phones).
- Logos: guessed as `<data-logo-base><slug>-logo.webp` then png/jpg/gif; slug drops any trailing "(…)".
- `?debug=1` on the matcher shows a diagnostic box (clock, last tap, scroll locks) — only for testing.

## Live vs. repo (as of 3 Oct 2026)
- Live Apps Script = the version with the orange-header email, 6-hour report limit, นักเรียน wording.
- Repo `Code.gs` is ahead and NOT deployed yet: `CONFIG.reportEveryDays` switch (0 = off) for the
  30-day report limit, and the "never guess dates" rule. Deploy together after beta.

## Planned (reminder set for Sat 10 Oct 2026, 10:00 Bangkok)
1. Deploy repo `Code.gs` with `reportEveryDays: 30`.
2. English version of the site + matcher (static English pages / TH|EN switch, English
   descriptions stored once in the sheet, AI writes in English) — no live translation.
3. Document-collection agent: free aliases on admin@ — camps.apply@, global.apply@, ug.apply@,
   pg.apply@ (she may prefer .docs) — files to private Drive folders, AI checks documents,
   tracking sheet, replies with what's missing. Optional separate ops@ account later.
4. Maybe: website-side limit on repeat matches (per device + per email).
- November: "Nadear Assistant" — AI concierge for students already in China (SIM, bank, visa…)
  from ~20–40 verified guides; check LINE (needs VPN in China) vs WeChat.

## Other open items
- 4 service pages to publish, then switch the homepage PENDING links in `tools/homepage/data.py`.
- Delayed Meta Pixel (`snippets/meta-pixel-delayed.html`) for WPCode snippet 3553 — Dear pastes it.
