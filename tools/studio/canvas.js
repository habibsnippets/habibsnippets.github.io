/* ============================================================
   Diagram canvas for the writing studio.

   A deliberately small, dependency-free drawing surface in the
   spirit of Excalidraw: basic geometry, text, selection, resize,
   styling, undo, pan/zoom, and a screenshot-style export that
   saves a PNG into the post's asset folder.

   The scene is kept in localStorage per post slug. The PNG is
   the artifact that goes into the article; the editable scene
   stays in the browser so you can come back and change it.
   ============================================================ */

const MIN_ZOOM = 0.2;
const MAX_ZOOM = 4;
const GRID = 24;
const HANDLE = 8;
const TEXT_WIDTH = 260;
const STORE_PREFIX = "writing-studio:canvas:";

const STROKE_COLORS = [
  "#1e1e1e", "#5c5f66", "#e03131", "#2f9e44", "#1971c2",
  "#f08c00", "#6741d9", "#0c8599", "#c2255c",
];
const FILL_COLORS = [
  "#ffc9c9", "#b2f2bb", "#a5d8ff", "#ffec99",
  "#d0bfff", "#ffd8a8", "#ced4da", "#f8f9fa",
];

const FONTS = {
  sans: '"Satoshi", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  mono: '"JetBrains Mono", ui-monospace, "SF Mono", Menlo, monospace',
  serif: 'Georgia, "Times New Roman", serif',
  hand: '"Virgil", "Comic Sans MS", "Segoe Print", cursive',
};

const TOOL_KEYS = {
  v: "select", h: "hand",
  r: "rect", d: "diamond", o: "ellipse",
  l: "line", a: "arrow", p: "pen", t: "text",
};

