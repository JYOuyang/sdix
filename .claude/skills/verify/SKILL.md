---
name: verify
description: Drive the SDI explorer (docs/ static site) in headless Chrome to check a change end to end — clicks, URL state, downloads, clipboard, screenshots at desktop and phone width. Use when a docs/ change needs seeing in a real browser: behavior, layout, or exports.
---

# Verifying sdix changes

Static site, no build step. Drive it with Python Playwright against system Chrome
(`/usr/bin/google-chrome`) via `uv run` + PEP 723 inline deps; uv resolves
playwright and `channel="chrome"` skips the browser download:

```python
# /// script
# dependencies = ["playwright"]
# ///
# launch with: uv run script.py
p.chromium.launch(channel="chrome", headless=True)
```

`file://docs/index.html` works (data.js is a script tag, nothing fetches). Serve
over http when a permission needs an origin (clipboard) or file:// misbehaves:
`uv run python -m http.server 8741 --directory docs` (run in background).

Why Playwright over raw Chrome: a warm run is ~1.1s vs ~0.5s for
`google-chrome --headless=new --dump-dom` (measured 2026-07-11), and authoring is
far better. Raw Chrome is still the zero-setup option for a one-off screenshot:
`google-chrome --headless=new --disable-gpu --no-sandbox --window-size=1400,950 --screenshot=out.png "file://.../index.html?s=CA"`

## Driving the app

- URL params set initial state, usually cheaper than clicking: `?s=CA&s=NC`,
  `m=additive`, `notes=1`, `band=1`, `hide=1`, groups as `s=Name%3ACT%2CMA`
- State chips: `.state-chip:has-text('CA')` (click toggles a highlight series)
- Toolbar: `#copy-link`, `#copy-image`, `#download-png`
- Data table: open `details summary`, then `#download-csv`
- Downloads: `expect_download()`; PNG export is 2400×1350 (1200×675 at 2×). To
  test a download handler without the file, `page.evaluate` a monkey-patch of
  `HTMLAnchorElement.prototype.click` and capture `this.download`
- Clipboard needs `context.grant_permissions(["clipboard-read", "clipboard-write"], origin=...)`
  and an http origin; the copy-image write takes ~1s headless before "Copied ✓"
- Where hover() is awkward, dispatch synthetically:
  `el.dispatchEvent(new Event("mouseenter"))`, `new MouseEvent("mousemove", {clientX, clientY})`
- Listen for `pageerror` and console `error` events; there's no framework to surface them

## Screenshots for UX checks

- `page.screenshot(path=...)` for the full page; `page.locator("header").screenshot(...)`
  to crop a region (toolbar, chart panel, tooltip)
- Set the viewport at context creation (`viewport={"width": 1440, "height": 900}`);
  rerun at ~390px for the responsive layout
- View screenshots and exported PNGs with Read and judge them visually; a valid
  PNG isn't a UX verdict
- Button feedback ("Copied ✓") lasts 1600ms, so screenshot inside that window when
  the feedback state is what you're checking
