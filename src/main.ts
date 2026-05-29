import "./style.css";

// ---------------- Types ----------------

type Shape =
  | "rect"
  | "rounded"
  | "document"
  | "subprocess"
  | "database"
  | "server"
  | "cloud";

interface Box {
  id: string;
  label: string;
  sublabel: string;
  shape: Shape;
  x: number;
  y: number;
  w: number;
  h: number;
}

type Background = "clean" | "grid" | "sections" | "diagonals" | "gradient";

interface DiagramState {
  theme: string;
  centerLabel: string;
  centerSublabel: string;
  background: Background;
  boxes: Box[];
}

// ---------------- Layout constants ----------------

const CANVAS_W = 1280;
const CANVAS_H = 800;
const PAD = 88;
const CENTER_W = 360;
const CENTER_H = 200;
const CENTER_X = (CANVAS_W - CENTER_W) / 2;
const CENTER_Y = (CANVAS_H - CENTER_H) / 2;
const DEFAULT_BOX_W = 170;
const DEFAULT_BOX_H = 64;

// ---------------- State ----------------

const state: DiagramState = {
  theme: "perspective",
  centerLabel: "the system",
  centerSublabel: "",
  background: "grid",
  boxes: [],
};

let selectedId: string | null = null;
let dragState: { id: string; offsetX: number; offsetY: number; moved: boolean } | null = null;

// ---------------- Persistence ----------------

const STORAGE_KEY = "sideframer:draft:v1";

function saveDraft(): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // localStorage may be unavailable (private mode, quota); fail silently
  }
}

function loadDraft(): Partial<DiagramState> | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    return parsed as Partial<DiagramState>;
  } catch {
    return null;
  }
}

function b64urlEncode(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlDecode(s: string): string {
  const padded = s.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (s.length % 4)) % 4);
  const bin = atob(padded);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

