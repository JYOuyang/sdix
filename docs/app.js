/* SDI 2.0 Explorer
 *
 * Model: a list of "series". A series is either a single state or a named
 * group of states. Each series owns a fixed palette slot for its lifetime,
 * so colors never repaint when other series are added or removed.
 *
 * URL scheme (shareable):
 *   ?s=KY&s=TN                      two individual states
 *   ?s=Upper%20South:KY,TN          a named group (members comma-separated)
 *   &m=additive                     measure (default: mcmc)
 *   &band=1                         ±1 SD band on individual states (MCMC only)
 *   &hide=1                         hide unselected states (no-op if none selected)
 *   &notes=1                        event annotations on highlighted lines
 */
(function () {
  "use strict";

  const DATA = window.SDI;
  const YEARS = DATA.years;
  const CODES = Object.keys(DATA.states).sort();
  const NOTES = window.SDI_ANNOTATIONS || {};

  // Validated categorical palette (light mode), fixed slot order. Deviates
  // from the reference theme: green is demoted past violet/red/magenta so
  // typical (≤5-series) charts never carry two green-family hues (aqua +
  // green), and orange sits dead last because the 7-color set is strictly
  // stronger with green (red↔orange is the weakest normal/tritan pair).
  // All-pairs CVD separation is order-invariant, so validation is unchanged;
  // the floor-band pairs (worst: orange↔green, protan ΔE 11.2) need the
  // end-of-line direct labels as relief, which every series already gets.
  const PALETTE = ["#2a78d6", "#1baf7a", "#eda100", "#4a3aa7", "#e34948", "#e87ba4", "#008300", "#eb6834"];
  const MAX_SERIES = PALETTE.length;

  // Everything drawn inside the SVG uses literal values, never CSS classes or
  // custom properties, so a serialized chart renders standalone (image export).
  const BG_LINE = "#d4d4d4";
  const BG_LINE_HOVER = "#8a8a8a";
  const CHART_FONT = "Arial, Helvetica, sans-serif";

  const METRICS = {
    mcmc: { key: "mcmc", label: "Democracy Index (MCMC)", hasSd: true },
    additive: { key: "additive", label: "Democracy Index (additive)", hasSd: false },
  };

  // ---------------------------------------------------------------- state

  const state = {
    metric: "mcmc",
    band: false,
    hideOthers: false,
    notes: false,
    series: [], // {id, type:'state'|'group', label, states:[codes], slot}
    activeGroup: null, // id of the group new chip clicks are routed to
  };
  let nextId = 1;
  let groupCounter = 0;

  function freeSlot() {
    const used = new Set(state.series.map((s) => s.slot));
    for (let i = 0; i < MAX_SERIES; i++) if (!used.has(i)) return i;
    return -1;
  }

  function seriesColor(s) { return PALETTE[s.slot]; }

  function seriesForState(code) {
    return state.series.find((s) => s.states.includes(code)) || null;
  }

  function removeStateEverywhere(code) {
    for (const s of state.series) {
      const i = s.states.indexOf(code);
      if (i >= 0) s.states.splice(i, 1);
    }
    state.series = state.series.filter((s) => s.states.length > 0);
    if (state.activeGroup && !state.series.some((s) => s.id === state.activeGroup)) {
      state.activeGroup = null;
    }
  }

  function addIndividual(code) {
    if (freeSlot() < 0) return flashHint("All " + MAX_SERIES + " colors are in use — remove a series or use groups.");
    state.series.push({ id: nextId++, type: "state", label: DATA.states[code].name, states: [code], slot: freeSlot() });
  }

  function newGroup() {
    if (freeSlot() < 0) return flashHint("All " + MAX_SERIES + " colors are in use — remove a series first.");
    groupCounter++;
    const g = { id: nextId++, type: "group", label: "Group " + groupCounter, states: [], slot: freeSlot() };
    state.series.push(g);
    state.activeGroup = g.id;
  }

  // A chip click routes to the active group if one is armed, else toggles an
  // individual series.
  function toggleState(code) {
    const target = state.series.find((s) => s.id === state.activeGroup);
    const owner = seriesForState(code);
    if (target) {
      if (owner === target) {
        removeStateEverywhere(code);
      } else {
        if (owner) removeStateEverywhere(code);
        const g = state.series.find((s) => s.id === state.activeGroup); // may have been dropped if emptied
        if (g) g.states.push(code);
        else { state.activeGroup = null; addIndividual(code); }
      }
    } else if (owner) {
      removeStateEverywhere(code);
    } else {
      addIndividual(code);
    }
    update();
  }

  // ------------------------------------------------------------- URL sync

  function readUrl() {
    const p = new URLSearchParams(location.search);
    const m = p.get("m");
    state.metric = m === "additive" ? "additive" : "mcmc";
    state.band = p.get("band") === "1";
    state.hideOthers = p.get("hide") === "1";
    state.notes = p.get("notes") === "1";
    state.series = [];
    for (const raw of p.getAll("s")) {
      if (state.series.length >= MAX_SERIES) break;
      const colon = raw.indexOf(":");
      const label = colon >= 0 ? cleanLabel(raw.slice(0, colon)) : "";
      const codes = (colon >= 0 ? raw.slice(colon + 1) : raw)
        .split(",").map((c) => c.trim().toUpperCase())
        .filter((c) => DATA.states[c] && !seriesForState(c));
      if (!codes.length) continue;
      const isGroup = colon >= 0 || codes.length > 1;
      if (isGroup) {
        groupCounter++;
        state.series.push({
          id: nextId++, type: "group",
          label: label || codes.join(" + "),
          states: codes, slot: freeSlot(),
        });
      } else {
        state.series.push({ id: nextId++, type: "state", label: DATA.states[codes[0]].name, states: codes, slot: freeSlot() });
      }
    }
  }

  function writeUrl() {
    const p = new URLSearchParams();
    for (const s of state.series) {
      p.append("s", s.type === "group" ? s.label + ":" + s.states.join(",") : s.states[0]);
    }
    if (state.metric !== "mcmc") p.set("m", state.metric);
    if (state.band) p.set("band", "1");
    if (state.hideOthers) p.set("hide", "1");
    if (state.notes) p.set("notes", "1");
    const qs = p.toString();
    try {
      history.replaceState(null, "", qs ? "?" + qs : location.pathname);
    } catch { /* file:// preview: some browsers block replaceState */ }
  }

  // ------------------------------------------------------------ utilities

  const $ = (sel) => document.querySelector(sel);
  const svgNS = "http://www.w3.org/2000/svg";

  function el(name, attrs, parent) {
    const node = document.createElementNS(svgNS, name);
    for (const k in attrs) node.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(node);
    return node;
  }

  function html(tag, cls, text) {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text != null) node.textContent = text;
    return node;
  }

  function metricValues(code) { return DATA.states[code][state.metric]; }

  // Annotation notes for a state-year; a value may be one string or an array.
  function notesFor(code, year) {
    const n = NOTES[code] && NOTES[code][year];
    return n == null ? [] : Array.isArray(n) ? n : [n];
  }

  function groupMean(codes) {
    return YEARS.map((_, i) => {
      let sum = 0, n = 0;
      for (const c of codes) {
        const v = metricValues(c)[i];
        if (v != null) { sum += v; n++; }
      }
      return n ? sum / n : null;
    });
  }

  function niceTicks(lo, hi) {
    const span = hi - lo;
    const steps = [0.1, 0.2, 0.25, 0.5, 1, 2, 5];
    let step = steps[steps.length - 1];
    for (const s of steps) if (span / s <= 8) { step = s; break; }
    const ticks = [];
    for (let t = Math.ceil(lo / step) * step; t <= hi + 1e-9; t += step) ticks.push(+t.toFixed(6));
    return { ticks, step };
  }

  function fmt(v) { return v == null ? "—" : v.toFixed(2); }

  function truncate(s, n) { return s.length > n ? s.slice(0, n - 1) + "…" : s; }

  // ':' and ',' are the URL codec's delimiters. Labels are cleaned at their
  // two entry points (group rename, URL parse) so a serialized view always
  // round-trips verbatim — writeUrl can embed labels as-is.
  function cleanLabel(s) {
    return s.replace(/[:,]/g, " ").replace(/\s+/g, " ").trim();
  }

  let hintTimer = null;
  function flashHint(msg) {
    const h = $("#series-hint");
    h.textContent = msg;
    h.classList.remove("flash");
    void h.offsetWidth; // restart the pulse when a flash is already showing
    h.classList.add("flash");
    clearTimeout(hintTimer);
    hintTimer = setTimeout(() => {
      hintTimer = null;
      h.classList.remove("flash");
      h.textContent = defaultHint();
    }, 4000);
  }

  function defaultHint() {
    if (state.activeGroup) return "Group armed: clicking a state adds it to the highlighted group. Click the group again — or press Esc — to disarm.";
    if (!state.series.length) return "Nothing highlighted — all states are shown in grey. Click a state below or a grey line in the chart.";
    return "";
  }

  // ------------------------------------------------------------ rendering

  const chartWrap = $("#chart-wrap");
  const svg = $("#chart");
  const tooltip = $("#tooltip");
  let hoveredBg = null; // state code under the pointer (background line)
  let layout = null;    // geometry of the last render, for hover math

  function update() {
    writeUrl();
    renderControls();
    renderLegend();
    renderChart();
    renderTable();
  }

  function renderControls() {
    // metric radios + band checkbox
    document.querySelectorAll('input[name="metric"]').forEach((r) => { r.checked = r.value === state.metric; });
    const band = $("#band");
    band.checked = state.band && METRICS[state.metric].hasSd;
    band.disabled = !METRICS[state.metric].hasSd;
    $("#hide-others").checked = state.hideOthers;
    $("#show-notes").checked = state.notes;

    // state chips; at the cap, unowned chips are muted but stay clickable so
    // the click still lands in toggleState and flashes the explanation
    const atCap = freeSlot() < 0 && !state.activeGroup;
    const grid = $("#state-grid");
    grid.textContent = "";
    for (const code of CODES) {
      const b = html("button", "state-chip", code);
      b.type = "button";
      b.title = DATA.states[code].name;
      const owner = seriesForState(code);
      b.setAttribute("aria-pressed", owner ? "true" : "false");
      if (owner) {
        b.classList.add("on");
        b.style.background = seriesColor(owner);
      } else if (atCap) {
        b.classList.add("capped");
        b.setAttribute("aria-disabled", "true");
        b.title = DATA.states[code].name + " — all " + MAX_SERIES + " colors are in use";
      }
      b.addEventListener("click", () => toggleState(code));
      // Hover symmetry: pointing at a chip emphasizes its grey line, the same
      // in-place restyle line hover uses; no-ops for highlighted/hidden states.
      b.addEventListener("mouseenter", () => styleBg(code, true));
      b.addEventListener("mouseleave", () => styleBg(code, false));
      grid.appendChild(b);
    }

    // series list
    const list = $("#series-list");
    list.textContent = "";
    for (const s of state.series) {
      const li = html("li", s.type === "group" ? "group" : "");
      if (s.id === state.activeGroup) li.classList.add("active-target");
      const sw = html("span", "swatch");
      sw.style.background = seriesColor(s);
      li.appendChild(sw);

      const labelWrap = html("span", "series-label");
      if (s.type === "group") {
        const input = document.createElement("input");
        input.value = s.label;
        input.setAttribute("aria-label", "Group name");
        input.addEventListener("change", () => {
          if (/[:,]/.test(input.value)) flashHint('":" and "," can\'t be used in group names — the share URL needs them — so they were removed.');
          s.label = cleanLabel(input.value) || s.label;
          update();
        });
        input.addEventListener("click", (e) => e.stopPropagation());
        labelWrap.appendChild(input);
      } else {
        labelWrap.textContent = s.label;
      }
      li.appendChild(labelWrap);

      const rm = html("button", "remove-btn", "×");
      rm.type = "button";
      rm.title = "Remove";
      rm.setAttribute("aria-label", "Remove " + s.label);
      rm.addEventListener("click", (e) => {
        e.stopPropagation();
        state.series = state.series.filter((x) => x !== s);
        if (state.activeGroup === s.id) state.activeGroup = null;
        update();
      });
      li.appendChild(rm);

      if (s.type === "group") {
        li.appendChild(html("span", "member-chips", s.states.length ? s.states.join(", ") : "empty — click states to add"));
        li.style.cursor = "pointer";
        li.title = "Click to arm/disarm this group for state clicks";
        li.addEventListener("click", () => {
          state.activeGroup = state.activeGroup === s.id ? null : s.id;
          update();
        });
      }
      list.appendChild(li);
    }
    if (hintTimer == null) $("#series-hint").textContent = defaultHint();
  }

  // "Hide unselected" only bites when there is a selection — a bare ?hide=1
  // link should not render an empty panel.
  function othersHidden() {
    return state.hideOthers && state.series.length > 0;
  }

  function renderLegend() {
    const legend = $("#legend");
    legend.textContent = "";
    for (const s of state.series) {
      const e = html("span", "entry");
      const key = html("span", "key");
      key.style.borderTopColor = seriesColor(s);
      e.appendChild(key);
      e.appendChild(html("span", "", s.type === "group" ? s.label + " (mean)" : s.label));
      legend.appendChild(e);
    }
    if (othersHidden()) return;
    const other = html("span", "entry other");
    const key = html("span", "key");
    key.style.borderTopColor = BG_LINE;
    other.appendChild(key);
    other.appendChild(html("span", "", state.series.length ? "Other states" : "All states"));
    legend.appendChild(other);
  }

  function renderChart() {
    const width = Math.max(chartWrap.clientWidth - 12, 320);
    const height = Math.max(Math.min(width * 0.56, 560), 340);
    layout = drawChart(svg, width, height, false);
  }

  // Draw the chart into `svg` — deliberately shadows the page element, since
  // the export path passes an offscreen SVG instead. Interactive mode wires
  // the hover hit paths and returns the geometry the pointer handlers use;
  // export mode adds an in-SVG title, legend, and caption so the serialized
  // image stands alone.
  function drawChart(svg, width, height, forExport) {
    svg.textContent = "";
    svg.setAttribute("width", width);
    svg.setAttribute("height", height);
    svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
    svg.setAttribute("font-family", CHART_FONT);

    // Right margin fits the longest end-of-line label (state code or group name).
    const endLabelText = (s) => (s.type === "group" ? truncate(s.label, 16) : s.states[0]);
    const maxLabelLen = Math.max(2, ...state.series.map((s) => endLabelText(s).length));
    const margin = { top: 12, right: Math.min(24 + maxLabelLen * 7.2, 150), bottom: 34, left: 58 };

    let header = null;
    if (forExport) {
      el("rect", { x: 0, y: 0, width, height, fill: "#ffffff" }, svg);
      header = layoutExportHeader(width - margin.left - margin.right);
      margin.top = header.height;
      margin.bottom += 20; // caption line under the x axis
    }
    const pw = width - margin.left - margin.right;
    const ph = height - margin.top - margin.bottom;

    // x breaks thin with the panel: a year label needs ~38px, so narrow
    // layouts step to every 4 (or 8) years instead of overlapping at 2.
    const xSpan = YEARS[YEARS.length - 1] - YEARS[0];
    const xStep = [2, 4, 8].find((s) => (Math.floor(xSpan / s) + 1) * 38 <= pw) || 8;

    // y domain: full extent over all states (background lines must fit),
    // plus the SD band when shown.
    let lo = Infinity, hi = -Infinity;
    const bandOn = state.band && METRICS[state.metric].hasSd;
    for (const code of CODES) {
      const vals = metricValues(code);
      const sds = DATA.states[code].sd;
      for (let i = 0; i < vals.length; i++) {
        if (vals[i] == null) continue;
        const pad = bandOn ? sds[i] : 0;
        if (vals[i] - pad < lo) lo = vals[i] - pad;
        if (vals[i] + pad > hi) hi = vals[i] + pad;
      }
    }
    const expand = (hi - lo) * 0.05; // ggplot default continuous expansion
    lo -= expand; hi += expand;

    const x = (year) => margin.left + ((year - YEARS[0]) / (YEARS[YEARS.length - 1] - YEARS[0])) * pw;
    const y = (v) => margin.top + (1 - (v - lo) / (hi - lo)) * ph;
    const geom = { margin, pw, ph, x, y, width, height };

    // --- theme_bw panel: white, grey92 grid (minor thinner), grey20 border
    el("rect", { x: margin.left, y: margin.top, width: pw, height: ph, fill: "#ffffff" }, svg);
    const grid = el("g", {}, svg);
    const { ticks: yTicks, step: yStep } = niceTicks(lo, hi);
    for (const t of yTicks) {
      el("line", { x1: margin.left, x2: margin.left + pw, y1: y(t), y2: y(t), stroke: "#ebebeb", "stroke-width": 1 }, grid);
      const tm = t + yStep / 2; // minor
      if (tm < hi) el("line", { x1: margin.left, x2: margin.left + pw, y1: y(tm), y2: y(tm), stroke: "#ebebeb", "stroke-width": 0.5 }, grid);
      const tm2 = t - yStep / 2;
      if (tm2 > lo && t === yTicks[0]) el("line", { x1: margin.left, x2: margin.left + pw, y1: y(tm2), y2: y(tm2), stroke: "#ebebeb", "stroke-width": 0.5 }, grid);
    }
    for (const yr of YEARS) {
      const major = yr % xStep === 0;
      el("line", { x1: x(yr), x2: x(yr), y1: margin.top, y2: margin.top + ph, stroke: "#ebebeb", "stroke-width": major ? 1 : 0.5 }, grid);
    }

    // --- federal event rules (reserved "US" key), behind the data
    if (state.notes) {
      for (const yr of YEARS) {
        if (!notesFor("US", yr).length) continue;
        el("line", {
          x1: x(yr), x2: x(yr), y1: margin.top, y2: margin.top + ph,
          stroke: "#9a9a9a", "stroke-width": 1, "stroke-dasharray": "4 3",
        }, svg);
      }
    }

    // --- background lines: every state not in a series (unless hidden)
    const highlighted = new Set(state.series.flatMap((s) => s.states));
    const bgGroup = el("g", {}, svg);
    const bgPaths = {};
    if (!othersHidden()) {
      for (const code of CODES) {
        if (highlighted.has(code)) continue;
        bgPaths[code] = el("path", {
          d: linePath(metricValues(code), x, y),
          fill: "none",
          stroke: BG_LINE,
          "stroke-width": 1.1,
        }, bgGroup);
      }
    }
    geom.bgPaths = bgPaths;

    // --- SD bands (individual highlighted states, MCMC only)
    if (bandOn) {
      for (const s of state.series) {
        if (s.type !== "state") continue;
        const code = s.states[0];
        const vals = metricValues(code), sds = DATA.states[code].sd;
        const up = vals.map((v, i) => (v == null ? null : v + sds[i]));
        const dn = vals.map((v, i) => (v == null ? null : v - sds[i]));
        el("path", { d: areaPath(up, dn, x, y), fill: seriesColor(s), "fill-opacity": 0.15, stroke: "none" }, svg);
      }
    }

    // --- highlighted series
    const endLabels = [];
    for (const s of state.series) {
      const color = seriesColor(s);
      if (s.type === "group") {
        for (const code of s.states) {
          el("path", { d: linePath(metricValues(code), x, y), fill: "none", stroke: color, "stroke-width": 1.4, "stroke-opacity": 0.55 }, svg);
        }
        if (s.states.length) {
          const mean = groupMean(s.states);
          el("path", { d: linePath(mean, x, y), fill: "none", stroke: color, "stroke-width": 3, "stroke-linejoin": "round" }, svg);
          endLabels.push({ y: y(lastVal(mean)), text: endLabelText(s), color });
        }
      } else {
        const vals = metricValues(s.states[0]);
        el("path", { d: linePath(vals, x, y), fill: "none", stroke: color, "stroke-width": 2.5, "stroke-linejoin": "round" }, svg);
        endLabels.push({ y: y(lastVal(vals)), text: s.states[0], color });
      }
    }

    // --- event annotation dots on highlighted lines (details in the tooltip)
    if (state.notes) {
      for (const s of state.series) {
        for (const code of s.states) {
          const vals = metricValues(code);
          for (let i = 0; i < YEARS.length; i++) {
            if (vals[i] == null || !notesFor(code, YEARS[i]).length) continue;
            el("circle", {
              cx: x(YEARS[i]).toFixed(1), cy: y(vals[i]).toFixed(1), r: 4,
              fill: seriesColor(s), stroke: "#ffffff", "stroke-width": 1.5,
            }, svg);
          }
        }
      }
    }

    // --- direct labels at the right edge, collision-resolved
    resolveLabels(endLabels, 15, margin.top + 6, margin.top + ph - 2);
    for (const L of endLabels) {
      el("text", {
        x: margin.left + pw + 7, y: L.y + 4,
        fill: L.color, "font-size": 12, "font-weight": 700,
      }, svg).textContent = L.text;
    }

    // --- panel border (on top of data, like ggplot)
    el("rect", { x: margin.left, y: margin.top, width: pw, height: ph, fill: "none", stroke: "#333333", "stroke-width": 1 }, svg);

    // --- axes: ticks + labels outside the panel, grey30 text
    for (const t of yTicks) {
      el("line", { x1: margin.left - 4, x2: margin.left, y1: y(t), y2: y(t), stroke: "#333333", "stroke-width": 1 }, svg);
      el("text", { x: margin.left - 8, y: y(t) + 3.5, "text-anchor": "end", fill: "#4d4d4d", "font-size": 11.5 }, svg)
        .textContent = String(+t.toFixed(2));
    }
    for (const yr of YEARS) {
      if (yr % xStep !== 0) continue;
      el("line", { x1: x(yr), x2: x(yr), y1: margin.top + ph, y2: margin.top + ph + 4, stroke: "#333333", "stroke-width": 1 }, svg);
      el("text", { x: x(yr), y: margin.top + ph + 17, "text-anchor": "middle", fill: "#4d4d4d", "font-size": 11.5 }, svg)
        .textContent = String(yr);
    }
    const yTitle = el("text", {
      transform: `translate(14 ${margin.top + ph / 2}) rotate(-90)`,
      "text-anchor": "middle", fill: "#0b0b0b", "font-size": 12.5,
    }, svg);
    yTitle.textContent = METRICS[state.metric].label;

    // --- hover layer: invisible fat hit paths for every painted state line
    if (!forExport) {
      const hits = el("g", {}, svg);
      for (const code of CODES) {
        if (othersHidden() && !highlighted.has(code)) continue;
        const p = el("path", {
          d: linePath(metricValues(code), x, y),
          class: "hit", fill: "none", stroke: "transparent", "stroke-width": 9,
        }, hits);
        p.addEventListener("mouseenter", () => { hoveredBg = code; styleBg(code, true); });
        p.addEventListener("mouseleave", () => { hoveredBg = null; styleBg(code, false); });
        p.addEventListener("click", () => toggleState(code));
      }
    }

    // --- export chrome: title, in-SVG legend, source caption
    if (forExport) {
      el("text", { x: margin.left, y: 24, fill: "#0b0b0b", "font-size": 15, "font-weight": 700 }, svg)
        .textContent = header.title;
      for (const it of header.entries) {
        el("line", {
          x1: margin.left + it.x, x2: margin.left + it.x + 22, y1: it.y - 4, y2: it.y - 4,
          stroke: it.color, "stroke-width": it.weight,
        }, svg);
        el("text", { x: margin.left + it.x + 28, y: it.y, fill: it.muted ? "#52514e" : "#0b0b0b", "font-size": 12 }, svg)
          .textContent = it.label;
      }
      // Caption URL mirrors wherever the page is served from, so nothing
      // goes stale on a future move; file:// previews drop the URL part.
      const site = /^https?:$/.test(location.protocol)
        ? location.host + location.pathname.replace(/\/index\.html$/, "").replace(/\/$/, "")
        : "";
      el("text", { x: margin.left, y: height - 8, fill: "#898781", "font-size": 10.5 }, svg)
        .textContent = (site ? site + " · " : "") + "State Democracy Index 2.0, Democracy Policy Lab";
    }

    return geom;
  }

  // Title + legend geometry for the exported image, mirroring the HTML
  // legend. Text width is estimated (an unmounted SVG can't be measured):
  // ~6.2px per character at font-size 12.
  function layoutExportHeader(availWidth) {
    const entries = state.series.map((s) => ({
      label: s.type === "group" ? s.label + " (mean)" : s.label,
      color: seriesColor(s), weight: 3,
    }));
    if (!othersHidden()) {
      entries.push({ label: state.series.length ? "Other states" : "All states", color: BG_LINE, weight: 1.5, muted: true });
    }
    const title = truncate(
      state.series.length ? state.series.map((s) => s.label).join(" vs ") : "The 50 US states",
      Math.max(20, Math.floor(availWidth / 8.5)),
    );
    let x = 0, y = 46; // title baseline sits at 24; first legend row at 46
    for (const it of entries) {
      const w = 28 + it.label.length * 6.2 + 20;
      if (x > 0 && x + w > availWidth) { x = 0; y += 19; }
      it.x = x; it.y = y;
      x += w;
    }
    return { title, entries, height: y + 14 };
  }

  // Emphasize/reset a background line in place — no chart rebuild on hover.
  function styleBg(code, on) {
    const p = layout && layout.bgPaths && layout.bgPaths[code];
    if (!p) return;
    p.setAttribute("stroke", on ? BG_LINE_HOVER : BG_LINE);
    p.setAttribute("stroke-width", on ? 1.8 : 1.1);
    if (on) p.parentNode.appendChild(p); // raise above siblings
  }

  function lastVal(vals) {
    for (let i = vals.length - 1; i >= 0; i--) if (vals[i] != null) return vals[i];
    return 0;
  }

  function linePath(vals, x, y) {
    let d = "", pen = false;
    for (let i = 0; i < vals.length; i++) {
      if (vals[i] == null) { pen = false; continue; }
      d += (pen ? "L" : "M") + x(YEARS[i]).toFixed(1) + " " + y(vals[i]).toFixed(1);
      pen = true;
    }
    return d;
  }

  function areaPath(upper, lower, x, y) {
    const up = [], dn = [];
    for (let i = 0; i < upper.length; i++) {
      if (upper[i] == null || lower[i] == null) continue;
      up.push(x(YEARS[i]).toFixed(1) + " " + y(upper[i]).toFixed(1));
      dn.push(x(YEARS[i]).toFixed(1) + " " + y(lower[i]).toFixed(1));
    }
    if (!up.length) return "";
    return "M" + up.join("L") + "L" + dn.reverse().join("L") + "Z";
  }

  // Push labels apart vertically so none overlap, clamped to the panel.
  function resolveLabels(items, minGap, top, bottom) {
    items.sort((a, b) => a.y - b.y);
    for (let i = 0; i < items.length; i++) {
      if (i > 0 && items[i].y - items[i - 1].y < minGap) items[i].y = items[i - 1].y + minGap;
    }
    for (let i = items.length - 1; i >= 0; i--) {
      const limit = i === items.length - 1 ? bottom : items[i + 1].y - minGap;
      if (items[i].y > limit) items[i].y = limit;
      if (items[i].y < top) items[i].y = top;
    }
  }

  // --------------------------------------------------------------- hover

  svg.addEventListener("mousemove", (ev) => {
    if (!layout) return;
    const rect = svg.getBoundingClientRect();
    const px = ev.clientX - rect.left;
    const py = ev.clientY - rect.top;
    const { margin, pw, ph, x } = layout;
    if (px < margin.left || px > margin.left + pw || py < margin.top || py > margin.top + ph) {
      hideTooltip(); return;
    }
    const frac = (px - margin.left) / pw;
    const year = YEARS[Math.round(frac * (YEARS.length - 1))];
    const yi = YEARS.indexOf(year);

    // crosshair
    let cross = svg.querySelector(".crosshair");
    if (!cross) {
      cross = el("line", {
        class: "crosshair",
        stroke: "rgba(11,11,11,0.35)", "stroke-width": 1, "stroke-dasharray": "3 3",
      }, svg);
    }
    cross.setAttribute("x1", x(year)); cross.setAttribute("x2", x(year));
    cross.setAttribute("y1", margin.top); cross.setAttribute("y2", margin.top + ph);

    // tooltip rows: highlighted series (+ hovered background state)
    const rows = [];
    for (const s of state.series) {
      const v = s.type === "group" ? groupMean(s.states)[yi] : metricValues(s.states[0])[yi];
      rows.push({ label: s.type === "group" ? s.label + " (mean)" : s.label, color: seriesColor(s), v });
    }
    if (hoveredBg && !seriesForState(hoveredBg)) {
      // "click to add" holds at the cap only while a group is armed (adding a
      // member needs no free slot) — same condition as the chip muting.
      const atCap = freeSlot() < 0 && !state.activeGroup;
      const invite = atCap ? " — all " + MAX_SERIES + " colors in use" : " — click to add";
      rows.push({ label: DATA.states[hoveredBg].name + invite, color: "#8a8a8a", v: metricValues(hoveredBg)[yi] });
    }
    const fedNotes = state.notes ? notesFor("US", year) : [];
    if (!rows.length && !fedNotes.length) { hideTooltip(); return; }
    rows.sort((a, b) => (b.v ?? -Infinity) - (a.v ?? -Infinity));

    tooltip.textContent = "";
    tooltip.appendChild(html("div", "tt-year", String(year)));
    for (const r of rows) {
      const row = html("div", "tt-row");
      const sw = html("span", "swatch");
      sw.style.background = r.color;
      row.appendChild(sw);
      row.appendChild(html("span", "", r.label));
      row.appendChild(html("span", "tt-val", fmt(r.v)));
      tooltip.appendChild(row);
    }
    for (const note of fedNotes) {
      const row = html("div", "tt-note");
      row.appendChild(html("span", "rule"));
      row.appendChild(html("span", "", note));
      tooltip.appendChild(row);
    }
    if (state.notes) {
      for (const s of state.series) {
        for (const code of s.states) {
          for (const note of notesFor(code, year)) {
            const row = html("div", "tt-note");
            const dot = html("span", "dot");
            dot.style.background = seriesColor(s);
            row.appendChild(dot);
            row.appendChild(html("span", "", code + " — " + note));
            tooltip.appendChild(row);
          }
        }
      }
    }
    tooltip.hidden = false;
    const wrapRect = chartWrap.getBoundingClientRect();
    let tx = ev.clientX - wrapRect.left + 14;
    const ty = ev.clientY - wrapRect.top + 14;
    if (tx + tooltip.offsetWidth > wrapRect.width - 8) tx = ev.clientX - wrapRect.left - tooltip.offsetWidth - 14;
    tooltip.style.left = tx + "px";
    tooltip.style.top = ty + "px";
  });

  svg.addEventListener("mouseleave", hideTooltip);

  function hideTooltip() {
    tooltip.hidden = true;
    const cross = svg.querySelector(".crosshair");
    if (cross) cross.remove();
  }

  // --------------------------------------------------------------- table

  // One column per series; a group contributes its mean plus each member.
  // Shared by the HTML table and the CSV download so they always agree.
  function tableColumns() {
    const cols = [];
    for (const s of state.series) {
      if (s.type === "group") {
        cols.push({ label: s.label + " (mean)", vals: groupMean(s.states) });
        for (const c of s.states) cols.push({ label: c, vals: metricValues(c) });
      } else {
        cols.push({ label: s.label, vals: metricValues(s.states[0]) });
      }
    }
    return cols;
  }

  function renderTable() {
    $("#download-csv").disabled = !state.series.length;
    const wrap = $("#table-wrap");
    wrap.textContent = "";
    if (!state.series.length) {
      wrap.appendChild(html("p", "hint", "Highlight one or more states to see their values here."));
      return;
    }
    const table = document.createElement("table");
    const head = table.createTHead().insertRow();
    head.appendChild(html("th", "", "Year"));
    const cols = tableColumns();
    for (const c of cols) head.appendChild(html("th", "", c.label));
    const body = table.createTBody();
    YEARS.forEach((yr, i) => {
      const tr = body.insertRow();
      tr.appendChild(html("td", "", String(yr)));
      for (const c of cols) tr.appendChild(html("td", "", fmt(c.vals[i])));
    });
    wrap.appendChild(table);
  }

  // ---------------------------------------------------------- CSV download

  function csvEscape(v) {
    return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
  }

  // Full source precision (4 dp in data.js), not the table's 2-dp display;
  // +toFixed re-rounds group means to match and strips trailing zeros.
  function buildCsv() {
    const cols = tableColumns();
    const lines = [["Year", ...cols.map((c) => c.label)].map(csvEscape).join(",")];
    YEARS.forEach((yr, i) => {
      lines.push([yr, ...cols.map((c) => (c.vals[i] == null ? "" : +c.vals[i].toFixed(4)))].join(","));
    });
    return lines.join("\n") + "\n";
  }

  // Shared with the PNG download so both exports name files the same way.
  function exportFilename(ext) {
    const parts = state.series.map((s) =>
      s.type === "group" ? s.label.replace(/[^A-Za-z0-9]+/g, "-").replace(/^-+|-+$/g, "") : s.states[0]);
    const name = ["sdi", state.metric, ...parts].filter(Boolean).join("-");
    return name.slice(0, 64).replace(/-+$/, "") + "." + ext;
  }

  $("#download-csv").addEventListener("click", (e) => {
    // Inside <summary>: don't let the click also toggle the table open/shut.
    e.preventDefault();
    e.stopPropagation();
    if (!state.series.length) return;
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([buildCsv()], { type: "text/csv" }));
    a.download = exportFilename("csv");
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 30000);
    const btn = $("#download-csv");
    btn.textContent = "Downloaded ✓";
    btn.classList.add("copied");
    setTimeout(() => { btn.textContent = "Download CSV"; btn.classList.remove("copied"); }, 1600);
  });

  // --------------------------------------------------------------- wiring

  document.querySelectorAll('input[name="metric"]').forEach((r) => {
    r.addEventListener("change", () => {
      state.metric = r.value;
      if (!METRICS[state.metric].hasSd) state.band = false;
      update();
    });
  });
  $("#band").addEventListener("change", (e) => { state.band = e.target.checked; update(); });
  $("#hide-others").addEventListener("change", (e) => { state.hideOthers = e.target.checked; update(); });
  $("#show-notes").addEventListener("change", (e) => { state.notes = e.target.checked; update(); });
  $("#new-group").addEventListener("click", () => { newGroup(); update(); });
  $("#clear-all").addEventListener("click", () => {
    state.series = []; state.activeGroup = null; update();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && state.activeGroup) { state.activeGroup = null; update(); }
  });
  // --------------------------------------------------------- image export

  const EXPORT_W = 1200, EXPORT_H = 675, EXPORT_SCALE = 2;

  // Canonical-size offscreen render → serialized SVG → <img> → canvas → PNG.
  // Independent of viewport and hover state by construction.
  function exportPngBlob() {
    const off = document.createElementNS(svgNS, "svg");
    drawChart(off, EXPORT_W, EXPORT_H, true);
    const xml = new XMLSerializer().serializeToString(off);
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = EXPORT_W * EXPORT_SCALE;
        canvas.height = EXPORT_H * EXPORT_SCALE;
        const ctx = canvas.getContext("2d");
        ctx.scale(EXPORT_SCALE, EXPORT_SCALE);
        ctx.drawImage(img, 0, 0);
        canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob failed"))), "image/png");
      };
      img.onerror = () => reject(new Error("could not rasterize chart SVG"));
      img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(xml);
    });
  }
  // Hook for the build-time og:image script (headless Chrome; see TODO).
  window.SDI_EXPORT_PNG = exportPngBlob;

  $("#copy-image").addEventListener("click", async () => {
    const btn = $("#copy-image");
    // Safari requires the ClipboardItem to be constructed synchronously in
    // the click handler, so hand it the blob as a promise.
    const blob = exportPngBlob();
    let outcome = "Copied ✓";
    try {
      if (!navigator.clipboard || !window.ClipboardItem) throw new Error("no clipboard");
      await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
    } catch {
      try {
        const a = document.createElement("a");
        a.href = URL.createObjectURL(await blob);
        a.download = exportFilename("png");
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 30000);
        outcome = "Downloaded ✓";
      } catch {
        outcome = "Export failed";
      }
    }
    btn.textContent = outcome;
    btn.classList.toggle("copied", outcome !== "Export failed");
    setTimeout(() => { btn.textContent = "Copy image"; btn.classList.remove("copied"); }, 1600);
  });

  $("#download-png").addEventListener("click", async () => {
    const btn = $("#download-png");
    let outcome = "Downloaded ✓";
    try {
      const a = document.createElement("a");
      a.href = URL.createObjectURL(await exportPngBlob());
      a.download = exportFilename("png");
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 30000);
    } catch {
      outcome = "Export failed";
    }
    btn.textContent = outcome;
    btn.classList.toggle("copied", outcome !== "Export failed");
    setTimeout(() => { btn.textContent = "Download PNG"; btn.classList.remove("copied"); }, 1600);
  });

  $("#copy-link").addEventListener("click", async () => {
    const btn = $("#copy-link");
    try {
      await navigator.clipboard.writeText(location.href);
      btn.textContent = "Copied ✓"; btn.classList.add("copied");
    } catch {
      prompt("Copy this link:", location.href);
    }
    setTimeout(() => { btn.textContent = "Copy link"; btn.classList.remove("copied"); }, 1600);
  });

  let resizeTimer = null;
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(renderChart, 120);
  });
  window.addEventListener("popstate", () => { readUrl(); update(); });

  // ----------------------------------------------------------------- go

  readUrl();
  update();
})();
