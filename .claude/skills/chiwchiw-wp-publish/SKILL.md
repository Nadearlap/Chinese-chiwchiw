---
name: chiwchiw-wp-publish
description: Safely publish or update a page on chinesechiwchiw.com (WordPress + Elementor) from the HTML in pages/*.html — backup, live-equals-git check, write _elementor_data or block content, clear the Elementor cache, verify the live script. Use for any change to the homepage, founder page, testimonials, Chiwchiw Match or other site pages.
---

# Publish a page to chinesechiwchiw.com

The repo's `pages/*.html` is the source of truth. Pages are one HTML widget each, written over the
WordPress REST API. Never edit the live page in a way the repo doesn't record.

## Credentials
Use the WordPress application password Dear provides (env var `WP_AUTH` = `Basic base64(user:app-password)`
if set; otherwise ask her). Never write it into the repo, a commit, a file or a chat summary.

## Page map
| Page | WP id | Where the HTML lives in the page |
|---|---|---|
| Homepage | 828 | `_elementor_data` → `el[1].elements[0].settings.html` (keep spacer `el[0]`) — build with `tools/homepage/build.py` |
| Founder (เกี่ยวกับนาเดียร์) | 168 | `el[0].elements[0].settings.html` — build with `tools/founder/build.py` |
| Chiwchiw Match (/university-match/) | 3879 | `d[0].elements[0].settings.html` = `pages/university-matcher.html` |
| Testimonials (รีวิว) | 175 | block page: `content` = `<!-- wp:html -->…<!-- /wp:html -->` |
| Site footer | widget block-11 | `pages/site-footer.html` |

## Steps (every publish)
1. **Backup**: `GET /wp-json/wp/v2/pages/<id>?context=edit&_fields=meta,content` → save to the scratchpad.
2. **Live == git**: the live HTML must equal `git show HEAD:pages/<file>`. If not, someone edited the
   live page — stop, diff, and merge their change into the repo first.
3. **Write**: `POST /wp-json/wp/v2/pages/<id>` with `{"meta":{"_elementor_data": json.dumps(d, ensure_ascii=False)}}`
   (Elementor pages) or `{"content": ...}` (block pages).
4. **Clear cache**: `DELETE /wp-json/elementor/v1/cache`.
5. **Verify**: fetch the live URL with `?nc=<random>`, extract the page's inline `<script>`, run
   `node --check`, and confirm `&#038;&#038;` does NOT appear.
6. **Commit + push** the repo change with a message that says what changed for Dear.

## Rules learned the hard way
- **`&&` filter**: on some pages WordPress turns `&&` into `&#038;&#038;` when a `<` appears earlier
  in an inline script. The homepage/founder build scripts assert their inline scripts contain no `<`
  (use `0>=x`, `x.length>i`, `createElement`). Always do step 5.
- Full-bleed sections: `width:100vw;max-width:none;position:relative;left:50%;right:50%;margin-left:-50vw;margin-right:-50vw` (with `!important`).
- Images: use Jetpack resizing `https://i0.wp.com/chinesechiwchiw.com/wp-content/uploads/...?resize=W%2CH&ssl=1`.
- Brand: Kanit + Noto Sans Thai; orange #FF6B00, espresso #1A0A00, cream #FFFBF7; cards 1px #EDE5DC, radius 16px.
- During beta Dear doesn't want surprise changes: publish only what she asked for, then show her
  phone-sized screenshots (see `tools/matcher-tests/live-tap.js` for the pattern).