function decodeStateFromHash(): Partial<DiagramState> | null {
  const hash = window.location.hash;
  if (!hash) return null;
  const m = hash.match(/[#&]d=([^&]+)/);
  if (!m) return null;
  try {
    const parsed = JSON.parse(b64urlDecode(m[1]));
    if (!parsed || typeof parsed !== "object") return null;
    return parsed as Partial<DiagramState>;
  } catch {
    return null;
  }
}

function writeStateToHash(): void {
  try {
    history.replaceState(null, "", `#d=${b64urlEncode(JSON.stringify(state))}`);
  } catch {
    // ignore security/quota errors
  }
}

// ---------------- DOM bootstrap ----------------

const app = document.querySelector<HTMLDivElement>("#app")!;
app.innerHTML = `
  <header class="toolbar">
    <div class="brand">sideframer</div>
    <label class="field">
      <span>theme</span>
      <input id="theme-input" type="text" />
    </label>
    <label class="field">
      <span>center label</span>
      <input id="center-label-input" type="text" />
    </label>
    <label class="field">
      <span>center sublabel</span>
      <input id="center-sublabel-input" type="text" />
    </label>
    <label class="field">
      <span>background</span>
      <select id="bg-select">
        <option value="clean">clean</option>
        <option value="grid">grid</option>
        <option value="sections">sections</option>
        <option value="diagonals">diagonals</option>
        <option value="gradient">gradient</option>
      </select>
    </label>
    <div class="spacer"></div>
    <span class="hint">click in the frame to add a box · drag to move · select then edit below</span>
    <button id="copy-png" class="btn">copy PNG</button>
    <button id="new-diagram" class="btn">new</button>
  </header>
  <main class="canvas-wrap">
    <div id="canvas"></div>
  </main>
  <aside class="inspector" id="inspector" hidden>
    <div class="inspector-row">
      <label class="field">
        <span>selected box · label</span>
        <input id="box-label-input" type="text" />
      </label>
      <label class="field">
        <span>sublabel</span>
        <input id="box-sublabel-input" type="text" />
      </label>
      <label class="field">
        <span>shape</span>
        <select id="box-shape-select">
          <option value="rect">rectangle</option>
          <option value="rounded">rounded</option>
          <option value="document">document</option>
          <option value="subprocess">subprocess</option>
          <option value="database">database</option>
          <option value="server">server</option>
          <option value="cloud">cloud</option>
        </select>
      </label>
      <div class="spacer"></div>
      <button id="box-delete" class="btn danger">delete box</button>
    </div>
  </aside>
`;

const canvas = document.querySelector<HTMLDivElement>("#canvas")!;
const inspector = document.querySelector<HTMLElement>("#inspector")!;
const themeInput = document.querySelector<HTMLInputElement>("#theme-input")!;
const centerLabelInput = document.querySelector<HTMLInputElement>("#center-label-input")!;
const centerSublabelInput = document.querySelector<HTMLInputElement>("#center-sublabel-input")!;
const boxLabelInput = document.querySelector<HTMLInputElement>("#box-label-input")!;
const boxSublabelInput = document.querySelector<HTMLInputElement>("#box-sublabel-input")!;
const bgSelect = document.querySelector<HTMLSelectElement>("#bg-select")!;
const boxShapeSelect = document.querySelector<HTMLSelectElement>("#box-shape-select")!;

Object.assign(state, decodeStateFromHash() ?? loadDraft() ?? {});

themeInput.value = state.theme;
centerLabelInput.value = state.centerLabel;
centerSublabelInput.value = state.centerSublabel;
bgSelect.value = state.background;

themeInput.addEventListener("input", () => { state.theme = themeInput.value; render(); });
centerLabelInput.addEventListener("input", () => { state.centerLabel = centerLabelInput.value; render(); });
centerSublabelInput.addEventListener("input", () => { state.centerSublabel = centerSublabelInput.value; render(); });
bgSelect.addEventListener("change", () => { state.background = bgSelect.value as Background; render(); });
boxShapeSelect.addEventListener("change", () => {
  if (!selectedId) return;
  const box = state.boxes.find((b) => b.id === selectedId);
  if (!box) return;
  box.shape = boxShapeSelect.value as Shape;
  render();
});

document.querySelector<HTMLButtonElement>("#copy-png")!.addEventListener("click", copyPNG);
document.querySelector<HTMLButtonElement>("#new-diagram")!.addEventListener("click", newDiagram);
document.querySelector<HTMLButtonElement>("#box-delete")!.addEventListener("click", deleteSelected);
boxLabelInput.addEventListener("input", updateSelectedFromInputs);
boxSublabelInput.addEventListener("input", updateSelectedFromInputs);

document.addEventListener("keydown", (e) => {
  const active = document.activeElement;
  const typing = active && (active.tagName === "INPUT" || active.tagName === "TEXTAREA");
  if (!typing && (e.key === "Backspace" || e.key === "Delete") && selectedId) {
    e.preventDefault();
    deleteSelected();
  }
  if (e.key === "Escape") {
    if (active instanceof HTMLElement) active.blur();
    if (selectedId) {
      selectedId = null;
      render();
    }
  }
});

window.addEventListener("hashchange", () => {
  const fromHash = decodeStateFromHash();
  if (!fromHash) return;
  Object.assign(state, fromHash);
  themeInput.value = state.theme;
  centerLabelInput.value = state.centerLabel;
  centerSublabelInput.value = state.centerSublabel;
  bgSelect.value = state.background;
  selectedId = null;
  render();
});

// ---------------- Helpers ----------------

function uid(): string {
  return Math.random().toString(36).slice(2, 9);
}

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[c]!));
}

function isInCenter(x: number, y: number): boolean {
  return x >= CENTER_X && x <= CENTER_X + CENTER_W && y >= CENTER_Y && y <= CENTER_Y + CENTER_H;
}

function isInFrame(x: number, y: number): boolean {
  return x >= PAD && x <= CANVAS_W - PAD && y >= PAD && y <= CANVAS_H - PAD;
}

function clampToFrame(box: Box): void {
  box.x = Math.max(PAD + 8, Math.min(CANVAS_W - PAD - box.w - 8, box.x));
  box.y = Math.max(PAD + 8, Math.min(CANVAS_H - PAD - box.h - 8, box.y));
}

