---
name: chiwchiw-mobile-debug
description: Diagnose pages on chinesechiwchiw.com that freeze, won't respond to taps or load blank on iPhone/Safari when desktop Chrome tests pass. Use when Dear reports "frozen", "can't press", "stuck" or "cannot load" on her phone.
---

# Debugging iPhone-only problems

Cloud sessions have Chromium only — no WebKit, and `playwright install` must not be run. So reproduce
what you can in Chromium with iPhone emulation, then let Dear's phone be the instrument.

## 1. Rule out the easy things
- Run `tools/matcher-tests/live-tap.js` (or adapt it): taps through on an emulated iPhone and checks
  `elementFromPoint` so an invisible overlay shows up as "COVERED by …".
- Check the served HTML for an iPhone user agent equals what you published and `node --check` passes.
- Ask whether she's in Safari or an in-app browser (Gmail/LINE show a V/X bar) and whether she can scroll.

## 2. Use the built-in diagnostic box
Send her `https://chinesechiwchiw.com/university-match/?debug=1` (matcher only; add the same block to
other pages if needed). The black box shows: a clock ticking each second, number of touches, the
element under the last touch, scroll position, html/body overflow, and the current step.
Ask her to reproduce, tap 2–3 times, wait 3 s, screenshot:
- **Clock stopped** → main thread hung (script loop or WebKit style/layout hang). The "tap:" line shows
  what was touched just before.
- **Clock running, taps land on an unexpected element** → invisible overlay; the line names it.
- **overflow hidden** on html/body → something locked scrolling (modal/menu not closed).

## 3. Known cause (Oct 2026)
Tapping any quiz option froze iPhones: options were hidden radios/checkboxes **inside `<label>`**; the
theme (Blocksy) and Jetpack ship `label:has(input:checked)` / `:has()` rules, and toggling `:checked`
made WebKit re-check them across 100+ labels. Fix: buttons with `aria-pressed`, inputs beside their
labels. Before adding any form control, grep the site CSS for `:has(` and avoid that pattern.

## 4. Other lessons
- No red error box (the matcher shows script errors in `.um-qerr`) + frozen page ⇒ not a JS exception.
- Long waits look like freezes on phones: the AI match takes ~15 s; the loading screen says so and the
  request retries once if Safari drops it.
- Keep a `qErr` style on-screen error reporter on complex pages so a screenshot carries the error text.