const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
const uid = () => `el-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
const isNum = (n) => typeof n === "number" && Number.isFinite(n);

/* Deterministic pseudo-random. Each element carries a seed, so a
   sketchy shape does not shimmer every time it is redrawn. */
function mulberry32(seed) {
  let a = seed >>> 0;
  return function random() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const measureCanvas = document.createElement("canvas");
const measureCtx = measureCanvas.getContext("2d");

const fontFor = (el) => FONTS[el.fontFamily] || FONTS.sans;
const fontSpec = (el) => `${el.fontSize}px ${fontFor(el)}`;
const lineHeight = (el) => el.fontSize * 1.25;

function wrapText(text, width, el) {
  measureCtx.font = fontSpec(el);
  const max = Math.max(16, width);
  const out = [];
  const paragraphs = String(text ?? "").split("\n");

  for (const paragraph of paragraphs) {
    if (!paragraph) { out.push(""); continue; }
    const words = paragraph.split(/\s+/).filter(Boolean);
    let line = "";
    for (const word of words) {
      const next = line ? `${line} ${word}` : word;
      if (!line || measureCtx.measureText(next).width <= max) {
        line = next;
      } else {
        out.push(line);
        line = word;
      }
      /* A single long token (URL, identifier) still has to wrap. */
      while (line && measureCtx.measureText(line).width > max) {
        let cut = line.length - 1;
        while (cut > 1 && measureCtx.measureText(line.slice(0, cut)).width > max) cut--;
        out.push(line.slice(0, cut));
        line = line.slice(cut);
      }
    }
    out.push(line);
  }
  return out.length ? out : [""];
}

function textMetrics(el) {
  const lines = wrapText(el.text || "", el.w, el);
  return { lines, height: Math.max(1, lines.length) * lineHeight(el) };
}

function refreshTextHeight(el) {
  el.h = textMetrics(el).height;
}

/* --- geometry ---------------------------------------------- */

function boundsOf(el) {
  if (el.type === "line" || el.type === "arrow" || el.type === "pen") {
    const pts = el.points || [];
    if (!pts.length) return { x: el.x, y: el.y, w: el.w, h: el.h };
    const xs = pts.map((p) => el.x + p.x);
    const ys = pts.map((p) => el.y + p.y);
    const x = Math.min(...xs);
    const y = Math.min(...ys);
    return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
  }
  return { x: el.x, y: el.y, w: el.w, h: el.h };
}

function absPoints(el) {
  return (el.points || []).map((p) => ({ x: el.x + p.x, y: el.y + p.y }));
}

/* Normalise a point list into x/y + relative points, preserving order
   so an arrow always keeps pointing at its last point. */
function setLinePoints(el, points) {
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  el.x = x;
  el.y = y;
  el.points = points.map((p) => ({ x: p.x - x, y: p.y - y }));
  el.w = Math.max(...xs) - x;
  el.h = Math.max(...ys) - y;
}

function unionBounds(els) {
  const bs = els.map(boundsOf);
  const x = Math.min(...bs.map((b) => b.x));
  const y = Math.min(...bs.map((b) => b.y));
  const r = Math.max(...bs.map((b) => b.x + b.w));
  const b = Math.max(...bs.map((b) => b.y + b.h));
  return { x, y, w: r - x, h: b - y };
}

function rectsOverlap(a, b) {
  return a.x <= b.x + b.w && a.x + a.w >= b.x && a.y <= b.y + b.h && a.y + a.h >= b.y;
}

function distanceToSegment(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len2 = dx * dx + dy * dy;
  if (!len2) return Math.hypot(px - x1, py - y1);
  const t = clamp(((px - x1) * dx + (py - y1) * dy) / len2, 0, 1);
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

function distanceToPolyline(px, py, pts) {
  let d = Infinity;
  for (let i = 1; i < pts.length; i++) {
    d = Math.min(d, distanceToSegment(px, py, pts[i - 1].x, pts[i - 1].y, pts[i].x, pts[i].y));
  }
  return d;
}

function snapLine(start, end, enabled) {
  if (!enabled) return end;
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const angle = Math.atan2(dy, dx);
  const step = Math.PI / 4;
  const snapped = Math.round(angle / step) * step;
  const len = Math.hypot(dx, dy);
  return { x: start.x + Math.cos(snapped) * len, y: start.y + Math.sin(snapped) * len };
}

function hitTest(el, x, y, tol) {
  const b = boundsOf(el);
  if (el.type === "line" || el.type === "arrow" || el.type === "pen") {
    const pts = absPoints(el);
    if (pts.length === 1) {
      return Math.hypot(x - pts[0].x, y - pts[0].y) <= tol + el.strokeWidth / 2;
    }
    return distanceToPolyline(x, y, pts) <= tol + el.strokeWidth / 2;
  }
  if (x < b.x - tol || x > b.x + b.w + tol || y < b.y - tol || y > b.y + b.h + tol) return false;
  if (el.type === "ellipse") {
    const nx = (x - (b.x + b.w / 2)) / (b.w / 2 + tol);
    const ny = (y - (b.y + b.h / 2)) / (b.h / 2 + tol);
    return nx * nx + ny * ny <= 1;
  }
  if (el.type === "diamond") {
    const nx = Math.abs(x - (b.x + b.w / 2)) / (b.w / 2 + tol);
    const ny = Math.abs(y - (b.y + b.h / 2)) / (b.h / 2 + tol);
    return nx + ny <= 1;
  }
  return true;
}

function handlesFor(el) {
  const b = boundsOf(el);
  const cx = b.x + b.w / 2;
  const cy = b.y + b.h / 2;
  if (el.type === "line" || el.type === "arrow") {
    const pts = absPoints(el);
    return [
      { name: "p0", x: pts[0].x, y: pts[0].y },
      { name: "p1", x: pts[pts.length - 1].x, y: pts[pts.length - 1].y },
    ];
  }
  if (el.type === "text") {
    return [{ name: "w", x: b.x, y: cy }, { name: "e", x: b.x + b.w, y: cy }];
  }
  return [
    { name: "nw", x: b.x, y: b.y },
    { name: "n", x: cx, y: b.y },
    { name: "ne", x: b.x + b.w, y: b.y },
    { name: "e", x: b.x + b.w, y: cy },
    { name: "se", x: b.x + b.w, y: b.y + b.h },
    { name: "s", x: cx, y: b.y + b.h },
    { name: "sw", x: b.x, y: b.y + b.h },
    { name: "w", x: b.x, y: cy },
  ];
}

/* --- element factories ------------------------------------- */

function blankElement(type, x, y, w = 0, h = 0, style = {}) {
  const el = {
    id: uid(),
    type,
    x, y, w, h,
    stroke: style.stroke,
    fill: style.fill,
    fillStyle: style.fillStyle,
    strokeWidth: style.strokeWidth,
    strokeStyle: style.strokeStyle,
    opacity: style.opacity,
    roughness: style.roughness,
    seed: (Math.random() * 2147483647) | 0,
    fontSize: style.fontSize,
    fontFamily: style.fontFamily,
    textAlign: style.textAlign,
  };
  if (type === "text") {
    el.w = TEXT_WIDTH;
    el.text = "";
    refreshTextHeight(el);
  }
  if (type === "line" || type === "arrow") {
    el.points = [{ x: 0, y: 0 }, { x: 0, y: 0 }];
  }
  if (type === "pen") {
    el.points = [{ x: 0, y: 0 }];
  }
  return el;
}

/* --- mount ------------------------------------------------- */

export function mountCanvas(opts = {}) {
  const root = opts.root;
  if (!root) throw new Error("mountCanvas needs a root element");

  const $ = (id) => root.querySelector(`#${id}`);
  const canvas = $("drawCanvas");
  const stage = $("drawStage");
  const ctx = canvas.getContext("2d");

  const el = {
    empty: $("drawEmpty"),
    hint: $("drawHint"),
    textEditor: $("drawTextEditor"),
    undo: $("drawUndo"),
    redo: $("drawRedo"),
    export: $("drawExport"),
    strokeSwatches: $("strokeSwatches"),
    fillSwatches: $("fillSwatches"),
    strokeCustom: $("strokeCustom"),
    fillCustom: $("fillCustom"),
    fillStyles: $("fillStyles"),
    strokeWidths: $("strokeWidths"),
    strokeStyles: $("strokeStyles"),
    roughness: $("roughness"),
    opacity: $("opacity"),
    opacityValue: $("opacityValue"),
    fontFamily: $("fontFamily"),
    fontSize: $("fontSize"),
    textAlign: $("textAlign"),
    count: $("drawCount"),
    status: $("drawStatus"),
    zoomLabel: $("drawZoomLabel"),
    zoomOut: $("drawZoomOut"),
    zoomIn: $("drawZoomIn"),
    zoomFit: $("drawFit"),
    exportPanel: $("exportPanel"),
    exportThumb: $("exportThumb"),
    exportTitle: $("exportTitle"),
    exportSnippet: $("exportSnippet"),
    exportSave: $("exportSave"),
    exportCopy: $("exportCopy"),
    exportDownload: $("exportDownload"),
    exportInsert: $("exportInsert"),
    exportRetake: $("exportRetake"),
    exportCancel: $("exportCancel"),
  };

  const state = {
    elements: [],
    selected: new Set(),
    tool: "select",
    style: {
      stroke: "#1e1e1e",
      fill: "#a5d8ff",
      fillStyle: "none",
      strokeWidth: 2,
      strokeStyle: "solid",
      opacity: 1,
      roughness: 1,
      fontSize: 20,
      fontFamily: "sans",
      textAlign: "left",
    },
    view: { x: 0, y: 0, zoom: 1 },
    isOpen: false,
    slug: null,
    key: null,
    action: null,
    draft: null,
    marquee: null,
    exportMode: false,
    exportRect: null,
    exportMarkdown: "",
    editingId: null,
    editingNew: false,
    clipboard: [],
    space: false,
    lastPointer: null,
    history: [],
    historyIndex: -1,
    saveTimer: null,
    dpr: 1,
  };

  const keyFor = (slug) => `${STORE_PREFIX}${slug || "scratch"}`;
  const selected = () => state.elements.filter((e) => state.selected.has(e.id));
  const firstSelected = () => selected()[0] || null;

  function notify(message) {
    if (typeof opts.notify === "function") opts.notify(message);
  }

  function setStatus(text, tone = "saved") {
    el.status.textContent = text;
    el.status.dataset.state = tone;
  }

  /* --- persistence ----------------------------------------- */

  function writeScene() {
    if (!state.key) return;
    try {
      const data = JSON.stringify({
        elements: state.elements,
        view: state.view,
        style: state.style,
      });
      localStorage.setItem(state.key, data);
      setStatus("saved locally", "saved");
    } catch {
      setStatus("not saved", "error");
    }
  }

  function scheduleSave() {
    setStatus("saving…", "dirty");
    clearTimeout(state.saveTimer);
    state.saveTimer = setTimeout(writeScene, 450);
  }

  function flushScene() {
    clearTimeout(state.saveTimer);
    writeScene();
  }

  function loadScene() {
    let data = null;
    try {
      const raw = localStorage.getItem(state.key);
      if (raw) data = JSON.parse(raw);
    } catch {
      data = null;
    }

    state.elements = Array.isArray(data?.elements) ? data.elements : [];
    const v = data?.view;
    state.view = v && isNum(v.x) && isNum(v.y) && isNum(v.zoom)
      ? { x: v.x, y: v.y, zoom: clamp(v.zoom, MIN_ZOOM, MAX_ZOOM) }
      : { x: 0, y: 0, zoom: 1 };
    if (data?.style) state.style = { ...state.style, ...data.style };

    state.selected.clear();
    state.action = null;
    state.draft = null;
    state.marquee = null;
    state.exportMode = false;
    state.exportRect = null;
    state.exportMarkdown = "";
    el.exportPanel.hidden = true;
    closeTextEditor();
    resetHistory();
    syncStyleUI();
    updateUI();
    setStatus(data ? "saved locally" : "new drawing", data ? "saved" : "dirty");
    render();
  }

  function setSlug(slug, { migrate = false, reset = false } = {}) {
    const next = slug || null;
    const nextKey = keyFor(next);
    if (nextKey === state.key && !reset) return;

    const oldKey = state.key;
    if (oldKey) flushScene();

    if (reset) {
      try { localStorage.removeItem(nextKey); } catch {}
      state.elements = [];
      state.selected.clear();
      state.view = { x: 0, y: 0, zoom: 1 };
      state.action = null;
      state.draft = null;
      state.marquee = null;
      state.exportMode = false;
      state.exportRect = null;
      state.exportMarkdown = "";
      el.exportPanel.hidden = true;
      closeTextEditor();
      state.slug = next;
      state.key = nextKey;
      resetHistory();
      syncStyleUI();
      updateUI();
      setStatus("new drawing", "dirty");
      render();
      scheduleSave();
      return;
    }

    /* First save of a brand-new post: move the scratch scene to the
       real slug. Keep the in-memory state (and any open export panel)
       because the scene itself did not change. */
    if (migrate && !state.slug && next) {
      try {
        const data = localStorage.getItem(oldKey);
        if (data && !localStorage.getItem(nextKey)) {
          localStorage.setItem(nextKey, data);
          localStorage.removeItem(oldKey);
        }
      } catch {}
      state.slug = next;
      state.key = nextKey;
      scheduleSave();
      return;
    }

    state.slug = next;
    state.key = nextKey;
    loadScene();
    if (state.isOpen) requestAnimationFrame(resize);
  }

  function resetHistory() {
    state.history = [JSON.stringify(state.elements)];
    state.historyIndex = 0;
    updateUndoRedo();
  }

  function commitHistory() {
    const snap = JSON.stringify(state.elements);
    if (snap === state.history[state.historyIndex]) return;
    state.history = state.history.slice(0, state.historyIndex + 1);
    state.history.push(snap);
    if (state.history.length > 100) state.history.shift();
    state.historyIndex = state.history.length - 1;
    updateUndoRedo();
    scheduleSave();
  }

  function restoreSnapshot(index) {
    if (index < 0 || index >= state.history.length) return;
    state.historyIndex = index;
    state.elements = JSON.parse(state.history[index]);
    state.selected.clear();
    state.action = null;
    state.draft = null;
    state.marquee = null;
    closeTextEditor();
    syncStyleUI();
    updateUI();
    render();
    scheduleSave();
  }

  function undo() {
    if (state.historyIndex <= 0) return;
    restoreSnapshot(state.historyIndex - 1);
  }

  function redo() {
    if (state.historyIndex >= state.history.length - 1) return;
    restoreSnapshot(state.historyIndex + 1);
  }

  /* --- sizing and coordinates ------------------------------ */

  function stageSize() {
    const r = stage.getBoundingClientRect();
    return { w: Math.max(1, r.width), h: Math.max(1, r.height) };
  }

  function resize() {
    const r = stage.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return;
    const dpr = clamp(window.devicePixelRatio || 1, 1, 2.5);
    const pw = Math.max(1, Math.round(r.width * dpr));
    const ph = Math.max(1, Math.round(r.height * dpr));
    if (canvas.width !== pw || canvas.height !== ph) {
      canvas.width = pw;
      canvas.height = ph;
    }
    state.dpr = dpr;
    render();
  }

  const sx = (wx) => (wx - state.view.x) * state.view.zoom;
  const sy = (wy) => (wy - state.view.y) * state.view.zoom;
  const wx = (px) => px / state.view.zoom + state.view.x;
  const wy = (py) => py / state.view.zoom + state.view.y;

  function pointerPos(event) {
    const r = canvas.getBoundingClientRect();
    const px = event.clientX - r.left;
    const py = event.clientY - r.top;
    return { px, py, x: wx(px), y: wy(py) };
  }

  /* --- drawing primitives ---------------------------------- */

  function traceBox(g, item) {
    const { x, y, w, h } = item;
    g.beginPath();
    if (item.type === "rect") {
      const r = Math.min(6, Math.abs(w) / 2, Math.abs(h) / 2);
      g.moveTo(x + r, y);
      g.lineTo(x + w - r, y);
      g.quadraticCurveTo(x + w, y, x + w, y + r);
      g.lineTo(x + w, y + h - r);
      g.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
      g.lineTo(x + r, y + h);
      g.quadraticCurveTo(x, y + h, x, y + h - r);
      g.lineTo(x, y + r);
      g.quadraticCurveTo(x, y, x + r, y);
      g.closePath();
    } else if (item.type === "diamond") {
      g.moveTo(x + w / 2, y);
      g.lineTo(x + w, y + h / 2);
      g.lineTo(x + w / 2, y + h);
      g.lineTo(x, y + h / 2);
      g.closePath();
    } else {
      g.ellipse(
        x + w / 2, y + h / 2,
        Math.max(0.01, w / 2), Math.max(0.01, h / 2),
        0, 0, Math.PI * 2
      );
    }
  }

  function applyStroke(g, item) {
    g.strokeStyle = item.stroke;
    g.lineWidth = Math.max(0.5, item.strokeWidth);
    g.lineJoin = "round";
    g.lineCap = "round";
    const sw = Math.max(1, item.strokeWidth);
    if (item.strokeStyle === "dashed") g.setLineDash([sw * 4 + 4, sw * 3 + 3]);
    else if (item.strokeStyle === "dotted") g.setLineDash([0.5, sw * 2.4 + 3]);
    else g.setLineDash([]);
  }

  function fillBox(g, item) {
    if (!item.fill || item.fillStyle === "none") return;
    if (item.fillStyle === "solid") {
      g.fillStyle = item.fill;
      traceBox(g, item);
      g.fill();
      return;
    }
    /* Hachure: diagonal lines clipped to the shape. */
    const b = boundsOf(item);
    g.save();
    traceBox(g, item);
    g.clip();
    g.strokeStyle = item.fill;
    g.lineWidth = 1;
    g.setLineDash([]);
    g.globalAlpha *= 0.6;
    for (let i = -b.h; i < b.w + b.h; i += 7) {
      g.beginPath();
      g.moveTo(b.x + i, b.y);
      g.lineTo(b.x + i - b.h, b.y + b.h);
      g.stroke();
    }
    g.restore();
  }

  function outlinePoints(item) {
    const { x, y, w, h } = item;
    if (item.type === "rect") {
      return [
        { x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h },
      ];
    }
    if (item.type === "diamond") {
      return [
        { x: x + w / 2, y }, { x: x + w, y: y + h / 2 },
        { x: x + w / 2, y: y + h }, { x, y: y + h / 2 },
      ];
    }
    const pts = [];
    const cx = x + w / 2;
    const cy = y + h / 2;
    const count = 40;
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2;
      pts.push({ x: cx + Math.cos(a) * (w / 2), y: cy + Math.sin(a) * (h / 2) });
    }
    return pts;
  }

  function roughStroke(g, item, pts, closed) {
    const rand = mulberry32((item.seed || 1) >>> 0);
    const amp = item.roughness > 1 ? 1.9 : 1.2;
    const passes = item.roughness > 1 ? 3 : 2;
    const list = closed ? [...pts, pts[0]] : pts;
    g.save();
    applyStroke(g, item);
    for (let pass = 0; pass < passes; pass++) {
      g.beginPath();
      for (let i = 0; i < list.length - 1; i++) {
        const a = list[i];
        const b = list[i + 1];
        const ax = a.x + (rand() - 0.5) * amp;
        const ay = a.y + (rand() - 0.5) * amp;
        const bx = b.x + (rand() - 0.5) * amp;
        const by = b.y + (rand() - 0.5) * amp;
        const mx = (ax + bx) / 2 + (rand() - 0.5) * amp * 2;
        const my = (ay + by) / 2 + (rand() - 0.5) * amp * 2;
        if (i === 0) g.moveTo(ax, ay);
        g.quadraticCurveTo(mx, my, bx, by);
      }
      g.stroke();
    }
    g.restore();
  }

  function drawBox(g, item) {
    if (item.w <= 0 || item.h <= 0) return;
    fillBox(g, item);
    if (item.roughness > 0) {
      roughStroke(g, item, outlinePoints(item), true);
    } else {
      applyStroke(g, item);
      traceBox(g, item);
      g.stroke();
    }
  }

  function drawArrowHead(g, item, pts) {
    const tip = pts[pts.length - 1];
    const prev = pts[pts.length - 2];
    const angle = Math.atan2(prev.y - tip.y, prev.x - tip.x);
    const len = 8 + item.strokeWidth * 2.2;
    const spread = 0.42;
    g.beginPath();
    g.moveTo(tip.x, tip.y);
    g.lineTo(tip.x + Math.cos(angle - spread) * len, tip.y + Math.sin(angle - spread) * len);
    g.moveTo(tip.x, tip.y);
    g.lineTo(tip.x + Math.cos(angle + spread) * len, tip.y + Math.sin(angle + spread) * len);
    g.stroke();
  }

  function drawPen(g, item) {
    const pts = absPoints(item);
    if (!pts.length) return;
    applyStroke(g, item);

    /* A click with the pen is a dot, not an invisible zero-length path. */
    if (pts.length === 1) {
      g.fillStyle = item.stroke;
      g.beginPath();
      g.arc(pts[0].x, pts[0].y, Math.max(1, item.strokeWidth / 2), 0, Math.PI * 2);
      g.fill();
      return;
    }

    g.beginPath();
    g.moveTo(pts[0].x, pts[0].y);
    if (pts.length === 2) {
      g.lineTo(pts[1].x, pts[1].y);
    } else {
      /* Quadratic smoothing through the midpoint of each segment —
         keeps the stroke soft without needing the full point list. */
      for (let i = 1; i < pts.length - 1; i++) {
        const mx = (pts[i].x + pts[i + 1].x) / 2;
        const my = (pts[i].y + pts[i + 1].y) / 2;
        g.quadraticCurveTo(pts[i].x, pts[i].y, mx, my);
      }
      const last = pts[pts.length - 1];
      g.lineTo(last.x, last.y);
    }
    g.stroke();
  }

  function drawLinear(g, item) {
    const pts = absPoints(item);
    if (pts.length < 2) return;
    if (item.roughness > 0) {
      roughStroke(g, item, pts, false);
    } else {
      applyStroke(g, item);
      g.beginPath();
      g.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) g.lineTo(pts[i].x, pts[i].y);
      g.stroke();
    }
    if (item.type === "arrow") {
      applyStroke(g, item);
      drawArrowHead(g, item, pts);
    }
  }

  function drawText(g, item) {
    if (!item.text) return;
    const { lines } = textMetrics(item);
    g.font = fontSpec(item);
    g.fillStyle = item.stroke;
    g.textBaseline = "top";
    g.textAlign = item.textAlign === "center" ? "center" : item.textAlign === "right" ? "right" : "left";
    const x = item.x + (item.textAlign === "center" ? item.w / 2 : item.textAlign === "right" ? item.w : 0);
    const lh = lineHeight(item);
    for (let i = 0; i < lines.length; i++) {
      g.fillText(lines[i], x, item.y + i * lh);
    }
  }

  function drawElement(g, item) {
    g.save();
    g.globalAlpha = clamp(item.opacity ?? 1, 0, 1);
    if (item.type === "text") drawText(g, item);
    else if (item.type === "pen") drawPen(g, item);
    else if (item.type === "line" || item.type === "arrow") drawLinear(g, item);
    else drawBox(g, item);
    g.restore();
  }

  function drawGrid(w, h) {
    const z = state.view.zoom;
    let step = GRID * z;
    while (step < 11) step *= 2;
    const startX = ((-state.view.x * z) % step + step) % step;
    const startY = ((-state.view.y * z) % step + step) % step;
    ctx.fillStyle = "rgba(72, 58, 34, 0.14)";
    for (let x = startX; x < w; x += step) {
      for (let y = startY; y < h; y += step) ctx.fillRect(x, y, 1, 1);
    }
  }

  function drawHandle(px, py) {
    const half = HANDLE / 2;
    ctx.fillStyle = "#fffdf7";
    ctx.strokeStyle = "#0b62c4";
    ctx.lineWidth = 1.4;
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.rect(px - half, py - half, HANDLE, HANDLE);
    ctx.fill();
    ctx.stroke();
  }

  function drawSelection() {
    if (state.exportMode || state.editingId) return;
    const items = selected();
    if (!items.length) return;

    const z = state.view.zoom;
    ctx.save();
    ctx.strokeStyle = "#0b62c4";
    ctx.lineWidth = 1.2;
    ctx.setLineDash([4, 4]);

    if (items.length === 1) {
      const b = boundsOf(items[0]);
      ctx.strokeRect(sx(b.x) - 2, sy(b.y) - 2, b.w * z + 4, b.h * z + 4);
      ctx.setLineDash([]);
      for (const h of handlesFor(items[0])) drawHandle(sx(h.x), sy(h.y));
    } else {
      const b = unionBounds(items);
      ctx.strokeRect(sx(b.x) - 2, sy(b.y) - 2, b.w * z + 4, b.h * z + 4);
    }
    ctx.restore();
  }

  function drawMarquee() {
    if (state.action?.kind !== "marquee") return;
    const a = state.action.start;
    const b = state.action.current;
    const x = sx(Math.min(a.x, b.x));
    const y = sy(Math.min(a.y, b.y));
    const w = Math.abs(b.x - a.x) * state.view.zoom;
    const h = Math.abs(b.y - a.y) * state.view.zoom;
    ctx.save();
    ctx.fillStyle = "rgba(11, 98, 196, 0.07)";
    ctx.strokeStyle = "#0b62c4";
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 3]);
    ctx.fillRect(x, y, w, h);
    ctx.strokeRect(x, y, w, h);
    ctx.restore();
  }

  function drawExportOverlay() {
    if (!state.exportMode || !state.exportRect) return;
    const r = state.exportRect;
    const x = sx(r.x);
    const y = sy(r.y);
    const w = r.w * state.view.zoom;
    const h = r.h * state.view.zoom;
    const cw = canvas.width / state.dpr;
    const ch = canvas.height / state.dpr;

    ctx.save();
    ctx.fillStyle = "rgba(34, 29, 21, 0.11)";
    ctx.fillRect(0, 0, cw, y);
    ctx.fillRect(0, y + h, cw, ch - (y + h));
    ctx.fillRect(0, y, x, h);
    ctx.fillRect(x + w, y, cw - (x + w), h);
    ctx.strokeStyle = "#0b62c4";
    ctx.lineWidth = 1.5;
    ctx.setLineDash([6, 4]);
    ctx.strokeRect(x, y, w, h);
    ctx.restore();
  }

  function render() {
    const dpr = state.dpr || 1;
    const w = canvas.width / dpr;
    const h = canvas.height / dpr;
    if (!w || !h) return;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    drawGrid(w, h);

    const z = state.view.zoom;
    ctx.save();
    ctx.translate(-state.view.x * z, -state.view.y * z);
    ctx.scale(z, z);
    for (const item of state.elements) {
      if (item.id === state.editingId) continue;
      drawElement(ctx, item);
    }
    if (state.draft) drawElement(ctx, state.draft);
    ctx.restore();

    drawSelection();
    drawMarquee();
    drawExportOverlay();
  }

  /* --- chrome ---------------------------------------------- */

  function updateUndoRedo() {
    el.undo.disabled = state.historyIndex <= 0;
    el.redo.disabled = state.historyIndex >= state.history.length - 1;
  }

  function updateCount() {
    const n = state.elements.length;
    el.count.textContent = `${n} element${n === 1 ? "" : "s"}`;
    el.empty.hidden = n > 0 || !!state.editingId || state.exportMode || !!state.draft;
  }

  function updateZoomLabel() {
    el.zoomLabel.textContent = `${Math.round(state.view.zoom * 100)}%`;
  }

  function updateHint() {
    let text = "Drag to draw · Space to pan · ⌘/Ctrl + scroll to zoom";
    if (state.exportMode) {
      text = state.exportRect
        ? "Save to post, or copy/download the PNG · Esc to cancel"
        : "Drag a box around the diagram · Esc to cancel";
    } else if (state.tool === "text") {
      text = "Click to place text · Esc to finish";
    } else if (state.tool === "pen") {
      text = "Drag to draw freehand · V to select · Esc to finish";
    } else if (state.tool === "hand") {
      text = "Drag to pan · scroll to move";
    } else if (state.selected.size) {
      text = "Drag to move · handles resize · double-click text to edit";
    }
    el.hint.textContent = text;
  }

  function updateUI() {
    updateUndoRedo();
    updateCount();
    updateZoomLabel();
    updateHint();
    el.export.disabled = state.elements.length === 0;
    el.export.setAttribute("aria-pressed", String(state.exportMode));
  }

  function syncToolUI() {
    root.querySelectorAll("[data-tool]").forEach((b) => {
      b.classList.toggle("is-active", b.dataset.tool === state.tool);
    });
    stage.classList.toggle("is-select", state.tool === "select");
    stage.classList.toggle("is-text", state.tool === "text");
  }

  function cursorForHandle(name) {
    return {
      nw: "nwse-resize", se: "nwse-resize",
      ne: "nesw-resize", sw: "nesw-resize",
      n: "ns-resize", s: "ns-resize",
      e: "ew-resize", w: "ew-resize",
      p0: "crosshair", p1: "crosshair",
    }[name] || "default";
  }

  function handleAt(px, py) {
    const items = selected();
    if (items.length !== 1) return null;
    for (const h of handlesFor(items[0])) {
      if (Math.abs(px - sx(h.x)) <= HANDLE / 2 + 3 && Math.abs(py - sy(h.y)) <= HANDLE / 2 + 3) {
        return h.name;
      }
    }
    return null;
  }

  function hitElementAt(x, y) {
    const tol = 6 / state.view.zoom;
    for (let i = state.elements.length - 1; i >= 0; i--) {
      if (hitTest(state.elements[i], x, y, tol)) return state.elements[i];
    }
    return null;
  }

  function updateCursor() {
    if (state.action?.kind === "pan") {
      stage.style.cursor = "grabbing";
      return;
    }
    if (state.space || state.tool === "hand") {
      stage.style.cursor = "grab";
      return;
    }
    if (state.exportMode) {
      stage.style.cursor = "crosshair";
      return;
    }
    if (state.tool === "text") {
      stage.style.cursor = "text";
      return;
    }
    if (state.tool !== "select") {
      stage.style.cursor = "crosshair";
      return;
    }
    const p = state.lastPointer;
    if (p) {
      const h = handleAt(p.px, p.py);
      if (h) { stage.style.cursor = cursorForHandle(h); return; }
      if (hitElementAt(p.x, p.y)) { stage.style.cursor = "move"; return; }
    }
    stage.style.cursor = "default";
  }

  function setTool(tool) {
    if (!["select", "hand", "rect", "diamond", "ellipse", "line", "arrow", "pen", "text"].includes(tool)) return;
    if (state.editingId) commitText();
    state.tool = tool;
    if (tool !== "select" && tool !== "hand") {
      state.selected.clear();
      syncStyleUI();
    }
    syncToolUI();
    updateHint();
    updateCursor();
    render();
  }

  function selectOnly(item) {
    state.selected = new Set([item.id]);
    syncStyleUI();
    updateHint();
  }

  /* --- drawing --------------------------------------------- */

  function updateDraft(p, event) {
    const a = state.action;
    if (!a || !state.draft) return;
    const item = state.draft;
    const start = a.start;

    if (item.type === "pen") {
      const last = item.points[item.points.length - 1];
      const step = 1.5 / state.view.zoom;
      if (!last || Math.hypot(p.x - start.x - last.x, p.y - start.y - last.y) >= step) {
        item.points.push({ x: p.x - start.x, y: p.y - start.y });
      }
      render();
      return;
    }

    if (item.type === "line" || item.type === "arrow") {
      const end = event.shiftKey ? snapLine(start, { x: p.x, y: p.y }, true) : { x: p.x, y: p.y };
      setLinePoints(item, [{ x: start.x, y: start.y }, end]);
    } else {
      let x1 = start.x;
      let y1 = start.y;
      let x2 = p.x;
      let y2 = p.y;
      if (event.shiftKey) {
        const size = Math.max(Math.abs(x2 - x1), Math.abs(y2 - y1));
        x2 = x1 + (x2 < x1 ? -size : size);
        y2 = y1 + (y2 < y1 ? -size : size);
      }
      if (event.altKey) {
        const dx = x2 - x1;
        const dy = y2 - y1;
        x1 = start.x - dx;
        y1 = start.y - dy;
      }
      item.x = Math.min(x1, x2);
      item.y = Math.min(y1, y2);
      item.w = Math.abs(x2 - x1);
      item.h = Math.abs(y2 - y1);
    }
    render();
  }

  function finishDraw() {
    const item = state.draft;
    state.draft = null;
    if (!item) return;

    if (item.type === "pen") {
      setLinePoints(item, absPoints(item));
    } else if (item.type === "line" || item.type === "arrow") {
      if (item.w < 2 && item.h < 2) {
        setLinePoints(item, [{ x: item.x, y: item.y }, { x: item.x + 180, y: item.y }]);
      }
    } else {
      if (item.w < 4) item.w = 160;
      if (item.h < 4) item.h = 100;
    }

    state.elements.push(item);

    /* Freehand drawing stays active so several strokes can be drawn in a
       row. Unlike shapes, the new stroke is not selected automatically. */
    if (item.type === "pen") {
      state.selected.clear();
    } else {
      state.selected = new Set([item.id]);
      state.tool = "select";
      syncToolUI();
    }

    commitHistory();
    syncStyleUI();
    updateUI();
    render();
    scheduleSave();
  }

  /* --- moving / resizing ----------------------------------- */

  function beginMove(start) {
    state.action = {
      kind: "move",
      start,
      items: selected().map((item) => ({ id: item.id, x: item.x, y: item.y })),
      moved: false,
    };
    stage.style.cursor = "move";
  }

  function updateMove(p, shift) {
    const a = state.action;
    let dx = p.x - a.start.x;
    let dy = p.y - a.start.y;
    if (shift) {
      if (Math.abs(dx) >= Math.abs(dy)) dy = 0;
      else dx = 0;
    }
    for (const original of a.items) {
      const item = state.elements.find((e) => e.id === original.id);
      if (!item) continue;
      item.x = original.x + dx;
      item.y = original.y + dy;
    }
    if (Math.abs(dx) + Math.abs(dy) > 0.5) a.moved = true;
    render();
  }

  function beginResize(item, handle) {
    state.action = {
      kind: "resize",
      item,
      handle,
      start: { x: item.x, y: item.y, w: item.w, h: item.h },
      points: item.points ? item.points.map((p) => ({ ...p })) : null,
      moved: false,
    };
    stage.style.cursor = cursorForHandle(handle);
  }

  function updateResize(p, event) {
    const a = state.action;
    const item = a.item;
    const b = a.start;
    const shift = event.shiftKey;

    if (item.type === "line" || item.type === "arrow") {
      const abs = a.points.map((pt) => ({ x: b.x + pt.x, y: b.y + pt.y }));
      if (a.handle === "p0") {
        const fixed = abs[abs.length - 1];
        const moving = shift ? snapLine(fixed, p, true) : { x: p.x, y: p.y };
        setLinePoints(item, [moving, ...abs.slice(1)]);
      } else {
        const fixed = abs[0];
        const moving = shift ? snapLine(fixed, p, true) : { x: p.x, y: p.y };
        setLinePoints(item, [...abs.slice(0, -1), moving]);
      }
      a.moved = true;
      render();
      return;
    }

    if (item.type === "text") {
      let left = b.x;
      let right = b.x + b.w;
      if (a.handle === "w") left = Math.min(p.x, right - 60);
      else right = Math.max(p.x, left + 60);
      item.x = left;
      item.w = right - left;
      refreshTextHeight(item);
      a.moved = true;
      render();
      return;
    }

    let left = b.x;
    let right = b.x + b.w;
    let top = b.y;
    let bottom = b.y + b.h;
    if (a.handle.includes("w")) left = p.x;
    if (a.handle.includes("e")) right = p.x;
    if (a.handle.includes("n")) top = p.y;
    if (a.handle.includes("s")) bottom = p.y;

    const MIN = 6;
    if (right - left < MIN) {
      if (a.handle.includes("w")) left = right - MIN;
      else right = left + MIN;
    }
    if (bottom - top < MIN) {
      if (a.handle.includes("n")) top = bottom - MIN;
      else bottom = top + MIN;
    }

    if (shift && a.handle.length === 2) {
      const ratio = b.w / Math.max(1, b.h);
      const w = right - left;
      const h = bottom - top;
      if (w / Math.max(1, h) > ratio) {
        const nh = w / ratio;
        if (a.handle.includes("n")) top = bottom - nh;
        else bottom = top + nh;
      } else {
        const nw = h * ratio;
        if (a.handle.includes("w")) left = right - nw;
        else right = left + nw;
      }
    }

    if (item.type === "pen") {
      const nextW = Math.max(1, right - left);
      const nextH = Math.max(1, bottom - top);
      const scaleX = b.w > 0 ? nextW / b.w : 1;
      const scaleY = b.h > 0 ? nextH / b.h : 1;
      item.points = a.points.map((pt) => ({ x: pt.x * scaleX, y: pt.y * scaleY }));
    }

    item.x = left;
    item.y = top;
    item.w = Math.max(1, right - left);
    item.h = Math.max(1, bottom - top);
    a.moved = true;
    render();
  }

  /* --- marquee --------------------------------------------- */

  function finishMarquee(a) {
    const r = {
      x: Math.min(a.start.x, a.current.x),
      y: Math.min(a.start.y, a.current.y),
      w: Math.abs(a.current.x - a.start.x),
      h: Math.abs(a.current.y - a.start.y),
    };
    if (r.w < 2 && r.h < 2) {
      render();
      return;
    }
    const hits = state.elements.filter((item) => rectsOverlap(r, boundsOf(item)));
    state.selected = new Set([...a.base, ...hits.map((item) => item.id)]);
    syncStyleUI();
    updateHint();
    render();
  }

  /* --- in-place text --------------------------------------- */

  function positionTextEditor(item) {
    const z = state.view.zoom;
    const ta = el.textEditor;
    ta.style.left = `${sx(item.x) - 2}px`;
    ta.style.top = `${sy(item.y) - 2}px`;
    ta.style.width = `${Math.max(60, item.w * z)}px`;
    ta.style.font = `${item.fontSize * z}px ${fontFor(item)}`;
    ta.style.lineHeight = "1.25";
    ta.style.color = item.stroke;
    ta.style.textAlign = item.textAlign || "left";
    autoGrowText();
  }

  function autoGrowText() {
    const ta = el.textEditor;
    if (ta.hidden) return;
    const item = state.elements.find((e) => e.id === state.editingId);
    const min = item ? Math.max(20, item.fontSize * state.view.zoom * 1.25) : 20;
    ta.style.height = "auto";
    ta.style.height = `${Math.max(min, ta.scrollHeight)}px`;
  }

  function startTextEdit(item, isNew) {
    if (state.editingId) commitText();
    state.editingId = item.id;
    state.editingNew = !!isNew;
    state.selected = new Set([item.id]);
    state.tool = "select";
    syncToolUI();
    syncStyleUI();

    const ta = el.textEditor;
    ta.value = item.text || "";
    ta.hidden = false;
    positionTextEditor(item);
    updateUI();
    render();
    ta.focus({ preventScroll: true });
    if (!isNew) ta.select();
  }

  function closeTextEditor() {
    state.editingId = null;
    state.editingNew = false;
    if (el.textEditor) {
      el.textEditor.hidden = true;
      el.textEditor.value = "";
    }
  }

  function commitText() {
    if (!state.editingId) return;
    const item = state.elements.find((e) => e.id === state.editingId);
    const ta = el.textEditor;
    const value = ta.value.replace(/\r/g, "");
    const wasNew = state.editingNew;

    state.editingId = null;
    state.editingNew = false;
    ta.hidden = true;

    if (!item) {
      updateUI();
      render();
      return;
    }

    if (!value.trim()) {
      state.elements = state.elements.filter((e) => e !== item);
      state.selected.delete(item.id);
      if (!wasNew) commitHistory();
      syncStyleUI();
      updateUI();
      render();
      scheduleSave();
      return;
    }

    item.text = value;
    refreshTextHeight(item);
    commitHistory();
    syncStyleUI();
    updateUI();
    render();
    scheduleSave();
  }

  /* Text height depends on the font that actually loaded. The hand
     font arrives after first paint, so re-measure once it is ready. */
  function recomputeTextHeights() {
    let changed = false;
    for (const item of state.elements) {
      if (item.type !== "text") continue;
      const before = item.h;
      refreshTextHeight(item);
      if (Math.abs(item.h - before) > 0.01) changed = true;
    }
    if (state.editingId) {
      const item = state.elements.find((e) => e.id === state.editingId);
      if (item) positionTextEditor(item);
    }
    if (changed) scheduleSave();
    if (state.isOpen) render();
  }

  /* --- selection helpers ----------------------------------- */

  function deleteSelected() {
    if (!state.selected.size) return;
    state.elements = state.elements.filter((item) => !state.selected.has(item.id));
    state.selected.clear();
    commitHistory();
    syncStyleUI();
    updateUI();
    render();
  }

  function copySelected() {
    const items = selected();
    if (!items.length) return;
    state.clipboard = JSON.parse(JSON.stringify(items));
    notify(`Copied ${items.length} element${items.length === 1 ? "" : "s"}`);
  }

  function pasteClipboard() {
    if (!state.clipboard.length) return;
    const source = JSON.parse(JSON.stringify(state.clipboard));
    const b = unionBounds(source);
    const target = state.lastPointer;
    const dx = target ? target.x - b.x : 24;
    const dy = target ? target.y - b.y : 24;
    const copies = source.map((item) => ({
      ...item,
      id: uid(),
      seed: (Math.random() * 2147483647) | 0,
      x: item.x + dx,
      y: item.y + dy,
    }));
    state.elements.push(...copies);
    state.selected = new Set(copies.map((item) => item.id));
    commitHistory();
    syncStyleUI();
    updateUI();
    render();
  }

  function duplicateSelected() {
    const items = selected();
    if (!items.length) return;
    const copies = JSON.parse(JSON.stringify(items)).map((item) => ({
      ...item,
      id: uid(),
      seed: (Math.random() * 2147483647) | 0,
      x: item.x + 22,
      y: item.y + 22,
    }));
    state.elements.push(...copies);
    state.selected = new Set(copies.map((item) => item.id));
    commitHistory();
    syncStyleUI();
    updateUI();
    render();
  }

  /* --- export ---------------------------------------------- */

  function renderCrop(rect, scale = 2) {
    const area = Math.max(1, rect.w * rect.h);
    let s = scale;
    if (area * s * s > 12_000_000) s = Math.sqrt(12_000_000 / area);
    s = Math.min(s, 8192 / Math.max(1, rect.w), 8192 / Math.max(1, rect.h));
    s = Math.max(0.2, s);

    const out = document.createElement("canvas");
    out.width = Math.max(1, Math.round(rect.w * s));
    out.height = Math.max(1, Math.round(rect.h * s));
    const g = out.getContext("2d");
    g.setTransform(s, 0, 0, s, -rect.x * s, -rect.y * s);
    for (const item of state.elements) drawElement(g, item);
    return out;
  }

  function cropBlob() {
    const rect = state.exportRect;
    if (!rect) return Promise.reject(new Error("Select an area first"));

    /* Wait for the diagram fonts (including Virgil) before rasterising,
       otherwise a text element can fall back to a different face. */
    return ensureExportFonts().then(() => {
      const out = renderCrop(rect, 2);
      return new Promise((resolve, reject) => {
        out.toBlob((blob) => {
          if (blob) resolve(blob);
          else reject(new Error("Could not render the PNG"));
        }, "image/png");
      });
    });
  }

  async function ensureExportFonts() {
    if (!document.fonts?.load) return;
    const specs = new Set(['20px "Virgil"']);
    for (const item of state.elements) {
      if (item.type === "text") specs.add(fontSpec(item));
    }
    await Promise.all([...specs].map((spec) => document.fonts.load(spec).catch(() => {})));
  }

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      try {
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        const ok = document.execCommand("copy");
        ta.remove();
        return ok;
      } catch {
        return false;
      }
    }
  }

  function beginExport() {
    if (!state.elements.length) {
      notify("Draw something first");
      return;
    }
    if (state.exportMode) {
      cancelExport();
      return;
    }
    if (state.editingId) commitText();
    state.exportMode = true;
    state.exportRect = null;
    state.exportMarkdown = "";
    state.selected.clear();
    el.exportPanel.hidden = true;
    el.exportInsert.hidden = true;
    syncStyleUI();
    updateUI();
    render();
    notify("Drag a box around the area to export");
  }

  function cancelExport() {
    state.exportMode = false;
    state.exportRect = null;
    state.exportMarkdown = "";
    el.exportPanel.hidden = true;
    updateUI();
    render();
  }

  function retakeExport() {
    el.exportPanel.hidden = true;
    state.exportRect = null;
    state.exportMarkdown = "";
    el.exportInsert.hidden = true;
    updateHint();
    render();
  }

  async function showExportPanel() {
    const r = state.exportRect;
    if (!r) return;
    await ensureExportFonts();
    if (state.exportRect !== r) return;
    const thumbScale = Math.min(1, 150 / Math.max(1, r.w), 110 / Math.max(1, r.h));
    el.exportThumb.src = renderCrop(r, thumbScale).toDataURL("image/png");
    el.exportTitle.textContent = `Selection · ${Math.round(r.w)} × ${Math.round(r.h)}`;
    el.exportSnippet.textContent = state.exportMarkdown || "Save to post to get the markdown path.";
    el.exportSave.disabled = false;
    el.exportSave.textContent = "Save to post";
    el.exportInsert.hidden = !state.exportMarkdown;
    el.exportInsert.disabled = !state.exportMarkdown;
    el.exportPanel.hidden = false;
    updateHint();
  }

  async function saveExport() {
    if (!state.exportRect) return;
    el.exportSave.disabled = true;
    el.exportSave.textContent = "Saving…";
    try {
      let slug;
      if (typeof opts.ensureSlug === "function") slug = await opts.ensureSlug();
      else slug = opts.getSlug?.() || null;
      if (!slug) {
        notify("Add a title first — then the diagram can be saved next to the post");
        return;
      }

      const blob = await cropBlob();
      const d = new Date();
      const pad = (n) => String(n).padStart(2, "0");
      const stamp = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
      const name = `diagram-${stamp}.png`;

      const res = await fetch(`/api/upload?slug=${encodeURIComponent(slug)}`, {
        method: "POST",
        headers: {
          "content-type": "image/png",
          "x-filename": encodeURIComponent(name),
        },
        body: blob,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Upload failed");

      const markdown = `![diagram](${data.path})`;
      state.exportMarkdown = markdown;
      el.exportSnippet.textContent = markdown;
      el.exportTitle.textContent = `Selection · ${Math.round(state.exportRect.w)} × ${Math.round(state.exportRect.h)} · saved`;
      el.exportInsert.hidden = false;
      el.exportInsert.disabled = false;

      const copied = await copyText(markdown);
      notify(copied ? "Saved · markdown copied — paste it into the post" : "Saved · copy the markdown from the panel");
    } catch (err) {
      notify(err.message || "Could not save the diagram");
    } finally {
      el.exportSave.disabled = false;
      el.exportSave.textContent = "Save to post";
    }
  }

  async function copyExportImage() {
    try {
      if (!navigator.clipboard?.write || typeof ClipboardItem === "undefined") {
        throw new Error("This browser cannot copy images — use Download instead");
      }
      const blob = await cropBlob();
      await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
      notify("PNG copied to the clipboard");
    } catch (err) {
      notify(err.message || "Could not copy the image");
    }
  }

  async function downloadExport() {
    try {
      const blob = await cropBlob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "diagram.png";
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
      notify("PNG downloaded");
    } catch (err) {
      notify(err.message || "Could not download the image");
    }
  }

  function insertExport() {
    if (!state.exportMarkdown) return;
    if (typeof opts.insertMarkdown === "function") opts.insertMarkdown(state.exportMarkdown);
    notify("Inserted into the post");
    cancelExport();
  }

  /* --- zoom ------------------------------------------------- */

  function zoomAt(factor, px, py) {
    const z0 = state.view.zoom;
    const z = clamp(z0 * factor, MIN_ZOOM, MAX_ZOOM);
    if (z === z0) return;
    const worldX = px / z0 + state.view.x;
    const worldY = py / z0 + state.view.y;
    state.view.zoom = z;
    state.view.x = worldX - px / z;
    state.view.y = worldY - py / z;
    updateZoomLabel();
    updateCursor();
    render();
    scheduleSave();
  }

  function zoomBy(factor) {
    const { w, h } = stageSize();
    zoomAt(factor, w / 2, h / 2);
  }

  function resetZoom() {
    const { w, h } = stageSize();
    zoomAt(1 / state.view.zoom, w / 2, h / 2);
  }

  function fitView() {
    if (!state.elements.length) {
      state.view = { x: 0, y: 0, zoom: 1 };
      updateZoomLabel();
      render();
      scheduleSave();
      return;
    }
    const { w, h } = stageSize();
    if (w < 2 || h < 2) return;
    const b = unionBounds(state.elements);
    const pad = 56;
    const z = clamp(
      Math.min((w - pad * 2) / Math.max(1, b.w), (h - pad * 2) / Math.max(1, b.h)),
      MIN_ZOOM,
      1.6
    );
    state.view.zoom = z;
    state.view.x = b.x + b.w / 2 - w / (2 * z);
    state.view.y = b.y + b.h / 2 - h / (2 * z);
    updateZoomLabel();
    render();
    scheduleSave();
  }

  /* --- pointer --------------------------------------------- */

  function onPointerDown(event) {
    if (!state.isOpen) return;
    if (event.button === 2) return;
    if (state.editingId) commitText();

    const p = pointerPos(event);
    state.lastPointer = p;

    const wantsPan = event.button === 1 || state.space || state.tool === "hand";
    if (wantsPan) {
      event.preventDefault();
      try { canvas.setPointerCapture(event.pointerId); } catch {}
      state.action = {
        kind: "pan",
        start: { px: p.px, py: p.py },
        view: { ...state.view },
      };
      stage.style.cursor = "grabbing";
      render();
      return;
    }

    if (event.button !== 0) return;
    event.preventDefault();
    try { canvas.setPointerCapture(event.pointerId); } catch {}

    if (state.exportMode) {
      el.exportPanel.hidden = true;
      state.exportMarkdown = "";
      el.exportInsert.hidden = true;
      state.exportRect = null;
      state.action = {
        kind: "export",
        start: { x: p.x, y: p.y },
        current: { x: p.x, y: p.y },
      };
      updateHint();
      render();
      return;
    }

    if (state.tool === "text") {
      const item = blankElement("text", p.x, p.y, 0, 0, state.style);
      state.elements.push(item);
      state.selected = new Set([item.id]);
      startTextEdit(item, true);
      updateUI();
      render();
      return;
    }

    if (state.tool !== "select") {
      state.draft = blankElement(state.tool, p.x, p.y, 0, 0, state.style);
      state.action = {
        kind: "draw",
        start: { x: p.x, y: p.y },
        item: state.draft,
      };
      updateCount();
      render();
      return;
    }

    const handle = handleAt(p.px, p.py);
    if (handle) {
      beginResize(selected()[0], handle);
      return;
    }

    const hit = hitElementAt(p.x, p.y);
    if (hit) {
      if (event.shiftKey) {
        if (state.selected.has(hit.id)) state.selected.delete(hit.id);
        else state.selected.add(hit.id);
        syncStyleUI();
        updateHint();
        render();
        return;
      }
      if (!state.selected.has(hit.id)) selectOnly(hit);
      beginMove(p);
      return;
    }

    if (!event.shiftKey) {
      state.selected.clear();
      syncStyleUI();
    }
    state.action = {
      kind: "marquee",
      start: { x: p.x, y: p.y },
      current: { x: p.x, y: p.y },
      base: new Set(state.selected),
    };
    updateHint();
    render();
  }

  function onPointerMove(event) {
    if (!state.isOpen) return;
    const p = pointerPos(event);
    state.lastPointer = p;

    const a = state.action;
    if (!a) {
      updateCursor();
      return;
    }

    if (a.kind === "pan") {
      state.view.x = a.view.x - (p.px - a.start.px) / state.view.zoom;
      state.view.y = a.view.y - (p.py - a.start.py) / state.view.zoom;
      render();
      return;
    }

    if (a.kind === "draw") {
      updateDraft(p, event);
      return;
    }

    if (a.kind === "move") {
      updateMove(p, event.shiftKey);
      return;
    }

    if (a.kind === "resize") {
      updateResize(p, event);
      return;
    }

    if (a.kind === "marquee") {
      a.current = { x: p.x, y: p.y };
      render();
      return;
    }

    if (a.kind === "export") {
      a.current = { x: p.x, y: p.y };
      const w = Math.abs(p.x - a.start.x);
      const h = Math.abs(p.y - a.start.y);
      state.exportRect = w > 2 && h > 2
        ? {
            x: Math.min(a.start.x, p.x),
            y: Math.min(a.start.y, p.y),
            w,
            h,
          }
        : null;
      render();
    }
  }

  function onPointerUp(event) {
    if (!state.isOpen) return;
    try {
      if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
    } catch {}

    const a = state.action;
    state.action = null;

    if (a?.kind === "draw") {
      finishDraw();
    } else if ((a?.kind === "move" || a?.kind === "resize") && a.moved) {
      commitHistory();
      scheduleSave();
      syncStyleUI();
    } else if (a?.kind === "marquee") {
      finishMarquee(a);
    } else if (a?.kind === "export") {
      if (state.exportRect && state.exportRect.w >= 8 && state.exportRect.h >= 8) {
        showExportPanel();
      } else {
        state.exportRect = null;
        updateHint();
      }
    } else if (a?.kind === "pan") {
      scheduleSave();
    }

    updateUI();
    updateCursor();
    render();
  }

  function onPointerCancel() {
    if (state.draft) state.draft = null;
    state.action = null;
    updateUI();
    updateCursor();
    render();
  }

  function onWheel(event) {
    if (!state.isOpen) return;
    if (state.editingId) commitText();
    event.preventDefault();

    const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? 400 : 1;
    const dx = event.deltaX * unit;
    const dy = event.deltaY * unit;

    if (event.ctrlKey || event.metaKey) {
      const p = pointerPos(event);
      const factor = Math.exp(-dy * 0.0022);
      zoomAt(factor, p.px, p.py);
      return;
    }

    const px = event.shiftKey ? dy : dx;
    const py = event.shiftKey ? 0 : dy;
    state.view.x += px / state.view.zoom;
    state.view.y += py / state.view.zoom;
    updateCursor();
    render();
    scheduleSave();
  }

  function onDoubleClick(event) {
    if (state.tool !== "select" || state.exportMode) return;
    const p = pointerPos(event);
    const hit = hitElementAt(p.x, p.y);
    event.preventDefault();

    if (hit?.type === "text") {
      startTextEdit(hit, false);
      return;
    }
    if (!hit) {
      const item = blankElement("text", p.x, p.y, 0, 0, state.style);
      state.elements.push(item);
      state.selected = new Set([item.id]);
      startTextEdit(item, true);
      updateUI();
      render();
    }
  }

  /* --- keyboard -------------------------------------------- */

  function nudge(dx, dy) {
    if (!state.selected.size) return;
    for (const item of selected()) {
      item.x += dx;
      item.y += dy;
    }
    commitHistory();
    render();
  }

  function onKeyDown(event) {
    if (!state.isOpen) return;
    const tag = (event.target?.tagName || "").toLowerCase();
    const typing = tag === "input" || tag === "textarea" || tag === "select" || event.target?.isContentEditable;

    if (event.key === " " && !typing) {
      if (!event.repeat) {
        state.space = true;
        updateCursor();
      }
      event.preventDefault();
      return;
    }
    if (typing) return;

    const mod = event.metaKey || event.ctrlKey;
    const key = event.key.toLowerCase();

    if (mod) {
      if (key === "z") {
        event.preventDefault();
        if (event.shiftKey) redo();
        else undo();
        return;
      }
      if (key === "y") { event.preventDefault(); redo(); return; }
      if (key === "a") {
        event.preventDefault();
        state.selected = new Set(state.elements.map((item) => item.id));
        syncStyleUI();
        updateHint();
        render();
        return;
      }
      if (key === "c") { event.preventDefault(); copySelected(); return; }
      if (key === "v") { event.preventDefault(); pasteClipboard(); return; }
      if (key === "d") { event.preventDefault(); duplicateSelected(); return; }
      return;
    }

    if (event.key === "Escape") {
      if (state.exportMode) cancelExport();
      else if (state.selected.size) {
        state.selected.clear();
        syncStyleUI();
        updateHint();
        render();
      } else if (state.tool !== "select") {
        setTool("select");
      }
      return;
    }

    if (event.key === "Delete" || event.key === "Backspace") {
      if (state.selected.size) {
        event.preventDefault();
        deleteSelected();
      }
      return;
    }

    if (event.key === "Enter") {
      const items = selected();
      if (items.length === 1 && items[0].type === "text") {
        event.preventDefault();
        startTextEdit(items[0], false);
      }
      return;
    }

    const arrow = {
      ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1],
    }[event.key];
    if (arrow && state.selected.size) {
      event.preventDefault();
      const step = event.shiftKey ? 10 : 1;
      nudge(arrow[0] * step, arrow[1] * step);
      return;
    }

    if (TOOL_KEYS[key]) setTool(TOOL_KEYS[key]);
  }

  function onKeyUp(event) {
    if (event.key === " ") {
      state.space = false;
      updateCursor();
    }
  }

  /* --- style panel ----------------------------------------- */

  function buildSwatches(container, colors, onPick) {
    for (const color of colors) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "swatch";
      b.dataset.color = color;
      b.title = color === "transparent" ? "No fill" : color;
      b.setAttribute("aria-label", b.title);
      if (color !== "transparent") b.style.background = color;
      b.addEventListener("click", () => onPick(color));
      container.appendChild(b);
    }
  }

  function normalizeHex(value) {
    return /^#[0-9a-f]{6}$/i.test(String(value || "")) ? value : null;
  }

  function setActive(container, key, value) {
    container.querySelectorAll("button").forEach((b) => {
      b.classList.toggle("is-active", b.dataset[key] === String(value));
    });
  }

  function syncStyleUI() {
    const item = firstSelected();
    const s = item || state.style;
    const fillStyle = s.fillStyle || "none";
    const fill = s.fill || state.style.fill;
    const stroke = s.stroke || state.style.stroke;

    el.strokeSwatches.querySelectorAll(".swatch").forEach((b) => {
      b.classList.toggle("is-active", b.dataset.color === stroke);
    });
    el.fillSwatches.querySelectorAll(".swatch").forEach((b) => {
      const target = fillStyle === "none" ? "transparent" : fill;
      b.classList.toggle("is-active", b.dataset.color === target);
    });

    const strokeHex = normalizeHex(stroke);
    if (strokeHex) el.strokeCustom.value = strokeHex;
    const fillHex = normalizeHex(fill);
    if (fillHex) el.fillCustom.value = fillHex;

    setActive(el.fillStyles, "fill", fillStyle);
    setActive(el.strokeWidths, "width", s.strokeWidth);
    setActive(el.strokeStyles, "stroke", s.strokeStyle || "solid");
    setActive(el.roughness, "rough", s.roughness ?? 1);
    setActive(el.textAlign, "align", s.textAlign || "left");

    const opacity = Math.round(clamp(s.opacity ?? 1, 0.1, 1) * 100);
    el.opacity.value = String(opacity);
    el.opacityValue.textContent = `${opacity}%`;

    el.fontFamily.value = s.fontFamily || "sans";
    el.fontSize.value = String(s.fontSize || 20);
  }

  function applyStyle(patch, { commit = true, live = false } = {}) {
    Object.assign(state.style, patch);
    if ("opacity" in patch) state.style.opacity = clamp(patch.opacity, 0.1, 1);

    const items = selected();
    for (const item of items) {
      if ("stroke" in patch) item.stroke = patch.stroke;
      if ("fill" in patch) item.fill = patch.fill;
      if ("fillStyle" in patch) item.fillStyle = patch.fillStyle;
      if ("strokeWidth" in patch) item.strokeWidth = patch.strokeWidth;
      if ("strokeStyle" in patch) item.strokeStyle = patch.strokeStyle;
      if ("opacity" in patch) item.opacity = clamp(patch.opacity, 0.1, 1);
      if ("roughness" in patch) item.roughness = patch.roughness;
      if ("fontSize" in patch) {
        item.fontSize = patch.fontSize;
        if (item.type === "text") refreshTextHeight(item);
      }
      if ("fontFamily" in patch) {
        item.fontFamily = patch.fontFamily;
        if (item.type === "text") refreshTextHeight(item);
      }
      if ("textAlign" in patch) item.textAlign = patch.textAlign;
    }

    if (state.editingId) {
      const editing = state.elements.find((item) => item.id === state.editingId);
      if (editing) positionTextEditor(editing);
    }

    render();
    syncStyleUI();
    if (items.length && commit && !live) commitHistory();
    else scheduleSave();
  }

  function commitStyleChange() {
    if (selected().length) commitHistory();
    scheduleSave();
  }

  function initStyleUI() {
    buildSwatches(el.strokeSwatches, STROKE_COLORS, (color) => {
      applyStyle({ stroke: color });
    });
    buildSwatches(el.fillSwatches, ["transparent", ...FILL_COLORS], (color) => {
      if (color === "transparent") {
        applyStyle({ fillStyle: "none" });
        return;
      }
      const current = firstSelected() || state.style;
      applyStyle({
        fill: color,
        fillStyle: current.fillStyle === "none" ? "solid" : current.fillStyle,
      });
    });

    el.strokeCustom.addEventListener("input", (event) => {
      applyStyle({ stroke: event.target.value }, { commit: false, live: true });
    });
    el.strokeCustom.addEventListener("change", commitStyleChange);

    el.fillCustom.addEventListener("input", (event) => {
      const current = firstSelected() || state.style;
      applyStyle({
        fill: event.target.value,
        fillStyle: current.fillStyle === "none" ? "solid" : current.fillStyle,
      }, { commit: false, live: true });
    });
    el.fillCustom.addEventListener("change", commitStyleChange);

    el.fillStyles.querySelectorAll("button").forEach((b) => {
      b.addEventListener("click", () => applyStyle({ fillStyle: b.dataset.fill }));
    });
    el.strokeWidths.querySelectorAll("button").forEach((b) => {
      b.addEventListener("click", () => applyStyle({ strokeWidth: Number(b.dataset.width) }));
    });
    el.strokeStyles.querySelectorAll("button").forEach((b) => {
      b.addEventListener("click", () => applyStyle({ strokeStyle: b.dataset.stroke }));
    });
    el.roughness.querySelectorAll("button").forEach((b) => {
      b.addEventListener("click", () => applyStyle({ roughness: Number(b.dataset.rough) }));
    });
    el.textAlign.querySelectorAll("button").forEach((b) => {
      b.addEventListener("click", () => applyStyle({ textAlign: b.dataset.align }));
    });

    el.opacity.addEventListener("input", (event) => {
      const value = Number(event.target.value) / 100;
      el.opacityValue.textContent = `${event.target.value}%`;
      applyStyle({ opacity: value }, { commit: false, live: true });
    });
    el.opacity.addEventListener("change", commitStyleChange);

    el.fontFamily.addEventListener("change", (event) => {
      applyStyle({ fontFamily: event.target.value });
    });
    el.fontSize.addEventListener("change", (event) => {
      applyStyle({ fontSize: Number(event.target.value) });
    });

    syncStyleUI();
  }

  /* --- events ---------------------------------------------- */

  function initEvents() {
    root.querySelectorAll("[data-tool]").forEach((b) => {
      b.addEventListener("click", () => setTool(b.dataset.tool));
    });

    el.undo.addEventListener("click", undo);
    el.redo.addEventListener("click", redo);
    el.export.addEventListener("click", beginExport);

    el.zoomOut.addEventListener("click", () => zoomBy(1 / 1.2));
    el.zoomIn.addEventListener("click", () => zoomBy(1.2));
    el.zoomLabel.addEventListener("click", resetZoom);
    el.zoomFit.addEventListener("click", fitView);

    el.exportSave.addEventListener("click", saveExport);
    el.exportCopy.addEventListener("click", copyExportImage);
    el.exportDownload.addEventListener("click", downloadExport);
    el.exportInsert.addEventListener("click", insertExport);
    el.exportRetake.addEventListener("click", retakeExport);
    el.exportCancel.addEventListener("click", cancelExport);
    el.exportSnippet.addEventListener("click", () => {
      if (state.exportMarkdown) copyText(state.exportMarkdown).then((ok) => {
        if (ok) notify("Markdown copied");
      });
    });

    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerup", onPointerUp);
    canvas.addEventListener("pointercancel", onPointerCancel);
    canvas.addEventListener("wheel", onWheel, { passive: false });
    canvas.addEventListener("dblclick", onDoubleClick);

    el.textEditor.addEventListener("blur", commitText);
    el.textEditor.addEventListener("input", autoGrowText);
    el.textEditor.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        commitText();
      }
      if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        commitText();
      }
    });

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", () => {
      state.space = false;
      updateCursor();
    });
    window.addEventListener("pagehide", flushScene);

    const observer = new ResizeObserver(() => {
      if (state.isOpen) resize();
    });
    observer.observe(stage);

    if (document.fonts) {
      document.fonts.load('20px "Virgil"').catch(() => {});
      document.fonts.ready.then(recomputeTextHeights).catch(() => {});
      document.fonts.addEventListener?.("loadingdone", recomputeTextHeights);
    }
  }

  /* --- public surface -------------------------------------- */

  function open() {
    state.isOpen = true;
    resize();
    requestAnimationFrame(() => {
      resize();
      updateUI();
      updateCursor();
      render();
      canvas.focus({ preventScroll: true });
    });
  }

  function close() {
    if (state.editingId) commitText();
    flushScene();
    state.isOpen = false;
    state.space = false;
    state.action = null;
    state.draft = null;
    if (state.exportMode) cancelExport();
    updateCursor();
  }

  initStyleUI();
  initEvents();
  setSlug(opts.getSlug?.() || null);

  return { open, close, setSlug, render, fitView };
}

