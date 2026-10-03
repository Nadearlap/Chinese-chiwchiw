---
name: chiwchiw-apps-script
description: Guide Dear through updating and deploying the Chiwchiw Match Apps Script (apps-script/Code.gs) and fix its email/permission problems — paste, Save, New version deploy, authorisation, testEmail, sendMissingReports, dashboard rebuild. Use whenever Code.gs changes or emails/leads/stats are not arriving.
---

# Deploying and running the matcher's Apps Script

Dear does the deploy herself; she isn't technical. Always send her the file (`SendUserFile`
apps-script/Code.gs) and short numbered steps. Prepare changes in the repo first; during beta she
only deploys when she chooses.

## Deploy steps (copy to her)
1. Open the sheet **Chinese_Chiwchiw_University_Programme_Database_Oct_2026** → **Extensions → Apps Script**.
2. Click in the code → **Ctrl/Cmd + A** → **Delete** → paste the new Code.gs → 💾 **Save**.
3. **Deploy → Manage deployments → ✏️ → Version: New version → Deploy**.
4. If new Google services were added (e.g. MailApp, openById, UrlFetchApp, GmailApp): choose a function
   in the dropdown next to ▷ Run (e.g. `testEmail`) → **Run** → **Review permissions** → her account →
   **Advanced → Go to … (unsafe)** → **Allow**. Deploying alone never shows the permission screen.

Check it's live without her: `GET <web app>/exec?action=match&a=…` returns a `rid` on the new code.

## Runnable helpers (in the editor dropdown)
- `testEmail` — sends one test email to admin@, logs emails left today and whether the Website leads
  tab was found. Errors show the real cause.
- `sendMissingReports` — emails a report to every Matcher Leads row whose "Report sent?" isn't Yes
  (uses the matched programme from the sheet; no AI plan).
- `setupMatcherDashboard` — rebuilds the "Matcher Dashboard" tab (also first-run authorisation).

## Troubleshooting
| Symptom | Cause / fix |
|---|---|
| "An unknown error has occurred" on Run | Usually several Google accounts in one browser, or a blocked pop-up. Use an incognito window with only her account; allow pop-ups for script.google.com. |
| "Report sent?" = `No (email not allowed yet: run testEmail)` | Mail permission missing → run `testEmail` and Allow. |
| `No (sent earlier today)` / `No (already sent in the last N days)` | Per-address limit working as designed. |
| `No (match expired)` | Lead arrived >6 h after the match; use `sendMissingReports`. |
| Dates show as 46298 in the dashboard | Format → Number → Date (the code sets it on rebuild). |
| Leads not in Website leads | `CONFIG.webLeadsId` / tab "UG/PG" header names must match. |

## Facts to tell her when asked
- Emails send from the account that owns the script (display name "Chinese Chiwchiw", reply-to admin@).
  Sending "from" admin@ needs a Gmail "Send mail as" alias + GmailApp + new permission.
- Gmail quota ~1,500/day on Workspace; each lead uses 2 emails.
- Workspace: aliases (30/user) and Google Groups are free; only real user accounts are billed.
