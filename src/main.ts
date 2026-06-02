import "./style.css";
import { createClientRig, DiagramStore } from "./lib/diagram-store.ts";
import { createStyleRig, type StyleKind, type StylePack, StyleStore } from "./lib/style-store.ts";
import { createNamespace } from "./lib/sluggify.ts";
// design-system and help pages are dynamic-imported on demand (see setPage)
// to keep the diagrammer bundle light.

const STORAGE_SERVER = (import.meta as { env?: { VITE_SIDEFRAMER_SERVER?: string } }).env
  ?.VITE_SIDEFRAMER_SERVER || "http://localhost:5174";

// Each b3nd app is mounted at an injected dataspace URI. Swap the providers
// to point either app at a different scheme, prefix, or node — no code
// changes needed downstream.
const diagramNs = createNamespace(() => "mutable://diagrams");
const styleNs = createNamespace(() => "mutable://styles");

const diagramStore = new DiagramStore(createClientRig(STORAGE_SERVER, diagramNs), diagramNs);
const styleStore = new StyleStore(createStyleRig(STORAGE_SERVER, styleNs), styleNs);

// ---------------- Types ----------------

type Shape =
  | "rect"
  | "rounded"
  | "document"
  | "subprocess"
  | "database"
  | "server"
  | "cloud"
  | "user";

const SHAPES: Shape[] = ["rect", "rounded", "document", "subprocess", "database", "server", "cloud", "user"];

interface Box {
  id: string;
  label: string;
  sublabel: string;
  shape: Shape;
  x: number;
  y: number;
  w: number;
  h: number;
  /** Per-box object-pack override. Null/absent → use the diagram default. */
  styleUri?: string | null;
}

type Mode = "gallery" | "view" | "draw" | "connect" | "styles";
const MODES: Mode[] = ["gallery", "view", "draw", "connect", "styles"];

// Style packs come in two kinds:
//
//   canvas — diagram-wide environment (background, typography, axis labels).
//            Bound once per diagram via `canvasStyleUri`.
//   object — box / line / center palette (fills, strokes, label inks,
//            connector colors). Bound diagram-wide as the default via
//            `objectStyleUri`, with optional per-box overrides via
//            `Box.styleUri` — so a diagram can carry e.g. `entitya-main`
//            and `entitya-secondary` packs and apply them per shape.
//
// All tokens are resolved at render time and stamped literally into the
// SVG so PNG export carries the brand.

interface CanvasTokens {
  bgMode: string;          // one of BG_MODE_OPTIONS
  bg: string;              // base canvas color (all bg modes)
  gradientFrom: string;    // only used when bgMode === "gradient"
  gradientTo: string;
  frameStroke: string;     // the padded-area frame rectangle
  axisInk: string;         // DEPENDENCIES / INPUT / OUTPUT / SIDE-EFFECTS labels
  fontFamily: string;
}

interface ObjectTokens {
  fill: string;
  stroke: string;
  ink: string;
  muteInk: string;
  connectorStroke: string;
  arrowFill: string;
}

const BG_MODE_OPTIONS = ["clean", "grid", "sections", "diagonals", "gradient"] as const;

const DEFAULT_CANVAS_TOKENS: CanvasTokens = {
  bgMode: "grid",
  bg: "#fbfaf6",
  gradientFrom: "#ffffff",
  gradientTo: "#efe7d2",
  frameStroke: "#c8c4b8",
  axisInk: "#8a8678",
  fontFamily: "Arial, Helvetica, sans-serif",
};

const DEFAULT_OBJECT_TOKENS: ObjectTokens = {
  fill: "#ffffff",
  stroke: "#54524c",
  ink: "#2a2a28",
  muteInk: "#6b685f",
  connectorStroke: "#54524c",
  arrowFill: "#54524c",
};

let activeCanvasTokens: CanvasTokens = { ...DEFAULT_CANVAS_TOKENS };
let activeObjectTokens: ObjectTokens = { ...DEFAULT_OBJECT_TOKENS };
// uri → resolved ObjectTokens, populated by `applyBindings` so the
// renderer can look up per-box overrides synchronously.
const objectPackCache = new Map<string, ObjectTokens>();

const FONT_FAMILY_OPTIONS: { label: string; value: string }[] = [
  { label: "Helvetica", value: "Arial, Helvetica, sans-serif" },
  { label: "Georgia",   value: "Georgia, 'Times New Roman', serif" },
  { label: "System",    value: "system-ui, -apple-system, Segoe UI, sans-serif" },
  { label: "Mono",      value: "ui-monospace, SFMono-Regular, Menlo, monospace" },
];

type CanvasTokenDef =
  | { name: keyof CanvasTokens; label: string; control: "color";  default: string }
  | { name: keyof CanvasTokens; label: string; control: "font";   default: string }
  | { name: keyof CanvasTokens; label: string; control: "bgmode"; default: string };

type ObjectTokenDef =
  | { name: keyof ObjectTokens; label: string; control: "color"; default: string };

const CANVAS_TOKEN_DEFS: CanvasTokenDef[] = [
  { name: "bgMode",       label: "background",    control: "bgmode", default: DEFAULT_CANVAS_TOKENS.bgMode },
  { name: "bg",           label: "canvas color",  control: "color",  default: DEFAULT_CANVAS_TOKENS.bg },
  { name: "gradientFrom", label: "gradient from", control: "color",  default: DEFAULT_CANVAS_TOKENS.gradientFrom },
  { name: "gradientTo",   label: "gradient to",   control: "color",  default: DEFAULT_CANVAS_TOKENS.gradientTo },
  { name: "frameStroke",  label: "frame line",    control: "color",  default: DEFAULT_CANVAS_TOKENS.frameStroke },
  { name: "axisInk",      label: "axis labels",   control: "color",  default: DEFAULT_CANVAS_TOKENS.axisInk },
  { name: "fontFamily",   label: "font",          control: "font",   default: DEFAULT_CANVAS_TOKENS.fontFamily },
];

const OBJECT_TOKEN_DEFS: ObjectTokenDef[] = [
  { name: "fill",            label: "fill",         control: "color", default: DEFAULT_OBJECT_TOKENS.fill },
  { name: "stroke",          label: "stroke",       control: "color", default: DEFAULT_OBJECT_TOKENS.stroke },
  { name: "ink",             label: "label",        control: "color", default: DEFAULT_OBJECT_TOKENS.ink },
  { name: "muteInk",         label: "sublabel",     control: "color", default: DEFAULT_OBJECT_TOKENS.muteInk },
  { name: "connectorStroke", label: "connector",    control: "color", default: DEFAULT_OBJECT_TOKENS.connectorStroke },
  { name: "arrowFill",       label: "arrow",        control: "color", default: DEFAULT_OBJECT_TOKENS.arrowFill },
];

function tokenDefsFor(kind: StyleKind): (CanvasTokenDef | ObjectTokenDef)[] {
  return kind === "canvas" ? CANVAS_TOKEN_DEFS : OBJECT_TOKEN_DEFS;
}

type Page = "design-system" | "help";
const PAGES: Page[] = ["design-system", "help"];

interface Connector {
  id: string;
  from: string;
  to: string;
}

interface DiagramState {
  scene: string;
  centerLabel: string;
  centerSublabel: string;
  centerX: number;
  centerY: number;
  boxes: Box[];
  connectors: Connector[];
  /**
   * Live references to style pack URIs. Canvas covers the diagram's
   * environment (bg, font, axis labels); object is the default palette for
   * boxes, lines, and the center — individual boxes may override via
   * `Box.styleUri`. Packs are not inlined: updates to a pack flow through
   * to every diagram pointing at it. Use PNG export for snapshots.
   */
  canvasStyleUri?: string | null;
  objectStyleUri?: string | null;
  createdAt?: number;
  updatedAt?: number;
}

const CENTER_ID = "@center";

// ---------------- Layout constants ----------------

const CANVAS_W = 1600;
const CANVAS_H = 1000;
const PAD = 88;
const CENTER_W = 360;
const CENTER_H = 200;
const CENTER_X_DEFAULT = (CANVAS_W - CENTER_W) / 2;
const CENTER_Y_DEFAULT = (CANVAS_H - CENTER_H) / 2;
const CENTER_SHAPE: Shape = "subprocess";
const DEFAULT_BOX_W = 170;
const DEFAULT_BOX_H = 64;

// ---------------- State ----------------

const state: DiagramState = {
  scene: "perspective",
  centerLabel: "the system",
  centerSublabel: "",
  centerX: CENTER_X_DEFAULT,
  centerY: CENTER_Y_DEFAULT,
  boxes: [],
  connectors: [],
};

let selectedId: string | null = null;
let selectedConnectorId: string | null = null;
let selectedCenter = false;
let dragState: { id: string; offsetX: number; offsetY: number; moved: boolean } | null = null;
let currentMode: Mode = "draw";
let connectFrom: string | null = null;
let galleryToken = 0;
let currentPage: Page | null = null;
let pageToken = 0;
let pageOverlay!: HTMLDivElement;
let pageBody!: HTMLDivElement;
let pageTitle!: HTMLElement;

// DOM refs — assigned by bootDiagrammer()
let shellEl!: HTMLElement;
let canvas!: HTMLDivElement;
let inspector!: HTMLElement;
let sceneInput!: HTMLInputElement;
let shapeField!: HTMLElement;
let inspectorFooter!: HTMLElement;
let boxLabelInput!: HTMLInputElement;
let boxSublabelInput!: HTMLInputElement;
let shapeGrid!: HTMLDivElement;
let modeSeg!: HTMLDivElement;
let hintSpan!: HTMLSpanElement;
let galleryList!: HTMLUListElement;
let galleryEmpty!: HTMLDivElement;
let galleryError!: HTMLDivElement;
let galleryCount!: HTMLSpanElement;
let stylesList!: HTMLUListElement;
let stylesEmpty!: HTMLDivElement;
let stylesError!: HTMLDivElement;
let stylesCount!: HTMLSpanElement;
let canvasPackSelect!: HTMLSelectElement;
let objectPackSelect!: HTMLSelectElement;
let boxStyleSelect!: HTMLSelectElement;

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

