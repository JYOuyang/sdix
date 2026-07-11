---
name: verify
description: Build/launch/drive recipe for verifying changes to the SDI explorer (docs/ static site)
---

# Verifying sdix changes

Static site, no build step. Drive it with Python Playwright against system Chrome
(`/usr/bin/google-chrome`), always via `uv run` + PEP 723 inline deps — uv resolves
playwright itself, and `channel="chrome"` uses system Chrome, so nothing needs
installing:

```python
# /// script
# dependencies = ["playwright"]
# ///
# launch with: uv run script.py
p.chromium.launch(channel="chrome", headless=True)
```

`file://docs/index.html` loads fine (data.js is a script tag, nothing fetches);
serve over http when granting permissions (clipboard) or if file:// misbehaves:
`uv run python -m http.server 8741 --directory docs` (run in background).

Timing (measured 2026-07-11): warm Playwright run ~1.1s vs ~0.5s for a raw
`google-chrome --headless=new --dump-dom` probe — not worth the worse authoring.
Raw Chrome is still handy as a zero-setup one-liner for a quick screenshot:
`google-chrome --headless=new --disable-gpu --no-sandbox --window-size=1400,950 --screenshot=out.png "file://.../index.html?s=CA"`

## Driving the app

- URL params set initial state: `?s=CA&s=NC`, `notes=1`, `m=additive`, groups as
  `s=Name%3ACT%2CMA` — often cheaper than clicking your way there
- State chips: `.state-chip:has-text('CA')` (click toggles a highlight series)
- Toolbar: `#copy-link`, `#copy-image`, `#download-png`
- Data table: open `details summary`, then `#download-csv`
- Downloads: `expect_download()`; PNG export is 2400×1350. To test a download
  handler without the file, `page.evaluate` a monkey-patch of
  `HTMLAnchorElement.prototype.click` and capture `this.download`
- Clipboard needs `context.grant_permissions(["clipboard-read", "clipboard-write"], origin=...)`
  and an http origin; the copy-image write takes ~1s headless before "Copied ✓"
- Hover paths can be driven synthetically where hover() is awkward:
  `el.dispatchEvent(new Event("mouseenter"))`, `new MouseEvent("mousemove", {clientX, clientY})`
- Watch `pageerror` and console `error` events — the app has no framework to swallow them

## Screenshots for UX checks

- `page.screenshot(path=...)` for the full page; `page.locator("header").screenshot(...)`
  to crop a region (toolbar, chart panel, tooltip)
- Set the viewport at context creation (`viewport={"width": 1440, "height": 900}`);
  rerun narrow (~390px) to check the responsive layout
- Screenshots and downloaded export PNGs are image files — view them with the Read
  tool and actually eyeball them; valid-PNG-bytes is not a UX verdict
- Transient button feedback ("Copied ✓") lasts 1600ms — screenshot within that
  window if the feedback state is what you're verifying
