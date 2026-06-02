import "./style.css";
import { createClientRig, DiagramStore } from "./lib/diagram-store.ts";
// design-system and help pages are dynamic-imported on demand (see setPage)
// to keep the diagrammer bundle light.

const STORAGE_SERVER = (import.meta as { env?: { VITE_SIDEFRAMER_SERVER?: string } }).env
  ?.VITE_SIDEFRAMER_SERVER || "http://localhost:5174";
const diagramStore = new DiagramStore(createClientRig(STORAGE_SERVER));

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
}

type Background = "clean" | "grid" | "sections" | "diagonals" | "gradient";

type Mode = "gallery" | "view" | "draw" | "connect";
const MODES: Mode[] = ["gallery", "view", "draw", "connect"];

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
  background: Background;
  boxes: Box[];
  connectors: Connector[];
}

const CENTER_ID = "@center";

// ---------------- Layout constants ----------------

const CANVAS_W = 1600;
const CANVAS_H = 1000;
const PAD = 88;
const CENTER_W = 360;
const CENTER_H = 200;
const CENTER_X = (CANVAS_W - CENTER_W) / 2;
const CENTER_Y = (CANVAS_H - CENTER_H) / 2;
const DEFAULT_BOX_W = 170;
const DEFAULT_BOX_H = 64;

// ---------------- State ----------------

const state: DiagramState = {
  scene: "perspective",
  centerLabel: "the system",
  centerSublabel: "",
  background: "grid",
  boxes: [],
  connectors: [],
};