function decodeModeFromHash(): Mode | null {
  const hash = window.location.hash;
  if (!hash) return null;
  const m = hash.match(/[#&]m=([^&]+)/);
  if (!m) return null;
  const mode = m[1] as Mode;
  return MODES.includes(mode) ? mode : null;
}

function decodePageFromHash(): Page | null {
  const hash = window.location.hash;
  if (!hash) return null;
  const m = hash.match(/[#&]p=([^&]+)/);
  if (!m) return null;
  const page = m[1] as Page;
  return PAGES.includes(page) ? page : null;
}

function currentHashUrl(): string {
  const parts = [`m=${currentMode}`];
  if (currentPage) parts.push(`p=${currentPage}`);
  parts.push(`d=${b64urlEncode(JSON.stringify(state))}`);
  return `#${parts.join("&")}`;
}

function writeStateToHash(): void {
  try {
    history.replaceState(null, "", currentHashUrl());
  } catch {
    // ignore security/quota errors
  }
}

function normalizeState(): void {
  if (!Array.isArray(state.boxes)) state.boxes = [];
  if (!Array.isArray(state.connectors)) state.connectors = [];
  const legacyTheme = (state as unknown as { theme?: string }).theme;
  if (typeof legacyTheme === "string" && !state.scene) state.scene = legacyTheme;
  delete (state as unknown as { theme?: string }).theme;
  // Background mode + gradient colors used to live on the diagram; they're
  // now part of the canvas style pack. Drop any pre-split fields so they
  // stop riding in the URL hash.
  const legacy = state as unknown as Record<string, unknown>;
  delete legacy.background;
  delete legacy.gradientFrom;
  delete legacy.gradientTo;
  if (typeof state.centerX !== "number" || !Number.isFinite(state.centerX)) state.centerX = CENTER_X_DEFAULT;
  if (typeof state.centerY !== "number" || !Number.isFinite(state.centerY)) state.centerY = CENTER_Y_DEFAULT;
  clampCenter();
}

function clampCenter(): void {
  state.centerX = Math.max(PAD + 8, Math.min(CANVAS_W - PAD - CENTER_W - 8, state.centerX));
  state.centerY = Math.max(PAD + 8, Math.min(CANVAS_H - PAD - CENTER_H - 8, state.centerY));
}

const app = document.querySelector<HTMLDivElement>("#app")!;

// ---------------- DOM bootstrap ----------------

function bootDiagrammer(): void {
  app.innerHTML = `
    <div id="shell" data-mode="draw">
      <div class="message-bar" id="message-bar" hidden>
        <span id="message-bar-text"></span>
        <button type="button" class="msg-dismiss" id="message-bar-dismiss" title="dismiss">×</button>
      </div>

      <header class="masthead">
        <div class="masthead-brand">sideframer</div>
        <nav class="masthead-modes">
          <div class="segmented" id="mode-seg" role="tablist" aria-label="mode">
            ${MODES.map((m) => `<button type="button" data-mode="${m}">${m}</button>`).join("")}
          </div>
        </nav>
        <div class="masthead-actions">
          <button id="copy-png" class="btn">copy PNG</button>
          <button id="save-diagram" class="btn">save</button>
          <button id="new-diagram" class="btn">new</button>
        </div>
      </header>

      <div class="shell-main">
        <div class="context-actions" id="context-actions">
          <div class="context-actions-group" data-mode="gallery">
            <button id="gallery-refresh" class="btn-mini" title="refresh">↻ refresh</button>
            <span class="ctx-note">click a tile to open it</span>
          </div>
          <div class="context-actions-group" data-mode="view">
            <span class="ctx-note">read-only · press <kbd>d</kbd> to draw or <kbd>c</kbd> to connect</span>
          </div>
          <div class="context-actions-group" data-mode="draw">
            <label class="field">
              <span>scene</span>
              <input id="scene-input" type="text" />
            </label>
            <label class="field">
              <span>canvas style</span>
              <select id="canvas-pack-select"></select>
            </label>
            <label class="field">
              <span>object style</span>
              <select id="object-pack-select"></select>
            </label>
          </div>
          <div class="context-actions-group" data-mode="connect">
            <span class="ctx-note">click two boxes (or the center) to connect · click an arrow to select</span>
          </div>
          <div class="context-actions-group" data-mode="styles">
            <button id="styles-new-canvas" class="btn-mini">+ canvas pack</button>
            <button id="styles-new-object" class="btn-mini">+ object pack</button>
            <button id="styles-refresh" class="btn-mini" title="refresh">↻ refresh</button>
            <span class="ctx-note">edit a pack to set tokens · click ↻ apply to bind it to the current diagram</span>
          </div>
        </div>

        <div class="mode-content" id="mode-content">
          <aside id="gallery-pane">
            <div class="gallery-pane-header">
              <h2>gallery</h2>
              <span class="gallery-count" id="gallery-count"></span>
            </div>
            <ul id="gallery-list" class="gallery-grid"></ul>
            <div class="gallery-empty" id="gallery-empty" hidden>
              nothing saved yet — hit <kbd>save</kbd> on a diagram you like.
            </div>
            <div class="gallery-error" id="gallery-error" hidden></div>
          </aside>
          <aside id="styles-pane">
            <div class="styles-pane-header">
              <h2>style packs</h2>
              <span class="styles-count" id="styles-count"></span>
            </div>
            <ul id="styles-list" class="styles-grid"></ul>
            <div class="styles-empty" id="styles-empty" hidden>
              no packs yet — click <kbd>+ new pack</kbd> to create one.
            </div>
            <div class="styles-error" id="styles-error" hidden></div>
          </aside>
          <div id="canvas-pane">
            <div id="canvas"></div>
          </div>
        </div>
      </div>

      <footer class="shell-footer">
        <span class="hint" id="hint"></span>
        <span class="footer-status" id="footer-status"></span>
      </footer>

      <div class="brand-footer">
        sideframer · DFT diagrams · <a href="#" data-page="design-system">components</a> · <a href="#" data-page="help">help</a>
      </div>
    </div>

    <div class="page-overlay" id="page-overlay" hidden role="dialog" aria-modal="true">
      <header class="page-overlay-bar">
        <h1 class="page-overlay-title" id="page-overlay-title"></h1>
        <span class="page-overlay-hint">press <kbd>esc</kbd> to close</span>
        <button type="button" class="page-overlay-close" id="page-overlay-close" title="close (esc)">×</button>
      </header>
      <div class="page-overlay-body" id="page-overlay-body"></div>
    </div>

    <aside class="inspector" id="inspector" hidden>
      <div class="field" id="shape-field">
        <span>shape</span>
        <div class="shape-grid" id="shape-grid">
          ${SHAPES.map((s) => `<button type="button" data-shape="${s}" title="${s}">${shapeIconSvg(s)}</button>`).join("")}
        </div>
      </div>
      <label class="field">
        <span>label</span>
        <input id="box-label-input" type="text" />
      </label>
      <label class="field">
        <span>sublabel</span>
        <input id="box-sublabel-input" type="text" />
      </label>
      <label class="field" id="box-style-field">
        <span>style</span>
        <select id="box-style-select"></select>
      </label>
      <div class="inspector-footer" id="inspector-footer">
        <button id="box-delete" class="btn danger">delete</button>
      </div>
    </aside>
  `;

  shellEl = document.querySelector<HTMLElement>("#shell")!;
  canvas = document.querySelector<HTMLDivElement>("#canvas")!;
  inspector = document.querySelector<HTMLElement>("#inspector")!;
  sceneInput = document.querySelector<HTMLInputElement>("#scene-input")!;
  shapeField = document.querySelector<HTMLElement>("#shape-field")!;
  inspectorFooter = document.querySelector<HTMLElement>("#inspector-footer")!;
  boxLabelInput = document.querySelector<HTMLInputElement>("#box-label-input")!;
  boxSublabelInput = document.querySelector<HTMLInputElement>("#box-sublabel-input")!;
  shapeGrid = document.querySelector<HTMLDivElement>("#shape-grid")!;
  modeSeg = document.querySelector<HTMLDivElement>("#mode-seg")!;
  hintSpan = document.querySelector<HTMLSpanElement>("#hint")!;
  galleryList = document.querySelector<HTMLUListElement>("#gallery-list")!;
  galleryEmpty = document.querySelector<HTMLDivElement>("#gallery-empty")!;
  galleryError = document.querySelector<HTMLDivElement>("#gallery-error")!;
  galleryCount = document.querySelector<HTMLSpanElement>("#gallery-count")!;
  stylesList = document.querySelector<HTMLUListElement>("#styles-list")!;
  stylesEmpty = document.querySelector<HTMLDivElement>("#styles-empty")!;
  stylesError = document.querySelector<HTMLDivElement>("#styles-error")!;
  stylesCount = document.querySelector<HTMLSpanElement>("#styles-count")!;
  canvasPackSelect = document.querySelector<HTMLSelectElement>("#canvas-pack-select")!;
  objectPackSelect = document.querySelector<HTMLSelectElement>("#object-pack-select")!;
  boxStyleSelect = document.querySelector<HTMLSelectElement>("#box-style-select")!;
  pageOverlay = document.querySelector<HTMLDivElement>("#page-overlay")!;
  pageBody = document.querySelector<HTMLDivElement>("#page-overlay-body")!;
  pageTitle = document.querySelector<HTMLElement>("#page-overlay-title")!;

  Object.assign(state, decodeStateFromHash() ?? loadDraft() ?? {});
  normalizeState();

  sceneInput.value = state.scene;

  // Mode precedence: URL hash > derived default (view if non-empty, draw if empty).
  currentMode = decodeModeFromHash()
    ?? (state.boxes.length > 0 || state.connectors.length > 0 ? "view" : "draw");

  wireEvents();
  setMode(currentMode);
  render();
  // Apply any style bindings the restored draft/hash carried.
  void applyBindings();

  // Restore overlay page from URL (e.g. landing on #p=design-system).
  const initialPage = decodePageFromHash();
  if (initialPage) setPage(initialPage);

  // Load-from-query on boot — agent-generated URLs use ?load=mutable://diagrams/...
  (async () => {
    const params = new URLSearchParams(location.search);
    const loadUri = params.get("load");
    if (!loadUri) return;
    try {
      const rec = await diagramStore.load(loadUri);
      if (rec) {
        loadDiagramState(rec.diagram as Partial<DiagramState>);
        setMode("view");
      }
    } catch (err) {
      console.warn(`load from ?load=${loadUri} failed`, err);
    }
  })();
}

const HINTS: Record<Mode, string> = {
  gallery: "gallery — saved diagrams · click a tile to open · g / v / d / c / s switch modes",
  view: "view — read-only · g / v / d / c / s switch modes",
  draw: "draw — click empty canvas to add a box · drag to move · click center to edit/move it · esc / g / v / c / s switch modes",
  connect: "connect — click two boxes (or the center) to link them · esc / g / v / d / s switch modes",
  styles: "styles — pick a pack to edit · click ↻ apply to bind the current diagram · g / v / d / c switch modes",
};

function setMode(m: Mode): void {
  const modeChanged = m !== currentMode;
  const prevMode = currentMode;
  currentMode = m;
  connectFrom = null;
  if (m !== "draw") {
    selectedId = null;
    selectedCenter = false;
    inspector.hidden = true;
  }
  if (m === "view" || m === "gallery") selectedConnectorId = null;
  shellEl.dataset.mode = m;
  updateModeUI();
  // Push a new history entry only when the user changes mode and the hash
  // doesn't already reflect it (so hashchange-driven setMode doesn't double-push).
  if (modeChanged && decodeModeFromHash() !== m) {
    try {
      history.pushState(null, "", currentHashUrl());
    } catch {
      // ignore security/quota errors
    }
  }
  if (m === "gallery") refreshGallery();
  if (m === "styles") refreshStylesPane();
  if (m === "draw") refreshDiagramPackPickers();
  // Leaving styles: discard any unsaved live-preview edits by closing the
  // editor, which re-applies the bound pack.
  if (prevMode === "styles" && m !== "styles") closeStyleEditor();
  render();
}

const PAGE_TITLES: Record<Page, string> = {
  "design-system": "components",
  "help": "keyboard shortcuts",
};

// Lazy-loaded full-page overlays (design system, help). Modules are
// dynamic-imported on first open so they don't bloat the main bundle.
function setPage(p: Page | null): void {
  if (p === currentPage) return;
  const pageChanged = true;
  const prev = currentPage;
  currentPage = p;
  const token = ++pageToken;

  if (p === null) {
    pageOverlay.hidden = true;
    pageBody.innerHTML = "";
    pageTitle.textContent = "";
  } else {
    pageOverlay.hidden = false;
    pageTitle.textContent = PAGE_TITLES[p];
    pageBody.innerHTML = `<div class="page-overlay-loading">loading…</div>`;
    loadPageModule(p).then((render) => {
      if (token !== pageToken) return;
      render(pageBody);
    }).catch((err) => {
      if (token !== pageToken) return;
      pageBody.innerHTML = `<div class="page-overlay-error">failed to load page</div>`;
      console.warn(`load page ${p} failed`, err);
    });
    // Reset scroll so a long page doesn't open mid-way through.
    pageOverlay.scrollTop = 0;
  }

  if (pageChanged && decodePageFromHash() !== p) {
    try {
      // Opening a page pushes a new entry; closing it (p === null) replaces,
      // because closing is logically a return, not a forward navigation.
      if (p === null && prev) {
        history.replaceState(null, "", currentHashUrl());
      } else {
        history.pushState(null, "", currentHashUrl());
      }
    } catch {
      // ignore security/quota errors
    }
  }
}

function loadPageModule(p: Page): Promise<(root: HTMLElement) => void> {
  if (p === "design-system") {
    return import("./lib/design-system.ts").then(({ renderDesignSystem }) =>
      (root: HTMLElement) => renderDesignSystem(root, {
        renderShape, shapeIconSvg, buildPreviewSVG, SHAPES,
      })
    );
  }
  return import("./lib/help-page.ts").then(({ renderHelpPage }) =>
    (root: HTMLElement) => renderHelpPage(root)
  );
}

function updateModeUI(): void {
  modeSeg.querySelectorAll("button[data-mode]").forEach((b) => {
    const btn = b as HTMLButtonElement;
    btn.classList.toggle("active", btn.dataset.mode === currentMode);
  });
  hintSpan.textContent = HINTS[currentMode];
}

function wireEvents(): void {
  sceneInput.addEventListener("input", () => { state.scene = sceneInput.value; render(); });

  shapeGrid.addEventListener("click", (e) => {
    const btn = (e.target as Element).closest("button[data-shape]") as HTMLButtonElement | null;
    if (!btn || !selectedId) return;
    const box = state.boxes.find((b) => b.id === selectedId);
    if (!box) return;
    box.shape = btn.dataset.shape as Shape;
    render();
    // Hand focus back to the label so the user can keep typing without
    // having to click the input again after picking a shape.
    boxLabelInput.focus();
    boxLabelInput.select();
  });

  // Backspace/Delete in the label input with an empty value deletes the box,
  // matching the shortcut you'd otherwise hit with the canvas focused.
  const onLabelDeleteKey = (e: KeyboardEvent) => {
    if (e.key !== "Backspace" && e.key !== "Delete") return;
    const input = e.currentTarget as HTMLInputElement;
    if (input.value !== "") return;
    if (selectedCenter) return; // center can't be deleted
    if (!selectedId) return;
    e.preventDefault();
    deleteSelected();
  };
  boxLabelInput.addEventListener("keydown", onLabelDeleteKey);

  modeSeg.addEventListener("click", (e) => {
    const btn = (e.target as Element).closest("button[data-mode]") as HTMLButtonElement | null;
    if (!btn) return;
    setMode(btn.dataset.mode as Mode);
  });

  document.querySelector<HTMLButtonElement>("#copy-png")!.addEventListener("click", copyPNG);
  document.querySelector<HTMLButtonElement>("#new-diagram")!.addEventListener("click", newDiagram);
  document.querySelector<HTMLButtonElement>("#box-delete")!.addEventListener("click", deleteSelected);
  boxLabelInput.addEventListener("input", updateSelectedFromInputs);
  boxSublabelInput.addEventListener("input", updateSelectedFromInputs);

  document.querySelector<HTMLButtonElement>("#gallery-refresh")!
    .addEventListener("click", () => refreshGallery());

  document.querySelector<HTMLButtonElement>("#styles-refresh")!
    .addEventListener("click", () => refreshStylesPane());
  document.querySelector<HTMLButtonElement>("#styles-new-canvas")!
    .addEventListener("click", () => newStylePack("canvas"));
  document.querySelector<HTMLButtonElement>("#styles-new-object")!
    .addEventListener("click", () => newStylePack("object"));

  stylesList.addEventListener("click", (e) => {
    // Clicks inside the editor area (inputs, buttons) shouldn't toggle the row.
    if ((e.target as Element).closest(".style-row-editor")) return;
    const li = (e.target as Element).closest("li.style-row") as HTMLLIElement | null;
    if (!li) return;
    const uri = li.dataset.uri || "";
    if (!uri) return;        // unsaved new row — already open
    void openPackInRow(uri);
  });

  canvasPackSelect.addEventListener("change", () => {
    state.canvasStyleUri = canvasPackSelect.value || null;
    saveDraft();
    void applyBindings();
  });
  objectPackSelect.addEventListener("change", () => {
    state.objectStyleUri = objectPackSelect.value || null;
    saveDraft();
    void applyBindings();
  });
  boxStyleSelect.addEventListener("change", async () => {
    if (!selectedId) return;
    const box = state.boxes.find((b) => b.id === selectedId);
    if (!box) return;
    box.styleUri = boxStyleSelect.value || null;
    if (box.styleUri) await ensureObjectPackCached(box.styleUri);
    render();
  });

  document.querySelector<HTMLButtonElement>("#save-diagram")!
    .addEventListener("click", async () => {
      const btn = document.querySelector<HTMLButtonElement>("#save-diagram")!;
      const orig = btn.textContent;
      btn.disabled = true;
      btn.textContent = "saving…";
      try {
        const now = Date.now();
        if (typeof state.createdAt !== "number") state.createdAt = now;
        state.updatedAt = now;
        const rec = await diagramStore.save(state);
        btn.textContent = `saved · ${rec.slug.slice(0, 24)}${rec.slug.length > 24 ? "…" : ""}`;
        if (currentMode === "gallery") refreshGallery();
      } catch (err) {
        btn.textContent = "save failed";
        console.warn("save failed", err);
      }
      setTimeout(() => {
        btn.disabled = false;
        btn.textContent = orig;
      }, 1800);
    });

  galleryList.addEventListener("click", async (e) => {
    const li = (e.target as Element).closest("li.gallery-tile") as HTMLLIElement | null;
    if (!li || !li.dataset.uri) return;
    try {
      const rec = await diagramStore.load(li.dataset.uri);
      if (rec) {
        loadDiagramState(rec.diagram as Partial<DiagramState>);
        setMode("view");
        window.scrollTo({ top: 0, left: 0, behavior: "auto" });
      }
    } catch (err) {
      console.warn("load failed", err);
    }
  });

  document.querySelector<HTMLButtonElement>("#message-bar-dismiss")
    ?.addEventListener("click", () => hideMessage());

  document.addEventListener("keydown", (e) => {
    const active = document.activeElement;
    const typing = active && (active.tagName === "INPUT" || active.tagName === "TEXTAREA");
    // Esc: close overlay page first, otherwise fall back to mode reset.
    if (e.key === "Escape") {
      if (active instanceof HTMLElement) active.blur();
      if (currentPage) { setPage(null); return; }
      setMode("view");
      return;
    }
    // Page shortcuts (?, >) — work from anywhere except text inputs.
    if (!typing && !e.metaKey && !e.ctrlKey && !e.altKey) {
      if (e.key === "?") { setPage("help"); return; }
      if (e.key === ">") { setPage("design-system"); return; }
    }
    // Below: anything that depends on the underlying diagrammer should not
    // fire while an overlay page is showing.
    if (currentPage) return;
    if (!typing && (e.key === "Backspace" || e.key === "Delete")) {
      if (selectedId) {
        e.preventDefault();
        deleteSelected();
      } else if (selectedConnectorId) {
        e.preventDefault();
        deleteSelectedConnector();
      }
    }
    if (!typing && !e.metaKey && !e.ctrlKey && !e.altKey) {
      if (e.key === "g" || e.key === "G") { setMode("gallery"); return; }
      if (e.key === "v" || e.key === "V") { setMode("view"); return; }
      if (e.key === "d" || e.key === "D") { setMode("draw"); return; }
      if (e.key === "c" || e.key === "C") { setMode("connect"); return; }
      if (e.key === "s" || e.key === "S") { setMode("styles"); return; }
    }
  });

  document.querySelector<HTMLButtonElement>("#page-overlay-close")
    ?.addEventListener("click", () => setPage(null));

  document.querySelectorAll<HTMLAnchorElement>("a[data-page]").forEach((a) => {
    a.addEventListener("click", (e) => {
      e.preventDefault();
      const p = a.dataset.page as Page;
      if (PAGES.includes(p)) setPage(p);
    });
  });

  window.addEventListener("hashchange", () => {
    // Legacy redirect: old standalone routes used "#design-system" / "#help".
    if (location.hash === "#design-system") {
      history.replaceState(null, "", "#p=design-system");
      setPage("design-system");
      return;
    }
    if (location.hash === "#help") {
      history.replaceState(null, "", "#p=help");
      setPage("help");
      return;
    }
    // Sync page and mode FIRST so that any rendering triggered by
    // loadDiagramState reflects the new currentPage / currentMode when it
    // calls writeStateToHash — otherwise it'd re-encode stale state into
    // the URL and undo a back/forward navigation.
    const pageFromHash = decodePageFromHash();
    if (pageFromHash !== currentPage) setPage(pageFromHash);
    const modeFromHash = decodeModeFromHash();
    if (modeFromHash && modeFromHash !== currentMode) setMode(modeFromHash);
    const fromHash = decodeStateFromHash();
    if (fromHash) loadDiagramState(fromHash);
  });

  window.addEventListener("scroll", positionInspector, true);
  window.addEventListener("resize", positionInspector);
}

function loadDiagramState(newState: Partial<DiagramState>): void {
  // Reset to defaults first so fields absent from the new diagram (e.g. an
  // older save that pre-dates centerX/centerY/gradientFrom/etc.) don't leak
  // in from the previously loaded diagram.
  state.scene = "perspective";
  state.centerLabel = "the system";
  state.centerSublabel = "";
  state.centerX = CENTER_X_DEFAULT;
  state.centerY = CENTER_Y_DEFAULT;
  state.boxes = [];
  state.connectors = [];
  state.canvasStyleUri = null;
  state.objectStyleUri = null;
  delete state.createdAt;
  delete state.updatedAt;
  Object.assign(state, newState);
  // Legacy migration: a pre-split diagram with `styleUri` is treated as
  // the default object pack. Drop the old field so the URL/hash stays clean.
  const legacy = (state as unknown as { styleUri?: string | null }).styleUri;
  if (typeof legacy === "string" && !state.objectStyleUri) {
    state.objectStyleUri = legacy;
  }
  delete (state as unknown as { styleUri?: string | null }).styleUri;
  normalizeState();
  sceneInput.value = state.scene;
  selectedId = null;
  selectedConnectorId = null;
  selectedCenter = false;
  connectFrom = null;
  render();
  void applyBindings();
}

// Apply the current diagram's style bindings: the canvas pack
// (`state.canvasStyleUri`), the default object pack (`state.objectStyleUri`),
// and any per-box object packs (`box.styleUri`). Packs are merged over the
// built-in defaults so an incomplete pack still renders. Per-box packs are
// cached so the synchronous renderer can resolve them without awaiting.
async function applyBindings(): Promise<void> {
  activeCanvasTokens = { ...DEFAULT_CANVAS_TOKENS };
  activeObjectTokens = { ...DEFAULT_OBJECT_TOKENS };
  objectPackCache.clear();

  const tasks: Promise<void>[] = [];

  if (state.canvasStyleUri) {
    tasks.push(loadAndMerge(state.canvasStyleUri, (pack) => {
      mergeIntoCanvasTokens(pack, activeCanvasTokens);
    }));
  }
  if (state.objectStyleUri) {
    tasks.push(loadAndMerge(state.objectStyleUri, (pack) => {
      mergeIntoObjectTokens(pack, activeObjectTokens);
    }));
  }
  const uniqueBoxUris = new Set<string>();
  for (const b of state.boxes) if (b.styleUri) uniqueBoxUris.add(b.styleUri);
  for (const uri of uniqueBoxUris) {
    tasks.push(loadAndMerge(uri, (pack) => {
      const target: ObjectTokens = { ...DEFAULT_OBJECT_TOKENS };
      mergeIntoObjectTokens(pack, target);
      objectPackCache.set(uri, target);
    }));
  }

  await Promise.all(tasks);
  if (canvas) render();
}

async function loadAndMerge(uri: string, apply: (pack: StylePack) => void): Promise<void> {
  try {
    const rec = await styleStore.load(uri);
    if (rec) apply(rec.pack);
  } catch (err) {
    console.warn("[sideframer] style load failed", uri, err);
  }
}

function mergeIntoCanvasTokens(pack: StylePack, target: CanvasTokens): void {
  for (const def of CANVAS_TOKEN_DEFS) {
    const v = pack.tokens?.[def.name];
    if (typeof v === "string" && v.length > 0) {
      target[def.name] = v;
    }
  }
}

function mergeIntoObjectTokens(pack: StylePack, target: ObjectTokens): void {
  for (const def of OBJECT_TOKEN_DEFS) {
    const v = pack.tokens?.[def.name];
    if (typeof v === "string" && v.length > 0) {
      target[def.name] = v;
    }
  }
}

// Resolve which object tokens to draw a box (or the center) with: the box's
// own override if present and cached, otherwise the diagram default.
function resolveObjectTokens(box: Box): ObjectTokens {
  if (box.styleUri) {
    const cached = objectPackCache.get(box.styleUri);
    if (cached) return cached;
  }
  return activeObjectTokens;
}

// Eagerly load a single object pack into the cache (e.g., when an inspector
// changes a box's styleUri) and re-render once available.
async function ensureObjectPackCached(uri: string): Promise<void> {
  if (objectPackCache.has(uri)) return;
  try {
    const rec = await styleStore.load(uri);
    if (!rec) return;
    const target: ObjectTokens = { ...DEFAULT_OBJECT_TOKENS };
    mergeIntoObjectTokens(rec.pack, target);
    objectPackCache.set(uri, target);
  } catch (err) {
    console.warn("[sideframer] box style load failed", uri, err);
  }
}

// ---------------- Message bar ----------------

function showMessage(text: string, kind: "info" | "warn" | "ok" = "info"): void {
  const bar = document.querySelector<HTMLDivElement>("#message-bar");
  const txt = document.querySelector<HTMLSpanElement>("#message-bar-text");
  if (!bar || !txt) return;
  txt.textContent = text;
  bar.className = `message-bar ${kind}`;
  bar.hidden = false;
  shellEl.dataset.message = "1";
}

function hideMessage(): void {
  const bar = document.querySelector<HTMLDivElement>("#message-bar");
  if (!bar) return;
  bar.hidden = true;
  delete shellEl.dataset.message;
}

// Expose for ad-hoc announcements: window.sideframerMessage("beta is out", "info")
(window as unknown as { sideframerMessage?: typeof showMessage }).sideframerMessage = showMessage;

// ---------------- Gallery ----------------

async function refreshGallery(): Promise<void> {
  if (!galleryError) return;
  galleryError.hidden = true;
  const token = ++galleryToken;
  try {
    const items = await diagramStore.list();
    if (token !== galleryToken) return;
    galleryList.innerHTML = "";
    galleryEmpty.hidden = items.length > 0;
    galleryCount.textContent = items.length > 0 ? `${items.length} saved` : "";
    // Render placeholder tiles immediately (alphabetical by slug) so the user
    // sees progress, then kick off all loads in parallel. Once every load
    // finishes, sort by createdAt desc and reorder the LIs in place.
    const tiles = new Map<string, HTMLLIElement>();
    const orderedSlugs = [...items].sort((a, b) => a.slug.localeCompare(b.slug));
    for (const { uri, slug } of orderedSlugs) {
      const li = document.createElement("li");
      li.className = "gallery-tile";
      li.dataset.uri = uri;
      li.title = uri;
      li.innerHTML = `
        <div class="g-meta">
          <span class="g-slug">${esc(slug)}</span>
          <span class="g-uri">${esc(uri)}</span>
        </div>
        <div class="g-preview is-empty" data-preview>…</div>`;
      galleryList.appendChild(li);
      tiles.set(uri, li);
    }
    const loaded = await Promise.all(items.map(async ({ uri, slug }) => {
      try {
        const rec = await diagramStore.load(uri);
        if (token !== galleryToken) return { uri, slug, diagram: undefined, createdAt: 0 };
        const diagram = rec?.diagram as Partial<DiagramState> | undefined;
        const createdAt = typeof diagram?.createdAt === "number" ? diagram.createdAt : 0;
        const slot = tiles.get(uri)?.querySelector<HTMLDivElement>("[data-preview]");
        if (slot) {
          if (diagram) {
            slot.classList.remove("is-empty");
            slot.innerHTML = buildPreviewSVG(diagram);
          } else {
            slot.textContent = "no preview";
          }
        }
        return { uri, slug, diagram, createdAt };
      } catch {
        const slot = tiles.get(uri)?.querySelector<HTMLDivElement>("[data-preview]");
        if (slot) slot.textContent = "preview failed";
        return { uri, slug, diagram: undefined, createdAt: 0 };
      }
    }));
    if (token !== galleryToken) return;
    loaded.sort((a, b) => (b.createdAt - a.createdAt) || a.slug.localeCompare(b.slug));
    // Reorder existing LIs in place — appending an existing child moves it.
    for (const { uri } of loaded) {
      const li = tiles.get(uri);
      if (li) galleryList.appendChild(li);
    }
  } catch (e) {
    if (token !== galleryToken) return;
    galleryError.hidden = false;
    galleryError.textContent =
      `couldn't reach storage server (${STORAGE_SERVER}). is it running? — npm run serve`;
    galleryList.innerHTML = "";
    galleryEmpty.hidden = true;
    galleryCount.textContent = "";
    console.warn("gallery refresh failed", e);
  }
}

// ---------------- Styles mode ----------------
//
// The styles pane lists every pack with its `kind` badge. A pack's apply
// button binds it to the matching diagram-level slot (canvas or object
// default); per-box object overrides happen through the inspector. The
// editor's row layout adapts to `pack.kind` so users can't accidentally
// fill an object pack with canvas-only tokens.

let stylesToken = 0;
let editedPack: StylePack | null = null;
// URI of the pack whose row is expanded for editing. Null = no row open or
// the open row is for a not-yet-saved new pack (tracked via `editingNewKind`).
let activePackUri: string | null = null;
let editingNewKind: StyleKind | null = null;
// Cached pack records so the box-style picker and list can show pack names
// without re-fetching on each refresh. Filled by `refreshStylesPane`.
let cachedPackList: { uri: string; slug: string; name: string; kind: StyleKind }[] = [];

async function refreshStylesPane(): Promise<void> {
  if (!stylesError) return;
  stylesError.hidden = true;
  const token = ++stylesToken;
  try {
    const items = await styleStore.list();
    if (token !== stylesToken) return;
    stylesList.innerHTML = "";
    stylesEmpty.hidden = items.length > 0;
    stylesCount.textContent = items.length > 0 ? `${items.length} pack${items.length === 1 ? "" : "s"}` : "";
    const records = await Promise.all(
      items.map(({ uri }) =>
        styleStore.load(uri).catch(() => null as null)
      ),
    );
    if (token !== stylesToken) return;
    cachedPackList = [];
    // A not-yet-saved new pack appears at the top with the editor already
    // open. Its URI is empty until the first save.
    if (editingNewKind && editedPack) {
      stylesList.appendChild(buildRowLi({
        uri: "",
        kind: editingNewKind,
        name: editedPack.name,
        tokens: editedPack.tokens || {},
        bound: null,
        isOpen: true,
        isNew: true,
      }));
    }
    records.forEach((rec) => {
      if (!rec) return;
      const kind: StyleKind = rec.pack.kind === "canvas" ? "canvas" : "object";
      cachedPackList.push({ uri: rec.uri, slug: rec.slug, name: rec.name, kind });
      const isOpen = activePackUri === rec.uri;
      const sourceTokens = isOpen && editedPack ? editedPack.tokens || {} : rec.pack.tokens || {};
      const displayName = isOpen && editedPack ? editedPack.name : rec.name;
      stylesList.appendChild(buildRowLi({
        uri: rec.uri,
        kind,
        name: displayName,
        tokens: sourceTokens,
        bound: describeBinding(rec.uri, kind),
        isOpen,
        isNew: false,
      }));
    });
    wireOpenRowEditor();
    refreshDiagramPackPickers();
    refreshBoxStylePicker();
  } catch (e) {
    if (token !== stylesToken) return;
    stylesError.hidden = false;
    stylesError.textContent =
      `couldn't reach storage server (${STORAGE_SERVER}). is it running? — npm run serve`;
    stylesList.innerHTML = "";
    stylesEmpty.hidden = true;
    stylesCount.textContent = "";
    console.warn("styles refresh failed", e);
  }
}

interface RowSpec {
  uri: string;
  kind: StyleKind;
  name: string;
  tokens: Record<string, string>;
  bound: string | null;
  isOpen: boolean;
  isNew: boolean;
}

function buildRowLi(spec: RowSpec): HTMLLIElement {
  const li = document.createElement("li");
  li.className = "style-row";
  li.dataset.uri = spec.uri;
  li.dataset.kind = spec.kind;
  if (spec.isOpen) li.classList.add("is-open");
  if (spec.isNew) li.classList.add("is-new");
  if (spec.bound) li.classList.add("is-bound");
  const colorEntries = Object.entries(spec.tokens).filter(([, v]) => /^#[0-9a-fA-F]{6}$/.test(v));
  const swatches = colorEntries.slice(0, 8).map(([n, v]) =>
    `<span class="style-swatch" style="background:${esc(v)}" title="${esc(n)}: ${esc(v)}"></span>`
  ).join("");
  const uriLine = spec.isNew
    ? `<span class="style-row-uri-placeholder">unsaved · save to assign URI</span>`
    : `<div class="style-row-uri">${esc(spec.uri)}</div>`;
  li.innerHTML = `
    <div class="style-row-summary" data-role="summary">
      <div class="style-row-line1">
        <span class="style-row-kind kind-${spec.kind}">${spec.kind}</span>
        <span class="style-row-swatches">${swatches}</span>
      </div>
      <div class="style-row-name">
        ${esc(spec.name)}
        ${spec.bound ? `<span class="style-row-bound">${esc(spec.bound)}</span>` : ""}
      </div>
      ${uriLine}
    </div>
    <div class="style-row-editor">${spec.isOpen && editedPack ? renderEditorBody(editedPack, !spec.isNew) : ""}</div>
  `;
  return li;
}

// "bound (canvas)" / "bound (default)" / "bound (per-box)" or null.
function describeBinding(uri: string, kind: StyleKind): string | null {
  if (kind === "canvas" && state.canvasStyleUri === uri) return "bound · canvas";
  if (kind === "object" && state.objectStyleUri === uri) return "bound · default object";
  if (kind === "object" && state.boxes.some((b) => b.styleUri === uri)) return "bound · per-box";
  return null;
}

// HTML for the inline editor. `canApply` controls whether the "apply"
// button is rendered — false for a not-yet-saved new pack, since
// there's no URI to bind yet.
function renderEditorBody(pack: StylePack, canApply: boolean): string {
  const kind = pack.kind === "canvas" ? "canvas" : "object";
  const defs = tokenDefsFor(kind);
  const currentBgMode = pack.tokens?.bgMode ?? DEFAULT_CANVAS_TOKENS.bgMode;
  const gridClass = `style-token-grid${currentBgMode === "gradient" ? " is-gradient" : ""}`;
  const applyBtn = canApply
    ? `<button class="btn" type="button" data-editor-action="apply">↻ apply</button>`
    : "";
  return `
    <header class="style-editor-header">
      <label class="field">
        <span>pack name</span>
        <input data-editor-name type="text" value="${esc(pack.name)}"/>
      </label>
      <span class="style-editor-kind kind-${kind}">${kind} pack</span>
      <div class="style-editor-actions">
        ${applyBtn}
        <button class="btn" type="button" data-editor-action="save">save</button>
        <button class="btn-mini" type="button" data-editor-action="cancel">cancel</button>
      </div>
    </header>
    <div class="${gridClass}">
      ${defs.map((t) => {
        const v = pack.tokens?.[t.name] ?? t.default;
        const isGradientRow = t.name === "gradientFrom" || t.name === "gradientTo";
        const extraCls = isGradientRow ? " style-token-row-gradient" : "";
        if (t.control === "font") {
          const opts = FONT_FAMILY_OPTIONS.map((o) =>
            `<option value="${esc(o.value)}"${o.value === v ? " selected" : ""}>${esc(o.label)}</option>`
          ).join("");
          return `
            <label class="field style-token-row${extraCls}">
              <span>${esc(t.label)}<br><code>${esc(t.name)}</code></span>
              <select data-token="${esc(t.name)}">${opts}</select>
            </label>`;
        }
        if (t.control === "bgmode") {
          const opts = BG_MODE_OPTIONS.map((m) =>
            `<option value="${esc(m)}"${m === v ? " selected" : ""}>${esc(m)}</option>`
          ).join("");
          return `
            <label class="field style-token-row${extraCls}">
              <span>${esc(t.label)}<br><code>${esc(t.name)}</code></span>
              <select data-token="${esc(t.name)}">${opts}</select>
            </label>`;
        }
        return `
          <label class="field field-color style-token-row${extraCls}">
            <span>${esc(t.label)}<br><code>${esc(t.name)}</code></span>
            <span class="color-pair">
              <input type="color" data-token="${esc(t.name)}" data-control="color" value="${esc(v)}"/>
              <input type="text" class="hex-text" data-token="${esc(t.name)}" data-control="hex"
                     value="${esc(v)}" maxlength="7" spellcheck="false"
                     autocapitalize="off" autocomplete="off"/>
            </span>
          </label>`;
      }).join("")}
    </div>`;
}

// Wire the inputs and action buttons of the editor inside the currently
// open row. Called after every list re-render so the live-preview hooks
// always point at the visible DOM.
function wireOpenRowEditor(): void {
  const editor = stylesList.querySelector<HTMLElement>(".style-row.is-open .style-row-editor");
  if (!editor) return;
  editor.querySelectorAll<HTMLInputElement | HTMLSelectElement>("[data-token]").forEach((inp) => {
    inp.addEventListener(inp.tagName === "SELECT" ? "change" : "input", () => {
      const name = inp.dataset.token!;
      const ctrl = inp.dataset.control;
      let value = inp.value;
      if (ctrl === "hex") {
        if (!/^#[0-9a-fA-F]{6}$/.test(value)) return;        // wait for valid hex
        value = value.toLowerCase();
        const partner = editor.querySelector<HTMLInputElement>(
          `input[data-token="${name}"][data-control="color"]`,
        );
        if (partner) partner.value = value;
      } else if (ctrl === "color") {
        const partner = editor.querySelector<HTMLInputElement>(
          `input[data-token="${name}"][data-control="hex"]`,
        );
        if (partner) partner.value = value;
      }
      writeEditedToken(name, value);
    });
  });
  const nameInput = editor.querySelector<HTMLInputElement>("[data-editor-name]");
  if (nameInput) {
    nameInput.addEventListener("input", () => {
      if (editedPack) editedPack.name = nameInput.value;
    });
  }
  editor.querySelectorAll<HTMLButtonElement>("[data-editor-action]").forEach((btn) => {
    const action = btn.dataset.editorAction;
    btn.addEventListener("click", () => {
      if (action === "cancel") { closeStyleEditor(); refreshStylesPane(); }
      else if (action === "save") void saveEditedPack();
      else if (action === "apply") void applyEditedPack();
    });
  });
}

// Open an existing pack inline in its row.
async function openPackInRow(uri: string): Promise<void> {
  if (activePackUri === uri && !editingNewKind) return;       // already open
  closeStyleEditor();
  try {
    const rec = await styleStore.load(uri);
    if (!rec) { showMessage("pack not found", "warn"); return; }
    const kind: StyleKind = rec.pack.kind === "canvas" ? "canvas" : "object";
    editedPack = { name: rec.name, kind, tokens: { ...(rec.pack.tokens || {}) } };
    activePackUri = uri;
    editingNewKind = null;
    primeActiveTokensFor(editedPack);
    refreshStylesPane();
  } catch (err) {
    console.warn("load pack failed", err);
    showMessage("couldn't load pack", "warn");
  }
}

// Update the working pack and the matching active token set so the canvas
// reflects the edit immediately. Per-box overrides aren't touched — the
// editor previews against the diagram default, not specific overrides.
function writeEditedToken(name: string, value: string): void {
  if (!editedPack) return;
  if (!editedPack.tokens) editedPack.tokens = {};
  editedPack.tokens[name] = value;
  if (editedPack.kind === "canvas") {
    if ((CANVAS_TOKEN_DEFS as { name: string }[]).some((d) => d.name === name)) {
      (activeCanvasTokens as unknown as Record<string, string>)[name] = value;
    }
    // Toggle gradient-row visibility when background mode changes.
    if (name === "bgMode") {
      const grid = stylesList.querySelector(".style-row.is-open .style-token-grid");
      if (grid) grid.classList.toggle("is-gradient", value === "gradient");
    }
  } else {
    if ((OBJECT_TOKEN_DEFS as { name: string }[]).some((d) => d.name === name)) {
      (activeObjectTokens as unknown as Record<string, string>)[name] = value;
    }
  }
  if (canvas) render();
}

// Reset the relevant active tokens to defaults then apply the working pack
// over them. Used when opening the editor so the canvas matches the inputs
// even if no token has changed yet.
function primeActiveTokensFor(pack: StylePack): void {
  if (pack.kind === "canvas") {
    activeCanvasTokens = { ...DEFAULT_CANVAS_TOKENS };
    mergeIntoCanvasTokens(pack, activeCanvasTokens);
  } else {
    activeObjectTokens = { ...DEFAULT_OBJECT_TOKENS };
    mergeIntoObjectTokens(pack, activeObjectTokens);
  }
  if (canvas) render();
}

function closeStyleEditor(): void {
  editedPack = null;
  activePackUri = null;
  editingNewKind = null;
  // Revert the live preview by re-resolving every binding from state.
  void applyBindings();
}

// Save the current edits. If the pack matches whatever slot is currently
// bound (canvas or object default), re-apply so the rest of the cache
// picks up the new tokens too.
async function saveEditedPack(): Promise<void> {
  if (!editedPack) return;
  const buttons = stylesList.querySelectorAll<HTMLButtonElement>(".style-row.is-open [data-editor-action]");
  buttons.forEach((b) => { b.disabled = true; });
  try {
    const rec = await styleStore.save(editedPack);
    showMessage(`saved · ${rec.slug}`, "ok");
    editingNewKind = null;
    activePackUri = rec.uri;
    const slot = rec.pack.kind === "canvas" ? state.canvasStyleUri : state.objectStyleUri;
    if (slot === rec.uri || state.boxes.some((b) => b.styleUri === rec.uri)) {
      await applyBindings();
    }
    refreshStylesPane();
  } catch (err) {
    console.warn("save style pack failed", err);
    showMessage("save failed", "warn");
  } finally {
    buttons.forEach((b) => { b.disabled = false; });
  }
}

// Save and bind in one click — the user-visible "apply" button. For a
// new pack this assigns it a URI then binds; for an existing pack it
// persists the edits and binds to the matching slot.
async function applyEditedPack(): Promise<void> {
  if (!editedPack) return;
  const buttons = stylesList.querySelectorAll<HTMLButtonElement>(".style-row.is-open [data-editor-action]");
  buttons.forEach((b) => { b.disabled = true; });
  try {
    const rec = await styleStore.save(editedPack);
    showMessage(`saved · ${rec.slug}`, "ok");
    editingNewKind = null;
    activePackUri = rec.uri;
    const matchingSlot: "canvasStyleUri" | "objectStyleUri" =
      rec.pack.kind === "canvas" ? "canvasStyleUri" : "objectStyleUri";
    state[matchingSlot] = rec.uri;
    saveDraft();
    await applyBindings();
    refreshDiagramPackPickers();
    refreshStylesPane();
    showMessage(`bound · ${rec.slug} (${rec.pack.kind})`, "ok");
  } catch (err) {
    console.warn("apply failed", err);
    showMessage("apply failed", "warn");
  } finally {
    buttons.forEach((b) => { b.disabled = false; });
  }
}

function newStylePack(kind: StyleKind): void {
  // Close any open row first so only one editor shows at a time.
  closeStyleEditor();
  const defs = tokenDefsFor(kind);
  editedPack = {
    name: `new ${kind} pack`,
    kind,
    tokens: Object.fromEntries(defs.map((d) => [d.name, d.default])),
  };
  editingNewKind = kind;
  activePackUri = null;
  primeActiveTokensFor(editedPack);
  refreshStylesPane();
}

async function refreshDiagramPackPickers(): Promise<void> {
  if (!canvasPackSelect || !objectPackSelect) return;
  // Prefer cache if populated; otherwise fetch the list once.
  let packs = cachedPackList;
  if (packs.length === 0) {
    try {
      const items = await styleStore.list();
      const records = await Promise.all(items.map(({ uri }) =>
        styleStore.load(uri).catch(() => null as null)
      ));
      packs = records.filter((r): r is NonNullable<typeof r> => r != null).map((r) => ({
        uri: r.uri, slug: r.slug, name: r.name,
        kind: (r.pack.kind === "canvas" ? "canvas" : "object") as StyleKind,
      }));
      cachedPackList = packs;
    } catch (err) {
      console.warn("refresh pack pickers failed", err);
      canvasPackSelect.innerHTML = `<option value="">(unable to load)</option>`;
      objectPackSelect.innerHTML = `<option value="">(unable to load)</option>`;
      return;
    }
  }
  populatePackSelect(canvasPackSelect, packs.filter((p) => p.kind === "canvas"), state.canvasStyleUri);
  populatePackSelect(objectPackSelect, packs.filter((p) => p.kind === "object"), state.objectStyleUri);
  refreshBoxStylePicker();
}

function populatePackSelect(
  sel: HTMLSelectElement,
  packs: { uri: string; slug: string; name: string }[],
  bound: string | null | undefined,
): void {
  const opts = [`<option value="">(none)</option>`];
  const known = new Set<string>(packs.map((p) => p.uri));
  for (const { uri, name } of packs) {
    opts.push(`<option value="${esc(uri)}">${esc(name)}</option>`);
  }
  if (bound && !known.has(bound)) {
    opts.push(`<option value="${esc(bound)}">(unknown · ${esc(styleNs.slugFromUri(bound))})</option>`);
  }
  sel.innerHTML = opts.join("");
  sel.value = bound || "";
}

// Inspector picker — shows object packs plus "(diagram default)".
function refreshBoxStylePicker(): void {
  if (!boxStyleSelect) return;
  const box = selectedId ? state.boxes.find((b) => b.id === selectedId) : null;
  const objectPacks = cachedPackList.filter((p) => p.kind === "object");
  const opts = [`<option value="">(diagram default)</option>`];
  const known = new Set<string>(objectPacks.map((p) => p.uri));
  for (const p of objectPacks) opts.push(`<option value="${esc(p.uri)}">${esc(p.name)}</option>`);
  const current = box?.styleUri || "";
  if (current && !known.has(current)) {
    opts.push(`<option value="${esc(current)}">(unknown · ${esc(styleNs.slugFromUri(current))})</option>`);
  }
  boxStyleSelect.innerHTML = opts.join("");
  boxStyleSelect.value = current;
}

function buildPreviewSVG(d: Partial<DiagramState>): string {
  const boxes: Box[] = Array.isArray(d.boxes) ? d.boxes : [];
  const connectors: Connector[] = Array.isArray(d.connectors) ? d.connectors : [];
  const cx = typeof d.centerX === "number" ? d.centerX : CENTER_X_DEFAULT;
  const cy = typeof d.centerY === "number" ? d.centerY : CENTER_Y_DEFAULT;
  const center = { x: cx, y: cy, w: CENTER_W, h: CENTER_H };
  const endpoint = (id: string) => {
    if (id === CENTER_ID) return center;
    const b = boxes.find((x) => x.id === id);
    return b ? { x: b.x, y: b.y, w: b.w, h: b.h } : null;
  };
  const lines = connectors.map((c) => {
    const from = endpoint(c.from);
    const to = endpoint(c.to);
    if (!from || !to) return "";
    const start = rectBoundary(from, to.x + to.w / 2, to.y + to.h / 2);
    const end = rectBoundary(to, from.x + from.w / 2, from.y + from.h / 2);
    return `<line x1="${start.x}" y1="${start.y}" x2="${end.x}" y2="${end.y}" stroke="#8a8678" stroke-width="3"/>`;
  }).join("");
  const shapes = boxes.map((b) =>
    renderShape(b, "#2a2a28", "#2a2a28", 2)
  ).join("");
  return `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${CANVAS_W} ${CANVAS_H}" preserveAspectRatio="xMidYMid meet">
  <rect x="0" y="0" width="${CANVAS_W}" height="${CANVAS_H}" fill="#fbfaf6"/>
  <rect x="${PAD}" y="${PAD}" width="${CANVAS_W - 2 * PAD}" height="${CANVAS_H - 2 * PAD}"
        fill="none" stroke="#dcd6c4" stroke-width="3" rx="6"/>
  ${lines}
  <rect x="${center.x}" y="${center.y}" width="${center.w}" height="${center.h}"
        fill="#ffffff" stroke="#2a2a28" stroke-width="3" rx="8"/>
  ${shapes}
</svg>`;
}

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
  return x >= state.centerX && x <= state.centerX + CENTER_W &&
    y >= state.centerY && y <= state.centerY + CENTER_H;
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

function findEndpoint(id: string): { x: number; y: number; w: number; h: number } | null {
  if (id === CENTER_ID) {
    return { x: state.centerX, y: state.centerY, w: CENTER_W, h: CENTER_H };
  }
  const box = state.boxes.find((b) => b.id === id);
  if (!box) return null;
  if (box.shape === "user") {
    const m = userFigureMetrics(box);
    const halfW = Math.max(m.armSpan, m.headR);
    const cx = box.x + box.w / 2;
    return { x: cx - halfW, y: box.y, w: halfW * 2, h: box.h };
  }
  return { x: box.x, y: box.y, w: box.w, h: box.h };
}

function userFigureMetrics(b: Box): {
  figureH: number; headR: number; armSpan: number; legSpan: number;
} {
  const figureH = b.h * 0.62;
  const headR = Math.min(figureH * 0.2, b.w * 0.18);
  const armSpan = Math.min(figureH * 0.3, b.w * 0.36);
  const legSpan = Math.min(figureH * 0.22, b.w * 0.24);
  return { figureH, headR, armSpan, legSpan };
}

function rectBoundary(r: { x: number; y: number; w: number; h: number }, toX: number, toY: number): { x: number; y: number } {
  const cx = r.x + r.w / 2;
  const cy = r.y + r.h / 2;
  const dx = toX - cx;
  const dy = toY - cy;
  if (dx === 0 && dy === 0) return { x: cx, y: cy };
  const halfW = r.w / 2;
  const halfH = r.h / 2;
  const tx = dx === 0 ? Infinity : halfW / Math.abs(dx);
  const ty = dy === 0 ? Infinity : halfH / Math.abs(dy);
  const t = Math.min(tx, ty);
  return { x: cx + t * dx, y: cy + t * dy };
}

// ---------------- Render ----------------

function render(): void {
  if (!canvas) return;
  canvas.innerHTML = buildSVG();
  bindCanvasEvents();
  syncInspector();
  saveDraft();
  writeStateToHash();
}

function buildSVG(): string {
  const C = activeCanvasTokens;
  // The center uses the diagram's default object pack, never a per-box
  // override (the centerpiece isn't a Box).
  const centerObj = activeObjectTokens;
  const sceneStr = state.scene ? `scene:  ${esc(state.scene)}` : "";
  const centerConnectSource = currentMode === "connect" && connectFrom === CENTER_ID;
  const centerSel = selectedCenter;
  const centerStroke = centerSel ? "#3b82f6" : centerConnectSource ? "#10b981" : centerObj.stroke;
  const centerSw = centerSel ? 3 : 2.5;
  const centerDashed = centerConnectSource;
  const ff = esc(C.fontFamily);
  return `
<svg id="svg-root" class="mode-${currentMode}" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${CANVAS_W} ${CANVAS_H}" width="${CANVAS_W}" height="${CANVAS_H}">
  <style>
    .axis { font: 600 12px ${ff}; letter-spacing: 4px; fill: ${C.axisInk}; }
    .scene-line { font: 13px ${ff}; fill: ${C.axisInk}; letter-spacing: 0.5px; }
  </style>
  <defs>
    <marker id="arrow" viewBox="-10 -5 10 10" refX="0" refY="0" markerWidth="10" markerHeight="10" orient="auto">
      <path d="M-10,-5 L0,0 L-10,5 Z" fill="${centerObj.arrowFill}"/>
    </marker>
    <marker id="arrow-sel" viewBox="-10 -5 10 10" refX="0" refY="0" markerWidth="10" markerHeight="10" orient="auto">
      <path d="M-10,-5 L0,0 L-10,5 Z" fill="#3b82f6"/>
    </marker>
  </defs>

  ${renderBackground()}

  <rect class="frame" x="${PAD}" y="${PAD}"
        width="${CANVAS_W - 2 * PAD}" height="${CANVAS_H - 2 * PAD}"
        fill="none" stroke="${C.frameStroke}" stroke-width="2" rx="6"/>

  <text class="axis" x="${CANVAS_W / 2}" y="${PAD - 30}" text-anchor="middle">DEPENDENCIES</text>
  <text class="axis" x="${CANVAS_W / 2}" y="${CANVAS_H - PAD + 48}" text-anchor="middle">SIDE-EFFECTS</text>
  <text class="axis" x="${PAD - 38}" y="${CANVAS_H / 2}" text-anchor="middle"
        transform="rotate(-90, ${PAD - 38}, ${CANVAS_H / 2})">INPUT</text>
  <text class="axis" x="${CANVAS_W - PAD + 38}" y="${CANVAS_H / 2}" text-anchor="middle"
        transform="rotate(90, ${CANVAS_W - PAD + 38}, ${CANVAS_H / 2})">OUTPUT</text>

  <text class="scene-line" x="${PAD}" y="${PAD - 56}">${sceneStr}</text>

  ${state.connectors.map(renderConnector).filter(Boolean).join("\n")}

  <g class="center" data-target="center" data-id="${CENTER_ID}">
    ${renderShape(
      { id: CENTER_ID, label: "", sublabel: "", shape: CENTER_SHAPE,
        x: state.centerX, y: state.centerY, w: CENTER_W, h: CENTER_H },
      centerObj.fill, centerStroke, centerSw, centerDashed,
    )}
    <text x="${state.centerX + CENTER_W / 2}"
          y="${state.centerY + CENTER_H / 2 - (state.centerSublabel ? 10 : 0)}"
          text-anchor="middle" dominant-baseline="middle"
          style="font: 600 22px ${ff}; fill: ${centerObj.ink};">${esc(state.centerLabel)}</text>
    ${state.centerSublabel
      ? `<text x="${state.centerX + CENTER_W / 2}" y="${state.centerY + CENTER_H / 2 + 18}"
            text-anchor="middle" dominant-baseline="middle"
            style="font: 14px ${ff}; fill: ${centerObj.muteInk};">${esc(state.centerSublabel)}</text>`
      : ""}
  </g>

  ${state.boxes.map(renderBox).join("\n")}
</svg>`;
}

function renderBackground(): string {
  const T = activeCanvasTokens;
  switch (T.bgMode) {
    case "clean":
      return `<rect width="100%" height="100%" fill="${T.bg}"/>`;
    case "grid":
      return `
        <defs>
          <pattern id="bg-grid" width="24" height="24" patternUnits="userSpaceOnUse">
            <path d="M 24 0 L 0 0 0 24" fill="none" stroke="#eee8dc" stroke-width="1"/>
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="${T.bg}"/>
        <rect width="100%" height="100%" fill="url(#bg-grid)"/>`;
    case "sections": {
      const cx = state.centerX;
      return `
        <rect width="100%" height="100%" fill="${T.bg}"/>
        <rect x="0" y="0" width="${cx}" height="${CANVAS_H}" fill="#f4eddc" opacity="0.55"/>
        <rect x="${cx + CENTER_W}" y="0" width="${CANVAS_W - cx - CENTER_W}" height="${CANVAS_H}" fill="#f4eddc" opacity="0.55"/>
        <line x1="${cx}" y1="${PAD}" x2="${cx}" y2="${CANVAS_H - PAD}" stroke="#d4ceb8" stroke-width="1" stroke-dasharray="3 6"/>
        <line x1="${cx + CENTER_W}" y1="${PAD}" x2="${cx + CENTER_W}" y2="${CANVAS_H - PAD}" stroke="#d4ceb8" stroke-width="1" stroke-dasharray="3 6"/>`;
    }
    case "diagonals":
      return `
        <rect width="100%" height="100%" fill="${T.bg}"/>
        <line x1="${PAD}" y1="${PAD}" x2="${CANVAS_W - PAD}" y2="${CANVAS_H - PAD}" stroke="#dcd6c4" stroke-width="1"/>
        <line x1="${CANVAS_W - PAD}" y1="${PAD}" x2="${PAD}" y2="${CANVAS_H - PAD}" stroke="#dcd6c4" stroke-width="1"/>`;
    case "gradient": {
      const gcx = state.centerX + CENTER_W / 2;
      const gcy = state.centerY + CENTER_H / 2;
      const gr = Math.max(
        Math.hypot(gcx, gcy),
        Math.hypot(CANVAS_W - gcx, gcy),
        Math.hypot(gcx, CANVAS_H - gcy),
        Math.hypot(CANVAS_W - gcx, CANVAS_H - gcy),
      );
      return `
        <defs>
          <radialGradient id="bg-grad" cx="${gcx}" cy="${gcy}" r="${gr}" fx="${gcx}" fy="${gcy}" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stop-color="${esc(T.gradientFrom)}"/>
            <stop offset="100%" stop-color="${esc(T.gradientTo)}"/>
          </radialGradient>
        </defs>
        <rect width="100%" height="100%" fill="url(#bg-grad)"/>`;
    }
    default:
      return `<rect width="100%" height="100%" fill="${T.bg}"/>`;
  }
}

function renderBox(b: Box): string {
  const T = resolveObjectTokens(b);
  const ff = esc(activeCanvasTokens.fontFamily);
  const sel = b.id === selectedId;
  const isConnectSource = currentMode === "connect" && connectFrom === b.id;
  const stroke = sel ? "#3b82f6" : isConnectSource ? "#10b981" : T.stroke;
  const sw = sel ? 2.5 : 1.5;
  const labelBelow = b.shape === "user";
  const labelY = labelBelow
    ? b.y + b.h - (b.sublabel ? 18 : 8)
    : b.y + b.h / 2 - (b.sublabel ? 8 : 0);
  const sublabelY = labelBelow ? b.y + b.h - 4 : b.y + b.h / 2 + 12;
  return `<g class="box" data-id="${b.id}">
    ${renderShape(b, T.fill, stroke, sw, isConnectSource)}
    <text x="${b.x + b.w / 2}" y="${labelY}"
          text-anchor="middle" dominant-baseline="middle"
          style="font: 600 14px ${ff}; fill: ${T.ink};">${esc(b.label)}</text>
    ${b.sublabel
      ? `<text x="${b.x + b.w / 2}" y="${sublabelY}"
            text-anchor="middle" dominant-baseline="middle"
            style="font: 12px ${ff}; fill: ${T.muteInk};">${esc(b.sublabel)}</text>`
      : ""}
  </g>`;
}

function renderShape(b: Box, fill: string, stroke: string, sw: number, dashed = false): string {
  const { x, y, w, h } = b;
  const dash = dashed ? ` stroke-dasharray="6 4"` : "";
  const a = `fill="${fill}" stroke="${stroke}" stroke-width="${sw}"${dash}`;
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
      const eh = Math.min(10, Math.max(3, h * 0.2));
      return `<path d="M ${x},${y + eh} L ${x},${y + h - eh} C ${x},${y + h + eh * 0.5} ${x + w},${y + h + eh * 0.5} ${x + w},${y + h - eh} L ${x + w},${y + eh} Z" ${a}/>
        <ellipse cx="${x + w / 2}" cy="${y + eh}" rx="${w / 2}" ry="${eh}" ${a}/>`;
    }
    case "server": {
      const sOff = Math.min(13, Math.max(4, h * 0.22));
      const cOff = Math.min(7, Math.max(3, h * 0.12));
      return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="2" ${a}/>
        <line x1="${x}" y1="${y + sOff}" x2="${x + w}" y2="${y + sOff}" stroke="${stroke}" stroke-width="${sw}" opacity="0.5"/>
        <line x1="${x}" y1="${y + h - sOff}" x2="${x + w}" y2="${y + h - sOff}" stroke="${stroke}" stroke-width="${sw}" opacity="0.5"/>
        <circle cx="${x + w - 10}" cy="${y + cOff}" r="1.5" fill="${stroke}"/>
        <circle cx="${x + w - 16}" cy="${y + cOff}" r="1.5" fill="${stroke}"/>
        <circle cx="${x + w - 10}" cy="${y + h - cOff}" r="1.5" fill="${stroke}"/>
        <circle cx="${x + w - 16}" cy="${y + h - cOff}" r="1.5" fill="${stroke}"/>`;
    }
    case "cloud": {
      const sx = w / 22;
      const sy = h / 15;
      return `<path transform="translate(${x - 1 * sx},${y - 4.5 * sy}) scale(${sx},${sy})" d="M2.25 15a4.5 4.5 0 0 0 4.5 4.5H18a3.75 3.75 0 0 0 1.332-7.257 3 3 0 0 0-3.758-3.848 5.25 5.25 0 0 0-10.233 2.33A4.502 4.502 0 0 0 2.25 15Z" ${a} vector-effect="non-scaling-stroke"/>`;
    }
    case "user": {
      const { figureH, headR, armSpan, legSpan } = userFigureMetrics(b);
      const cx = x + w / 2;
      const headCy = y + headR + figureH * 0.04;
      const neckTop = headCy + headR;
      const waistY = y + figureH * 0.62;
      const feetY = y + figureH;
      const armsY = neckTop + (waistY - neckTop) * 0.35;
      const line = `stroke="${stroke}" stroke-width="${sw}" stroke-linecap="round" fill="none"${dash}`;
      return `<circle cx="${cx}" cy="${headCy}" r="${headR}" ${a}/>
        <line x1="${cx}" y1="${neckTop}" x2="${cx}" y2="${waistY}" ${line}/>
        <line x1="${cx - armSpan}" y1="${armsY}" x2="${cx + armSpan}" y2="${armsY}" ${line}/>
        <line x1="${cx}" y1="${waistY}" x2="${cx - legSpan}" y2="${feetY}" ${line}/>
        <line x1="${cx}" y1="${waistY}" x2="${cx + legSpan}" y2="${feetY}" ${line}/>`;
    }
  }
}

function shapeIconSvg(shape: Shape): string {
  const iconBox: Box = {
    id: "icon", label: "", sublabel: "", shape,
    x: 5, y: 5, w: 42, h: 22,
  };
  const T = activeObjectTokens;
  return `<svg viewBox="0 0 52 32" width="52" height="32">${renderShape(iconBox, T.fill, T.stroke, 1.2)}</svg>`;
}

function renderConnector(c: Connector): string {
  const from = findEndpoint(c.from);
  const to = findEndpoint(c.to);
  if (!from || !to) return "";
  const fromCx = from.x + from.w / 2;
  const fromCy = from.y + from.h / 2;
  const toCx = to.x + to.w / 2;
  const toCy = to.y + to.h / 2;
  const start = rectBoundary(from, toCx, toCy);
  const end = rectBoundary(to, fromCx, fromCy);
  const sel = c.id === selectedConnectorId;
  const stroke = sel ? "#3b82f6" : activeObjectTokens.connectorStroke;
  const sw = sel ? 2 : 1.5;
  const marker = sel ? "arrow-sel" : "arrow";
  return `<g class="connector" data-id="${c.id}">
    <line x1="${start.x}" y1="${start.y}" x2="${end.x}" y2="${end.y}" stroke="transparent" stroke-width="14" pointer-events="stroke"/>
    <line x1="${start.x}" y1="${start.y}" x2="${end.x}" y2="${end.y}" stroke="${stroke}" stroke-width="${sw}" marker-end="url(#${marker})" pointer-events="none"/>
  </g>`;
}

// ---------------- Pointer interactions ----------------

function bindCanvasEvents(): void {
  const svgEl = document.querySelector<SVGSVGElement>("#svg-root");
  if (!svgEl) return;
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
  if (document.activeElement instanceof HTMLElement) {
    document.activeElement.blur();
  }

  const svgEl = e.currentTarget as SVGSVGElement;
  const { x, y } = svgPoint(svgEl, e);
  const target = e.target as Element;
  const boxGroup = target.closest("g.box") as SVGGElement | null;
  const connectorGroup = target.closest("g.connector") as SVGGElement | null;
  const centerGroup = target.closest("g.center") as SVGGElement | null;

  if (currentMode === "view" || currentMode === "gallery") return;

  if (currentMode === "connect") {
    if (boxGroup) {
      handleConnectClick(boxGroup.dataset.id!);
      return;
    }
    if (centerGroup) {
      handleConnectClick(CENTER_ID);
      return;
    }
    if (connectorGroup) {
      selectedConnectorId = connectorGroup.dataset.id!;
      connectFrom = null;
      render();
      return;
    }
    if (connectFrom !== null || selectedConnectorId !== null) {
      connectFrom = null;
      selectedConnectorId = null;
      render();
    }
    return;
  }

  // Draw mode
  if (boxGroup) {
    const id = boxGroup.dataset.id!;
    const box = state.boxes.find((b) => b.id === id);
    if (!box) return;
    // Suppress the browser's default focus-on-mousedown — without this the UA
    // moves focus to <body> after our handler returns, undoing the explicit
    // focus() call below.
    e.preventDefault();
    selectedId = id;
    selectedCenter = false;
    selectedConnectorId = null;
    dragState = { id, offsetX: x - box.x, offsetY: y - box.y, moved: false };
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
    render();
    boxLabelInput.focus();
    boxLabelInput.select();
    return;
  }

  if (connectorGroup) {
    selectedConnectorId = connectorGroup.dataset.id!;
    selectedId = null;
    selectedCenter = false;
    render();
    return;
  }

  if (centerGroup) {
    e.preventDefault();
    selectedCenter = true;
    selectedId = null;
    selectedConnectorId = null;
    dragState = {
      id: CENTER_ID,
      offsetX: x - state.centerX,
      offsetY: y - state.centerY,
      moved: false,
    };
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
    render();
    boxLabelInput.focus();
    boxLabelInput.select();
    return;
  }

  // Empty canvas in draw mode: first click clears any existing selection;
  // only a click while nothing is selected actually creates a new box. That
  // way the inspector "close" gesture is just a click off the box and doesn't
  // immediately drop a new box at the same coordinates.
  if (selectedId !== null || selectedConnectorId !== null || selectedCenter) {
    selectedId = null;
    selectedConnectorId = null;
    selectedCenter = false;
    render();
    return;
  }

  if (!isInFrame(x, y) || isInCenter(x, y)) return;

  e.preventDefault();
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
  if (rectsOverlap(newBox, { x: state.centerX, y: state.centerY, w: CENTER_W, h: CENTER_H })) return;

  state.boxes.push(newBox);
  selectedId = newBox.id;
  selectedConnectorId = null;
  render();
  boxLabelInput.focus();
  boxLabelInput.select();
}

function handleConnectClick(id: string): void {
  if (connectFrom === null) {
    connectFrom = id;
  } else if (connectFrom === id) {
    connectFrom = null;
  } else if (state.connectors.some((c) => c.from === connectFrom && c.to === id)) {
    connectFrom = id;
  } else {
    state.connectors.push({ id: uid(), from: connectFrom, to: id });
  }
  render();
}

function onMouseMove(e: MouseEvent): void {
  if (!dragState) return;
  const svgEl = document.querySelector<SVGSVGElement>("#svg-root")!;
  const { x, y } = svgPoint(svgEl, e);
  if (dragState.id === CENTER_ID) {
    state.centerX = x - dragState.offsetX;
    state.centerY = y - dragState.offsetY;
    clampCenter();
    dragState.moved = true;
    render();
    return;
  }
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
  if (currentMode !== "draw") {
    inspector.hidden = true;
    return;
  }
  const boxStyleField = document.querySelector<HTMLElement>("#box-style-field");
  if (selectedCenter) {
    inspector.hidden = false;
    shapeField.hidden = true;
    inspectorFooter.hidden = true;
    if (boxStyleField) boxStyleField.hidden = true;
    if (document.activeElement !== boxLabelInput) boxLabelInput.value = state.centerLabel;
    if (document.activeElement !== boxSublabelInput) boxSublabelInput.value = state.centerSublabel;
    positionInspector();
    return;
  }
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
  shapeField.hidden = false;
  inspectorFooter.hidden = false;
  if (boxStyleField) boxStyleField.hidden = false;
  if (document.activeElement !== boxLabelInput) boxLabelInput.value = box.label;
  if (document.activeElement !== boxSublabelInput) boxSublabelInput.value = box.sublabel;
  shapeGrid.querySelectorAll("button[data-shape]").forEach((b) => {
    const btn = b as HTMLButtonElement;
    btn.classList.toggle("active", btn.dataset.shape === box.shape);
  });
  // Populate the per-box style picker from the cached pack list. If the
  // cache is empty (haven't entered draw/styles yet), trigger a fetch.
  refreshBoxStylePicker();
  if (cachedPackList.length === 0) void refreshDiagramPackPickers();
  positionInspector();
}

const INSPECTOR_W = 220;
const INSPECTOR_GAP = 10;

function positionInspector(): void {
  if (!inspector || inspector.hidden) return;
  const target = selectedCenter
    ? document.querySelector("g.center") as SVGGElement | null
    : selectedId
      ? document.querySelector(`g.box[data-id="${CSS.escape(selectedId)}"]`) as SVGGElement | null
      : null;
  if (!target) return;
  const rect = target.getBoundingClientRect();
  const insRect = inspector.getBoundingClientRect();
  const w = insRect.width || INSPECTOR_W;
  const h = insRect.height || 260;

  let left = rect.left - w - INSPECTOR_GAP;
  if (left < 16) {
    left = rect.right + INSPECTOR_GAP;
  }
  if (left + w > window.innerWidth - 16) {
    left = window.innerWidth - w - 16;
  }
  if (left < 16) left = 16;

  // shapeGridEl gives us the y-offset of the shape grid inside the inspector,
  // so we can line up the *shape grid* with the target's top edge rather than
  // the inspector's top edge (which would put the label inputs above the box).
  // When the shape field is hidden (center selected) we skip the offset —
  // a hidden element's bounding rect is at (0,0) which would otherwise yield a
  // huge negative offset and pin the inspector to the bottom of the viewport.
  const shapeGridEl = document.querySelector<HTMLDivElement>("#shape-grid");
  const shapeOffsetY = shapeGridEl && shapeField && !shapeField.hidden
    ? shapeGridEl.getBoundingClientRect().top - insRect.top
    : 0;
  let top = rect.top - shapeOffsetY;
  if (top + h > window.innerHeight - 16) top = window.innerHeight - h - 16;
  if (top < 76) top = 76;

  inspector.style.left = `${left}px`;
  inspector.style.top = `${top}px`;
}

function updateSelectedFromInputs(): void {
  if (selectedCenter) {
    state.centerLabel = boxLabelInput.value;
    state.centerSublabel = boxSublabelInput.value;
    render();
    return;
  }
  if (!selectedId) return;
  const box = state.boxes.find((b) => b.id === selectedId);
  if (!box) return;
  box.label = boxLabelInput.value;
  box.sublabel = boxSublabelInput.value;
  render();
}

function deleteSelected(): void {
  if (!selectedId) return;
  const id = selectedId;
  state.boxes = state.boxes.filter((b) => b.id !== id);
  state.connectors = state.connectors.filter((c) => c.from !== id && c.to !== id);
  selectedId = null;
  render();
}

function deleteSelectedConnector(): void {
  if (!selectedConnectorId) return;
  state.connectors = state.connectors.filter((c) => c.id !== selectedConnectorId);
  selectedConnectorId = null;
  render();
}

function newDiagram(): void {
  if ((state.boxes.length > 0 || state.connectors.length > 0) && !confirm("Discard current diagram?")) return;
  state.scene = "perspective";
  state.centerLabel = "the system";
  state.centerSublabel = "";
  state.centerX = CENTER_X_DEFAULT;
  state.centerY = CENTER_Y_DEFAULT;
  state.boxes = [];
  state.connectors = [];
  state.canvasStyleUri = null;
  state.objectStyleUri = null;
  selectedId = null;
  selectedConnectorId = null;
  selectedCenter = false;
  connectFrom = null;
  sceneInput.value = state.scene;
  void applyBindings();
  setMode("draw");
}

// ---------------- PNG export ----------------

async function copyPNG(): Promise<void> {
  const prevSelected = selectedId;
  const prevSelectedConnector = selectedConnectorId;
  const prevSelectedCenter = selectedCenter;
  const prevConnectFrom = connectFrom;
  selectedId = null;
  selectedConnectorId = null;
  selectedCenter = false;
  connectFrom = null;
  render();
  const exportSvg = document.querySelector<SVGSVGElement>("#svg-root")!;
  // Clone so we can stamp explicit width/height for high-DPI rasterization
  // without mutating the live DOM. The intrinsic size we give the SVG element
  // is what <img>.decode() will use as the raster source size — bigger here
  // means a sharper PNG, since drawImage onto a same-sized canvas avoids any
  // upscaling pass.
  const PNG_SCALE = 3;
  const exportW = CANVAS_W * PNG_SCALE;
  const exportH = CANVAS_H * PNG_SCALE;
  const exportClone = exportSvg.cloneNode(true) as SVGSVGElement;
  exportClone.setAttribute("width", String(exportW));
  exportClone.setAttribute("height", String(exportH));
  if (!exportClone.getAttribute("xmlns")) {
    exportClone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  }
  const xml = new XMLSerializer().serializeToString(exportClone);
  selectedId = prevSelected;
  selectedConnectorId = prevSelectedConnector;
  selectedCenter = prevSelectedCenter;
  connectFrom = prevConnectFrom;

  const pngPromise: Promise<Blob> = (async () => {
    const svgBlob = new Blob([xml], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(svgBlob);
    try {
      const img = new Image();
      img.width = exportW;
      img.height = exportH;
      img.src = url;
      await img.decode();
      const c = document.createElement("canvas");
      c.width = exportW;
      c.height = exportH;
      const ctx = c.getContext("2d")!;
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.fillStyle = "#fbfaf6";
      ctx.fillRect(0, 0, c.width, c.height);
      ctx.drawImage(img, 0, 0, exportW, exportH);
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

// ---------------- App-level routing ----------------

// Legacy URL redirect: old standalone routes used "#design-system" / "#help".
if (location.hash === "#design-system") {
  history.replaceState(null, "", "#p=design-system");
} else if (location.hash === "#help") {
  history.replaceState(null, "", "#p=help");
}

bootDiagrammer();