function rectsOverlap(
  a: { x: number; y: number; w: number; h: number },
  b: { x: number; y: number; w: number; h: number },
): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

// ---------------- Render ----------------

function render(): void {
  canvas.innerHTML = buildSVG();
  bindCanvasEvents();
  syncInspector();
  saveDraft();
  writeStateToHash();
}

function buildSVG(): string {
  const themeStr = state.theme ? `theme:  ${esc(state.theme)}` : "";
  return `
<svg id="svg-root" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${CANVAS_W} ${CANVAS_H}" width="${CANVAS_W}" height="${CANVAS_H}">
  <style>
    .axis { font: 600 12px Arial, Helvetica, sans-serif; letter-spacing: 4px; fill: #8a8678; }
    .theme-line { font: 13px Arial, Helvetica, sans-serif; fill: #6b685f; letter-spacing: 0.5px; }
    .center-label { font: 600 22px Arial, Helvetica, sans-serif; fill: #2a2a28; }
    .center-sublabel { font: 14px Arial, Helvetica, sans-serif; fill: #6b685f; }
    .box-label { font: 600 14px Arial, Helvetica, sans-serif; fill: #2a2a28; }
    .box-sublabel { font: 12px Arial, Helvetica, sans-serif; fill: #6b685f; }
  </style>

  ${renderBackground()}

  <rect class="frame" x="${PAD}" y="${PAD}"
        width="${CANVAS_W - 2 * PAD}" height="${CANVAS_H - 2 * PAD}"
        fill="none" stroke="#c8c4b8" stroke-width="2" rx="6"/>

  <text class="axis" x="${CANVAS_W / 2}" y="${PAD - 30}" text-anchor="middle">DEPENDENCIES</text>
  <text class="axis" x="${CANVAS_W / 2}" y="${CANVAS_H - PAD + 48}" text-anchor="middle">SIDE-EFFECTS</text>
  <text class="axis" x="${PAD - 38}" y="${CANVAS_H / 2}" text-anchor="middle"
        transform="rotate(-90, ${PAD - 38}, ${CANVAS_H / 2})">INPUT</text>
  <text class="axis" x="${CANVAS_W - PAD + 38}" y="${CANVAS_H / 2}" text-anchor="middle"
        transform="rotate(90, ${CANVAS_W - PAD + 38}, ${CANVAS_H / 2})">OUTPUT</text>

  <text class="theme-line" x="${PAD}" y="${PAD - 56}">${themeStr}</text>

  <g class="center" data-target="center">
    <rect x="${CENTER_X}" y="${CENTER_Y}" width="${CENTER_W}" height="${CENTER_H}"
          fill="#ffffff" stroke="#2a2a28" stroke-width="2.5" rx="8"/>
    <text class="center-label" x="${CENTER_X + CENTER_W / 2}"
          y="${CENTER_Y + CENTER_H / 2 - (state.centerSublabel ? 10 : 0)}"
          text-anchor="middle" dominant-baseline="middle">${esc(state.centerLabel)}</text>
    ${state.centerSublabel
      ? `<text class="center-sublabel" x="${CENTER_X + CENTER_W / 2}" y="${CENTER_Y + CENTER_H / 2 + 18}"
            text-anchor="middle" dominant-baseline="middle">${esc(state.centerSublabel)}</text>`
      : ""}
  </g>

  ${state.boxes.map(renderBox).join("\n")}
</svg>`;
}

