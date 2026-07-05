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
 */
(function () {
  "use strict";

  const DATA = window.SDI;
  const YEARS = DATA.years;
  const CODES = Object.keys(DATA.states).sort();

  // Validated categorical palette (light mode), fixed slot order.
  const PALETTE = ["#2a78d6", "#1baf7a", "#eda100", "#008300", "#4a3aa7", "#e34948", "#e87ba4", "#eb6834"];
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
    state.series = [];
    for (const raw of p.getAll("s")) {
      if (state.series.length >= MAX_SERIES) break;
      const colon = raw.indexOf(":");
      const label = colon >= 0 ? raw.slice(0, colon).trim() : "";
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
      // ':' and ',' are the URL codec's delimiters — swap them out of labels.
      const safeLabel = s.label.replace(/[:,]/g, " ").replace(/\s+/g, " ").trim();
      p.append("s", s.type === "group" ? safeLabel + ":" + s.states.join(",") : s.states[0]);
    }
    if (state.metric !== "mcmc") p.set("m", state.metric);
    if (state.band) p.set("band", "1");
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

  let hintTimer = null;
  function flashHint(msg) {
    const h = $("#series-hint");
    h.textContent = msg;
    clearTimeout(hintTimer);
    hintTimer = setTimeout(() => { h.textContent = defaultHint(); }, 4000);
  }

  function defaultHint() {
    if (state.activeGroup) return "Group armed: clicking a state adds it to the highlighted group. Click the group again to disarm.";
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

    // state chips
    const grid = $("#state-grid");
    grid.textContent = "";
    for (const code of CODES) {
      const b = html("button", "state-chip", code);
      b.type = "button";
      b.title = DATA.states[code].name;
      const owner = seriesForState(code);
      if (owner) {
        b.classList.add("on");
        b.style.background = seriesColor(owner);
      }
      b.addEventListener("click", () => toggleState(code));
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
        input.addEventListener("change", () => { s.label = input.value.trim() || s.label; update(); });
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
    $("#series-hint").textContent = defaultHint();
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
    const other = html("span", "entry other");
    const key = html("span", "key");
    key.style.borderTopColor = BG_LINE;
    other.appendChild(key);
    other.appendChild(html("span", "", state.series.length ? "Other states" : "All states"));
    legend.appendChild(other);
  }

  function renderChart() {
    svg.textContent = "";
    const width = Math.max(chartWrap.clientWidth - 12, 320);
    const height = Math.max(Math.min(width * 0.56, 560), 340);
    svg.setAttribute("width", width);
    svg.setAttribute("height", height);
    svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
    svg.setAttribute("font-family", CHART_FONT);

    // Right margin fits the longest end-of-line label (state code or group name).
    const endLabelText = (s) => (s.type === "group" ? truncate(s.label, 16) : s.states[0]);
    const maxLabelLen = Math.max(2, ...state.series.map((s) => endLabelText(s).length));
    const margin = { top: 12, right: Math.min(24 + maxLabelLen * 7.2, 150), bottom: 34, left: 58 };
    const pw = width - margin.left - margin.right;
    const ph = height - margin.top - margin.bottom;

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
    layout = { margin, pw, ph, x, y, width, height };

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
      const major = yr % 2 === 0;
      el("line", { x1: x(yr), x2: x(yr), y1: margin.top, y2: margin.top + ph, stroke: "#ebebeb", "stroke-width": major ? 1 : 0.5 }, grid);
    }

    // --- background lines: every state not in a series
    const highlighted = new Set(state.series.flatMap((s) => s.states));
    const bgGroup = el("g", {}, svg);
    const bgPaths = {};
    for (const code of CODES) {
      if (highlighted.has(code)) continue;
      bgPaths[code] = el("path", {
        d: linePath(metricValues(code), x, y),
        fill: "none",
        stroke: BG_LINE,
        "stroke-width": 1.1,
      }, bgGroup);
    }
    layout.bgPaths = bgPaths;

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
      if (yr % 2 !== 0) continue;
      el("line", { x1: x(yr), x2: x(yr), y1: margin.top + ph, y2: margin.top + ph + 4, stroke: "#333333", "stroke-width": 1 }, svg);
      el("text", { x: x(yr), y: margin.top + ph + 17, "text-anchor": "middle", fill: "#4d4d4d", "font-size": 11.5 }, svg)
        .textContent = String(yr);
    }
    const yTitle = el("text", {
      transform: `translate(14 ${margin.top + ph / 2}) rotate(-90)`,
      "text-anchor": "middle", fill: "#0b0b0b", "font-size": 12.5,
    }, svg);
    yTitle.textContent = METRICS[state.metric].label;

    // --- hover layer: invisible fat hit paths for every state line
    const hits = el("g", {}, svg);
    for (const code of CODES) {
      const p = el("path", {
        d: linePath(metricValues(code), x, y),
        class: "hit", fill: "none", stroke: "transparent", "stroke-width": 9,
      }, hits);
      p.addEventListener("mouseenter", () => { hoveredBg = code; styleBg(code, true); });
      p.addEventListener("mouseleave", () => { hoveredBg = null; styleBg(code, false); });
      p.addEventListener("click", () => toggleState(code));
    }
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
      rows.push({ label: DATA.states[hoveredBg].name + " — click to add", color: "#8a8a8a", v: metricValues(hoveredBg)[yi] });
    }
    if (!rows.length) { hideTooltip(); return; }
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

  function renderTable() {
    const wrap = $("#table-wrap");
    wrap.textContent = "";
    if (!state.series.length) {
      wrap.appendChild(html("p", "hint", "Highlight one or more states to see their values here."));
      return;
    }
    const table = document.createElement("table");
    const head = table.createTHead().insertRow();
    head.appendChild(html("th", "", "Year"));
    const cols = [];
    for (const s of state.series) {
      if (s.type === "group") {
        cols.push({ label: s.label + " (mean)", vals: groupMean(s.states) });
        for (const c of s.states) cols.push({ label: c, vals: metricValues(c) });
      } else {
        cols.push({ label: s.label, vals: metricValues(s.states[0]) });
      }
    }
    for (const c of cols) head.appendChild(html("th", "", c.label));
    const body = table.createTBody();
    YEARS.forEach((yr, i) => {
      const tr = body.insertRow();
      tr.appendChild(html("td", "", String(yr)));
      for (const c of cols) tr.appendChild(html("td", "", fmt(c.vals[i])));
    });
    wrap.appendChild(table);
  }

  // --------------------------------------------------------------- wiring

  document.querySelectorAll('input[name="metric"]').forEach((r) => {
    r.addEventListener("change", () => {
      state.metric = r.value;
      if (!METRICS[state.metric].hasSd) state.band = false;
      update();
    });
  });
  $("#band").addEventListener("change", (e) => { state.band = e.target.checked; update(); });
  $("#new-group").addEventListener("click", () => { newGroup(); update(); });
  $("#clear-all").addEventListener("click", () => {
    state.series = []; state.activeGroup = null; update();
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
