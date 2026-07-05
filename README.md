# SDI 2.0 Explorer

**Live at <https://jyouyang.github.io/sdix/>** — try
[Kentucky vs Tennessee](https://jyouyang.github.io/sdix/?s=KY&s=TN).

A static, client-side-only explorer for the **State Democracy Index (SDI 2.0)**
panel (50 states × 2000–2023). No build step, no server, no dependencies —
plain HTML/CSS/JS with the data baked into `docs/data.js`.

The data and accompanying papers come from the
[Democracy Policy Lab](https://democracypolicylab.berkeley.edu/state-democracy-index/)
at UC Berkeley; see in particular the
[SDI 2.0 report](https://democracypolicylab.berkeley.edu/wp-content/uploads/2024/12/SDI-2.0-Report.pdf) (PDF),
whose figures this explorer's charts follow.

## Repo layout

| Path | Purpose |
|---|---|
| `docs/` | the deployable website, self-contained (served by GitHub Pages) |
| `SDI_2.0.csv` | state-level index scores (source of `docs/data.js`) |
| `SDI_2.0_item_data.csv` | item-level source data |
| `variables_list.csv` | variable descriptions |
| `build_data.py` | regenerates `docs/data.js` from `SDI_2.0.csv` |

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
| `&hide=1` | hide unselected states entirely (no-op without a selection) |

## Local preview

```sh
python3 -m http.server -d docs
# open http://localhost:8000/?s=KY&s=TN
```

## Updating the data

`docs/data.js` is generated — never edit it by hand:

```sh
python3 build_data.py
```

Re-run it whenever `SDI_2.0.csv` changes, then commit the regenerated file.

## Deploying to GitHub Pages

The website lives in `docs/` so the native branch deploy serves it directly:

1. Repo → Settings → Pages → Source: **Deploy from a branch**.
2. Branch `main`, folder `/docs`.

Every push to `main` then publishes `docs/` as-is.