let selectedId: string | null = null;
let selectedConnectorId: string | null = null;
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
let centerLabelInput!: HTMLInputElement;
let centerSublabelInput!: HTMLInputElement;
let boxLabelInput!: HTMLInputElement;
let boxSublabelInput!: HTMLInputElement;
let bgSelect!: HTMLSelectElement;
let shapeGrid!: HTMLDivElement;
let modeSeg!: HTMLDivElement;
let hintSpan!: HTMLSpanElement;
let galleryList!: HTMLUListElement;
let galleryEmpty!: HTMLDivElement;
let galleryError!: HTMLDivElement;
let galleryCount!: HTMLSpanElement;

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
  const legacy = (state as unknown as { theme?: string }).theme;
  if (typeof legacy === "string" && !state.scene) state.scene = legacy;
  delete (state as unknown as { theme?: string }).theme;
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
          </div>
          <div class="context-actions-group" data-mode="connect">
            <span class="ctx-note">click two boxes (or the center) to connect · click an arrow to select</span>
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
      <div class="field">
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
      <div class="inspector-footer">
        <button id="box-delete" class="btn danger">delete</button>
      </div>
    </aside>
  `;

  shellEl = document.querySelector<HTMLElement>("#shell")!;
  canvas = document.querySelector<HTMLDivElement>("#canvas")!;
  inspector = document.querySelector<HTMLElement>("#inspector")!;
  sceneInput = document.querySelector<HTMLInputElement>("#scene-input")!;
  centerLabelInput = document.querySelector<HTMLInputElement>("#center-label-input")!;
  centerSublabelInput = document.querySelector<HTMLInputElement>("#center-sublabel-input")!;
  boxLabelInput = document.querySelector<HTMLInputElement>("#box-label-input")!;
  boxSublabelInput = document.querySelector<HTMLInputElement>("#box-sublabel-input")!;
  bgSelect = document.querySelector<HTMLSelectElement>("#bg-select")!;
  shapeGrid = document.querySelector<HTMLDivElement>("#shape-grid")!;
  modeSeg = document.querySelector<HTMLDivElement>("#mode-seg")!;
  hintSpan = document.querySelector<HTMLSpanElement>("#hint")!;
  galleryList = document.querySelector<HTMLUListElement>("#gallery-list")!;
  galleryEmpty = document.querySelector<HTMLDivElement>("#gallery-empty")!;
  galleryError = document.querySelector<HTMLDivElement>("#gallery-error")!;
  galleryCount = document.querySelector<HTMLSpanElement>("#gallery-count")!;
  pageOverlay = document.querySelector<HTMLDivElement>("#page-overlay")!;
  pageBody = document.querySelector<HTMLDivElement>("#page-overlay-body")!;
  pageTitle = document.querySelector<HTMLElement>("#page-overlay-title")!;

  Object.assign(state, decodeStateFromHash() ?? loadDraft() ?? {});
  normalizeState();

  sceneInput.value = state.scene;
  centerLabelInput.value = state.centerLabel;
  centerSublabelInput.value = state.centerSublabel;
  bgSelect.value = state.background;

  // Mode precedence: URL hash > derived default (view if non-empty, draw if empty).
  currentMode = decodeModeFromHash()
    ?? (state.boxes.length > 0 || state.connectors.length > 0 ? "view" : "draw");

  wireEvents();
  setMode(currentMode);
  render();

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
  gallery: "gallery — saved diagrams · click a tile to open · g / v / d / c switch modes",
  view: "view — read-only · g / v / d / c switch modes",
  draw: "draw — click empty canvas to add a box · drag to move · click a box to edit · esc / g / v / c switch modes",
  connect: "connect — click two boxes (or the center) to link them · esc / g / v / d switch modes",
};

function setMode(m: Mode): void {
  const modeChanged = m !== currentMode;
  currentMode = m;
  connectFrom = null;
  if (m !== "draw") {
    selectedId = null;
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
  centerLabelInput.addEventListener("input", () => { state.centerLabel = centerLabelInput.value; render(); });
  centerSublabelInput.addEventListener("input", () => { state.centerSublabel = centerSublabelInput.value; render(); });
  bgSelect.addEventListener("change", () => { state.background = bgSelect.value as Background; render(); });

  shapeGrid.addEventListener("click", (e) => {
    const btn = (e.target as Element).closest("button[data-shape]") as HTMLButtonElement | null;
    if (!btn || !selectedId) return;
    const box = state.boxes.find((b) => b.id === selectedId);
    if (!box) return;
    box.shape = btn.dataset.shape as Shape;
    render();
  });

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

  document.querySelector<HTMLButtonElement>("#save-diagram")!
    .addEventListener("click", async () => {
      const btn = document.querySelector<HTMLButtonElement>("#save-diagram")!;
      const orig = btn.textContent;
      btn.disabled = true;
      btn.textContent = "saving…";
      try {
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
  Object.assign(state, newState);
  normalizeState();
  sceneInput.value = state.scene;
  centerLabelInput.value = state.centerLabel;
  centerSublabelInput.value = state.centerSublabel;
  bgSelect.value = state.background;
  selectedId = null;
  selectedConnectorId = null;
  connectFrom = null;
  render();
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
    const rows: { li: HTMLLIElement; uri: string }[] = [];
    for (const { uri, slug } of items) {
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
      rows.push({ li, uri });
    }
    await Promise.all(rows.map(({ li, uri }) => populatePreview(li, uri, token)));
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

async function populatePreview(li: HTMLLIElement, uri: string, token: number): Promise<void> {
  const slot = li.querySelector<HTMLDivElement>("[data-preview]");
  if (!slot) return;
  try {
    const rec = await diagramStore.load(uri);
    if (token !== galleryToken) return;
    const diagram = rec?.diagram as Partial<DiagramState> | undefined;
    if (!diagram) {
      slot.textContent = "no preview";
      return;
    }
    slot.classList.remove("is-empty");
    slot.innerHTML = buildPreviewSVG(diagram);
  } catch {
    if (token !== galleryToken) return;
    slot.textContent = "preview failed";
  }
}

function buildPreviewSVG(d: Partial<DiagramState>): string {
  const boxes: Box[] = Array.isArray(d.boxes) ? d.boxes : [];
  const connectors: Connector[] = Array.isArray(d.connectors) ? d.connectors : [];
  const center = { x: CENTER_X, y: CENTER_Y, w: CENTER_W, h: CENTER_H };
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

function findEndpoint(id: string): { x: number; y: number; w: number; h: number } | null {
  if (id === CENTER_ID) {
    return { x: CENTER_X, y: CENTER_Y, w: CENTER_W, h: CENTER_H };
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
  const sceneStr = state.scene ? `scene:  ${esc(state.scene)}` : "";
  const centerConnectSource = currentMode === "connect" && connectFrom === CENTER_ID;
  const centerStroke = centerConnectSource ? "#10b981" : "#2a2a28";
  const centerDash = centerConnectSource ? ` stroke-dasharray="6 4"` : "";
  return `
