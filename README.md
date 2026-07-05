# SDI 2.0 Explorer

A static, client-side-only explorer for the **State Democracy Index (SDI 2.0)**
panel (50 states × 2000–2023). No build step, no server, no dependencies —
plain HTML/CSS/JS with the data baked into `site/data.js`.

## Repo layout

| Path | Purpose |
|---|---|
| `site/` | the deployable website, self-contained |
| `SDI_2.0.csv` | state-level index scores (source of `site/data.js`) |
| `SDI_2.0_item_data.csv` | item-level source data |
| `variables_list.csv` | variable descriptions |
| `build_data.py` | regenerates `site/data.js` from `SDI_2.0.csv` |

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

## Local preview

```sh
python3 -m http.server -d site
# open http://localhost:8000/?s=KY&s=TN
```

## Updating the data

`site/data.js` is generated — never edit it by hand:

```sh
python3 build_data.py
```

Re-run it whenever `SDI_2.0.csv` changes, then commit the regenerated file.

## Deploying to GitHub Pages

GitHub's "deploy from a branch" mode only serves `/ (root)` or `/docs`, so to
keep the site in `site/`, deploy with the official Pages actions instead:

1. Repo → Settings → Pages → Source: **GitHub Actions**.
2. Add a workflow (`.github/workflows/pages.yml`) that uploads `site/` as the
   Pages artifact via `actions/upload-pages-artifact` + `actions/deploy-pages`.

Every push to `main` then publishes `site/` as-is.
