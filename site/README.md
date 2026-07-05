# SDI 2.0 Explorer

A static, client-side-only explorer for the **State Democracy Index (SDI 2.0)**
panel (50 states × 2000–2023). No build step, no server, no dependencies —
plain HTML/CSS/JS with the data baked into `data.js`.

## Features

- All 50 states drawn as thin grey background lines (ggplot2 `theme_bw` styling).
- Click states (in the sidebar grid or directly on a grey line) to highlight them.
- **Groups**: press "+ Group", then click states to add them. Members share one
  color; a bold line shows the group mean. Group names are editable.
- Switch between the **MCMC** and **additive** index; optional **±1 SD band**
  on highlighted states (MCMC only).
- Hover for a crosshair + per-year values; a data-table view sits below the chart.
- **Everything is encoded in the URL**, so any view is shareable:

| URL | View |
|---|---|
| `?s=KY&s=TN` | Kentucky vs Tennessee, everyone else grey |
| `?s=CA&s=NC&s=TN&s=MI&s=WA` | the five states from the report's trends figure |
| `?s=New%20England:CT,MA,ME,NH,RI,VT&s=Deep%20South:AL,GA,LA,MS,SC` | two named groups with mean lines |
| `&m=additive` | additive index instead of MCMC |
| `&band=1` | ±1 SD band (MCMC only) |

## Deploying to GitHub Pages

The `site/` directory is self-contained. Two common setups:

**Option A — serve the repo's `/docs` folder**

1. Rename (or copy) `site/` to `docs/` at the repo root.
2. Push to GitHub.
3. Repo → Settings → Pages → "Deploy from a branch" → branch `main`, folder `/docs`.

**Option B — dedicated repo**

1. Make `site/` its own repo (its contents at the root).
2. Settings → Pages → deploy from branch `main`, folder `/ (root)`.

No Actions workflow needed either way.

## Updating the data

`data.js` is generated from `../SDI_2.0.csv`:

```sh
python3 build_data.py
```

Re-run it whenever the CSV changes, then commit the regenerated `data.js`.

## Files

| File | Purpose |
|---|---|
| `index.html` | page shell and controls |
| `style.css` | page chrome + theme_bw chart tokens |
| `app.js` | state model, URL codec, SVG chart renderer |
| `data.js` | generated data (do not edit by hand) |
| `build_data.py` | regenerates `data.js` from the CSV |