<svg id="svg-root" class="mode-${currentMode}" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${CANVAS_W} ${CANVAS_H}" width="${CANVAS_W}" height="${CANVAS_H}">
  <style>
    .axis { font: 600 12px Arial, Helvetica, sans-serif; letter-spacing: 4px; fill: #8a8678; }
    .scene-line { font: 13px Arial, Helvetica, sans-serif; fill: #6b685f; letter-spacing: 0.5px; }
    .center-label { font: 600 22px Arial, Helvetica, sans-serif; fill: #2a2a28; }
    .center-sublabel { font: 14px Arial, Helvetica, sans-serif; fill: #6b685f; }
    .box-label { font: 600 14px Arial, Helvetica, sans-serif; fill: #2a2a28; }
    .box-sublabel { font: 12px Arial, Helvetica, sans-serif; fill: #6b685f; }
  </style>
  <defs>
    <marker id="arrow" viewBox="-10 -5 10 10" refX="0" refY="0" markerWidth="10" markerHeight="10" orient="auto">
      <path d="M-10,-5 L0,0 L-10,5 Z" fill="#54524c"/>
    </marker>
    <marker id="arrow-sel" viewBox="-10 -5 10 10" refX="0" refY="0" markerWidth="10" markerHeight="10" orient="auto">
      <path d="M-10,-5 L0,0 L-10,5 Z" fill="#3b82f6"/>
    </marker>
  </defs>

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

  <text class="scene-line" x="${PAD}" y="${PAD - 56}">${sceneStr}</text>

  ${state.connectors.map(renderConnector).filter(Boolean).join("\n")}

  <g class="center" data-target="center" data-id="${CENTER_ID}">
    <rect x="${CENTER_X}" y="${CENTER_Y}" width="${CENTER_W}" height="${CENTER_H}"
          fill="#ffffff" stroke="${centerStroke}" stroke-width="2.5" rx="8"${centerDash}/>
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
  const isConnectSource = currentMode === "connect" && connectFrom === b.id;
  const stroke = sel ? "#3b82f6" : isConnectSource ? "#10b981" : "#54524c";
  const sw = sel ? 2.5 : 1.5;
  const labelBelow = b.shape === "user";
  const labelY = labelBelow
    ? b.y + b.h - (b.sublabel ? 18 : 8)
    : b.y + b.h / 2 - (b.sublabel ? 8 : 0);
  const sublabelY = labelBelow ? b.y + b.h - 4 : b.y + b.h / 2 + 12;
  return `<g class="box" data-id="${b.id}">
    ${renderShape(b, "#ffffff", stroke, sw, isConnectSource)}
    <text class="box-label" x="${b.x + b.w / 2}"
          y="${labelY}"
          text-anchor="middle" dominant-baseline="middle">${esc(b.label)}</text>
    ${b.sublabel
      ? `<text class="box-sublabel" x="${b.x + b.w / 2}" y="${sublabelY}"
            text-anchor="middle" dominant-baseline="middle">${esc(b.sublabel)}</text>`
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
  return `<svg viewBox="0 0 52 32" width="52" height="32">${renderShape(iconBox, "white", "#54524c", 1.2)}</svg>`;
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
  const stroke = sel ? "#3b82f6" : "#54524c";
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
    selectedId = id;
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
    render();
    return;
  }

  if (centerGroup) {
    selectedId = null;
    selectedConnectorId = null;
    render();
    centerLabelInput.focus();
    centerLabelInput.select();
    return;
  }

  // Empty canvas in draw mode: first click clears any existing selection;
  // only a click while nothing is selected actually creates a new box. That
  // way the inspector "close" gesture is just a click off the box and doesn't
  // immediately drop a new box at the same coordinates.
  if (selectedId !== null || selectedConnectorId !== null) {
    selectedId = null;
    selectedConnectorId = null;
    render();
    return;
  }

  if (!isInFrame(x, y) || isInCenter(x, y)) return;

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
  if (rectsOverlap(newBox, { x: CENTER_X, y: CENTER_Y, w: CENTER_W, h: CENTER_H })) return;

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
  if (currentMode !== "draw" || !selectedId) {
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
  shapeGrid.querySelectorAll("button[data-shape]").forEach((b) => {
    const btn = b as HTMLButtonElement;
    btn.classList.toggle("active", btn.dataset.shape === box.shape);
  });
  positionInspector();
}

const INSPECTOR_W = 220;
const INSPECTOR_GAP = 10;

function positionInspector(): void {
  if (!inspector || inspector.hidden || !selectedId) return;
  const boxEl = document.querySelector(`g.box[data-id="${CSS.escape(selectedId)}"]`) as SVGGElement | null;
  if (!boxEl) return;
  const rect = boxEl.getBoundingClientRect();
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

  const shapeGridEl = document.querySelector<HTMLDivElement>("#shape-grid");
  const shapeOffsetY = shapeGridEl
    ? shapeGridEl.getBoundingClientRect().top - insRect.top
    : 0;
  let top = rect.top - shapeOffsetY;
  if (top + h > window.innerHeight - 16) top = window.innerHeight - h - 16;
  if (top < 76) top = 76;

  inspector.style.left = `${left}px`;
  inspector.style.top = `${top}px`;
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
  state.boxes = [];
  state.connectors = [];
  selectedId = null;
  selectedConnectorId = null;
  connectFrom = null;
  sceneInput.value = state.scene;
  centerLabelInput.value = state.centerLabel;
  centerSublabelInput.value = state.centerSublabel;
  setMode("draw");
}

// ---------------- PNG export ----------------

async function copyPNG(): Promise<void> {
  const prevSelected = selectedId;
  const prevSelectedConnector = selectedConnectorId;
  const prevConnectFrom = connectFrom;
  selectedId = null;
  selectedConnectorId = null;
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