function renderBackground(): string {
  switch (state.background) {
    case "clean":
      return `<rect width="100%" height="100%" fill="#fbfaf6"/>`;
    case "grid":
      return `
        <defs>
          <pattern id="bg-grid" width="24" height="24" patternUnits="userSpaceOnUse">
            <path d="M 24 0 L 0 0 0 24" fill="none" stroke="#eee8dc" stroke-width="1"/>
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="#fbfaf6"/>
        <rect width="100%" height="100%" fill="url(#bg-grid)"/>`;
    case "sections":
      return `
        <rect width="100%" height="100%" fill="#fbfaf6"/>
        <rect x="0" y="0" width="${CENTER_X}" height="${CANVAS_H}" fill="#f4eddc" opacity="0.55"/>
        <rect x="${CENTER_X + CENTER_W}" y="0" width="${CANVAS_W - CENTER_X - CENTER_W}" height="${CANVAS_H}" fill="#f4eddc" opacity="0.55"/>
        <line x1="${CENTER_X}" y1="${PAD}" x2="${CENTER_X}" y2="${CANVAS_H - PAD}" stroke="#d4ceb8" stroke-width="1" stroke-dasharray="3 6"/>
        <line x1="${CENTER_X + CENTER_W}" y1="${PAD}" x2="${CENTER_X + CENTER_W}" y2="${CANVAS_H - PAD}" stroke="#d4ceb8" stroke-width="1" stroke-dasharray="3 6"/>`;
    case "diagonals":
      return `
        <rect width="100%" height="100%" fill="#fbfaf6"/>
        <line x1="${PAD}" y1="${PAD}" x2="${CANVAS_W - PAD}" y2="${CANVAS_H - PAD}" stroke="#dcd6c4" stroke-width="1"/>
        <line x1="${CANVAS_W - PAD}" y1="${PAD}" x2="${PAD}" y2="${CANVAS_H - PAD}" stroke="#dcd6c4" stroke-width="1"/>`;
    case "gradient":
      return `
        <defs>
          <radialGradient id="bg-grad" cx="50%" cy="50%" r="65%">
            <stop offset="0%" stop-color="#ffffff"/>
            <stop offset="100%" stop-color="#efe7d2"/>
          </radialGradient>
        </defs>
        <rect width="100%" height="100%" fill="url(#bg-grad)"/>`;
  }
}

function renderBox(b: Box): string {
  const sel = b.id === selectedId;
  const stroke = sel ? "#3b82f6" : "#54524c";
  const sw = sel ? 2.5 : 1.5;
  return `<g class="box" data-id="${b.id}" style="cursor: ${sel ? "grabbing" : "grab"}">
    ${renderShape(b, "#ffffff", stroke, sw)}
    <text class="box-label" x="${b.x + b.w / 2}"
          y="${b.y + b.h / 2 - (b.sublabel ? 8 : 0)}"
          text-anchor="middle" dominant-baseline="middle">${esc(b.label)}</text>
    ${b.sublabel
      ? `<text class="box-sublabel" x="${b.x + b.w / 2}" y="${b.y + b.h / 2 + 12}"
            text-anchor="middle" dominant-baseline="middle">${esc(b.sublabel)}</text>`
      : ""}
  </g>`;
}

function renderShape(b: Box, fill: string, stroke: string, sw: number): string {
  const { x, y, w, h } = b;
  const a = `fill="${fill}" stroke="${stroke}" stroke-width="${sw}"`;
  switch (b.shape) {
    case "rect":
      return `<rect x="${x}" y="${y}" width="${w}" height="${h}" ${a}/>`;
    case "rounded":
      return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="5" ${a}/>`;
    case "document":
      return `<path d="M ${x},${y} L ${x + w},${y} L ${x + w},${y + h * 0.85} C ${x + w * 0.75},${y + h * 1.05} ${x + w * 0.25},${y + h * 0.7} ${x},${y + h * 0.85} Z" ${a}/>`;
    case "subprocess":
      return `<rect x="${x}" y="${y}" width="${w}" height="${h}" ${a}/>
        <line x1="${x + 8}" y1="${y}" x2="${x + 8}" y2="${y + h}" stroke="${stroke}" stroke-width="${sw}"/>
        <line x1="${x + w - 8}" y1="${y}" x2="${x + w - 8}" y2="${y + h}" stroke="${stroke}" stroke-width="${sw}"/>`;
    case "database": {
      const eh = 10;
      return `<path d="M ${x},${y + eh} L ${x},${y + h - eh} C ${x},${y + h + eh * 0.5} ${x + w},${y + h + eh * 0.5} ${x + w},${y + h - eh} L ${x + w},${y + eh} Z" ${a}/>
        <ellipse cx="${x + w / 2}" cy="${y + eh}" rx="${w / 2}" ry="${eh}" ${a}/>`;
    }
    case "server":
      return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="2" ${a}/>
        <line x1="${x}" y1="${y + 13}" x2="${x + w}" y2="${y + 13}" stroke="${stroke}" stroke-width="${sw}" opacity="0.5"/>
        <line x1="${x}" y1="${y + h - 13}" x2="${x + w}" y2="${y + h - 13}" stroke="${stroke}" stroke-width="${sw}" opacity="0.5"/>
        <circle cx="${x + w - 10}" cy="${y + 7}" r="1.5" fill="${stroke}"/>
        <circle cx="${x + w - 16}" cy="${y + 7}" r="1.5" fill="${stroke}"/>
        <circle cx="${x + w - 10}" cy="${y + h - 7}" r="1.5" fill="${stroke}"/>
        <circle cx="${x + w - 16}" cy="${y + h - 7}" r="1.5" fill="${stroke}"/>`;
    case "cloud": {
      const sx = w / 22;
      const sy = h / 15;
      return `<path transform="translate(${x - 1 * sx},${y - 4.5 * sy}) scale(${sx},${sy})" d="M2.25 15a4.5 4.5 0 0 0 4.5 4.5H18a3.75 3.75 0 0 0 1.332-7.257 3 3 0 0 0-3.758-3.848 5.25 5.25 0 0 0-10.233 2.33A4.502 4.502 0 0 0 2.25 15Z" ${a} vector-effect="non-scaling-stroke"/>`;
    }
  }
}

// ---------------- Pointer interactions ----------------

function bindCanvasEvents(): void {
  const svgEl = document.querySelector<SVGSVGElement>("#svg-root")!;
  svgEl.addEventListener("mousedown", onMouseDown);
}

function svgPoint(svg: SVGSVGElement, evt: MouseEvent): { x: number; y: number } {
  const pt = svg.createSVGPoint();
  pt.x = evt.clientX;
  pt.y = evt.clientY;
  const ctm = svg.getScreenCTM();
  if (!ctm) return { x: 0, y: 0 };
  const inv = ctm.inverse();
  const t = pt.matrixTransform(inv);
  return { x: t.x, y: t.y };
}

function onMouseDown(e: MouseEvent): void {
  const svgEl = e.currentTarget as SVGSVGElement;
  const { x, y } = svgPoint(svgEl, e);
  const target = e.target as Element;
  const boxGroup = target.closest("g.box") as SVGGElement | null;

  if (boxGroup) {
    const id = boxGroup.dataset.id!;
    const box = state.boxes.find((b) => b.id === id);
    if (!box) return;
    selectedId = id;
    dragState = { id, offsetX: x - box.x, offsetY: y - box.y, moved: false };
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
    render();
    boxLabelInput.focus();
    boxLabelInput.select();
    return;
  }

  if (target.closest("g.center")) {
    selectedId = null;
    render();
    centerLabelInput.focus();
    centerLabelInput.select();
    return;
  }

  if (!isInFrame(x, y) || isInCenter(x, y)) {
    selectedId = null;
    render();
    return;
  }

  const newBox: Box = {
    id: uid(),
    label: "new box",
    sublabel: "",
    shape: "rounded",
    x: x - DEFAULT_BOX_W / 2,
    y: y - DEFAULT_BOX_H / 2,
    w: DEFAULT_BOX_W,
    h: DEFAULT_BOX_H,
  };
  clampToFrame(newBox);

  // Refuse spawn if it would overlap the center; nudge to nearest side instead.
  if (rectsOverlap(newBox, { x: CENTER_X, y: CENTER_Y, w: CENTER_W, h: CENTER_H })) {
    return;
  }

  state.boxes.push(newBox);
  selectedId = newBox.id;
  render();
  boxLabelInput.focus();
  boxLabelInput.select();
}

function onMouseMove(e: MouseEvent): void {
  if (!dragState) return;
  const svgEl = document.querySelector<SVGSVGElement>("#svg-root")!;
  const { x, y } = svgPoint(svgEl, e);
  const box = state.boxes.find((b) => b.id === dragState!.id);
  if (!box) return;
  box.x = x - dragState.offsetX;
  box.y = y - dragState.offsetY;
  clampToFrame(box);
  dragState.moved = true;
  render();
}

function onMouseUp(): void {
  dragState = null;
  document.removeEventListener("mousemove", onMouseMove);
  document.removeEventListener("mouseup", onMouseUp);
}

// ---------------- Inspector ----------------

function syncInspector(): void {
  if (!selectedId) {
    inspector.hidden = true;
    return;
  }
  const box = state.boxes.find((b) => b.id === selectedId);
  if (!box) {
    inspector.hidden = true;
    return;
  }
  inspector.hidden = false;
  if (document.activeElement !== boxLabelInput) boxLabelInput.value = box.label;
  if (document.activeElement !== boxSublabelInput) boxSublabelInput.value = box.sublabel;
  boxShapeSelect.value = box.shape;
}

function updateSelectedFromInputs(): void {
  if (!selectedId) return;
  const box = state.boxes.find((b) => b.id === selectedId);
  if (!box) return;
  box.label = boxLabelInput.value;
  box.sublabel = boxSublabelInput.value;
  render();
}

function deleteSelected(): void {
  if (!selectedId) return;
  state.boxes = state.boxes.filter((b) => b.id !== selectedId);
  selectedId = null;
  render();
}

function newDiagram(): void {
  if (state.boxes.length > 0 && !confirm("Discard current diagram?")) return;
  state.theme = "perspective";
  state.centerLabel = "the system";
  state.centerSublabel = "";
  state.boxes = [];
  selectedId = null;
  themeInput.value = state.theme;
  centerLabelInput.value = state.centerLabel;
  centerSublabelInput.value = state.centerSublabel;
  render();
}

// ---------------- PNG export ----------------

async function copyPNG(): Promise<void> {
  // Capture XML synchronously inside the user gesture. Hide selection from export.
  const prevSelected = selectedId;
  selectedId = null;
  render();
  const exportSvg = document.querySelector<SVGSVGElement>("#svg-root")!;
  const xml = new XMLSerializer().serializeToString(exportSvg);
  selectedId = prevSelected;

  // Build the PNG blob lazily; the gesture grant survives a Promise<Blob> in ClipboardItem.
  const pngPromise: Promise<Blob> = (async () => {
    const svgBlob = new Blob([xml], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(svgBlob);
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      const c = document.createElement("canvas");
      c.width = CANVAS_W;
      c.height = CANVAS_H;
      const ctx = c.getContext("2d")!;
      ctx.fillStyle = "#fbfaf6";
      ctx.fillRect(0, 0, c.width, c.height);
      ctx.drawImage(img, 0, 0, CANVAS_W, CANVAS_H);
      return await new Promise<Blob>((resolve, reject) => {
        c.toBlob((b) => (b ? resolve(b) : reject(new Error("canvas.toBlob failed"))), "image/png");
      });
    } finally {
      URL.revokeObjectURL(url);
    }
  })();

  try {
    await navigator.clipboard.write([new ClipboardItem({ "image/png": pngPromise })]);
    flash("PNG copied to clipboard");
  } catch (err) {
    flash("copy failed: " + (err as Error).message, true);
  } finally {
    render();
  }
}

function flash(msg: string, isError = false): void {
  const el = document.createElement("div");
  el.className = "flash" + (isError ? " error" : "");
  el.textContent = msg;
  document.body.appendChild(el);
  requestAnimationFrame(() => el.classList.add("show"));
  setTimeout(() => {
    el.classList.remove("show");
    setTimeout(() => el.remove(), 300);
  }, 2000);
}

// ---------------- Boot ----------------

render();
