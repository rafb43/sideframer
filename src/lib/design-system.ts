// A self-contained "components" page that showcases every UI element in
// sideframer. Mounted via `#design-system` hash route. Reuses the same
// stylesheet so what you see here is what ships.

type Shape =
  | "rect" | "rounded" | "document" | "subprocess"
  | "database" | "server" | "cloud" | "user";

interface DSDeps {
  renderShape: (
    b: { id: string; label: string; sublabel: string; shape: Shape; x: number; y: number; w: number; h: number },
    fill: string,
    stroke: string,
    sw: number,
    dashed?: boolean,
  ) => string;
  shapeIconSvg: (shape: Shape) => string;
  SHAPES: readonly Shape[];
}

export function renderDesignSystem(root: HTMLElement, deps: DSDeps): void {
  root.innerHTML = page(deps);
  wireDemos();
}

function page(deps: DSDeps): string {
  return `
    <div class="ds-page">
      <header class="ds-header">
        <h1>sideframer · components</h1>
        <a class="ds-back" href="#">← back to app</a>
      </header>

      ${sectionColors()}
      ${sectionTypography()}
      ${sectionButtons()}
      ${sectionSegmented()}
      ${sectionFields()}
      ${sectionMessageBar()}
      ${sectionMasthead()}
      ${sectionContextActions()}
      ${sectionFooters()}
      ${sectionGalleryTiles()}
      ${sectionInspector(deps)}
      ${sectionShapes(deps)}
      ${sectionFlash()}
      ${sectionShellPreview()}
    </div>
  `;
}

// ---------------- Sections ----------------

function sectionColors(): string {
  const tokens: [string, string][] = [
    ["--bg", "#fbfaf6"],
    ["--panel", "#fffffe"],
    ["--line", "#d4d0c4"],
    ["--ink", "#2a2a28"],
    ["--mute", "#6b685f"],
    ["--accent", "#3b82f6"],
    ["--danger", "#c54a3b"],
    ["--warn", "#b27800"],
    ["--ok", "#2f7d4f"],
  ];
  return ds("colors", "Design tokens used across the shell.", `
    <div class="ds-row">
      ${tokens.map(([name, hex]) => `
        <div class="ds-swatch">
          <span class="chip" style="background:${hex}"></span>
          <span><code>${name}</code><br><span class="ds-caption">${hex}</span></span>
        </div>
      `).join("")}
    </div>
  `);
}

function sectionTypography(): string {
  return ds("typography", "Sans for chrome; mono for slugs and URIs.", `
    <div class="ds-stack">
      <div style="font-size:18px;font-weight:600;letter-spacing:0.4px">Page heading · 18 / 600</div>
      <div style="font-size:14px;font-weight:600">Section heading · 14 / 600</div>
      <div style="font-size:13px">Body · 13 / 400 — quick brown fox</div>
      <div style="font-size:12.5px;color:var(--mute)">Small / mute · 12.5 / 400</div>
      <div style="font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px">mono · 12 — diagram-slug-9f</div>
      <div class="ds-caption">caption / uppercase · 11 — gallery count</div>
    </div>
  `);
}

function sectionButtons(): string {
  return ds("buttons", "Default, danger, mini, disabled.", `
    <div class="ds-row">
      <button class="btn">primary</button>
      <button class="btn">save</button>
      <button class="btn danger">delete</button>
      <button class="btn" disabled>disabled</button>
      <button class="btn-mini">↻ refresh</button>
    </div>
  `);
}

function sectionSegmented(): string {
  return ds("segmented control", "Used as the mode switcher in the masthead.", `
    <div class="ds-row">
      <div class="segmented" id="ds-seg" role="tablist">
        <button class="active" data-mode="gallery">gallery</button>
        <button data-mode="view">view</button>
        <button data-mode="draw">draw</button>
        <button data-mode="connect">connect</button>
      </div>
      <span class="ds-caption">click to change selection</span>
    </div>
  `);
}

function sectionFields(): string {
  return ds("fields", "Labeled input and select used across the chrome.", `
    <div class="ds-row">
      <label class="field"><span>scene</span><input type="text" value="checkout flow" /></label>
      <label class="field"><span>center label</span><input type="text" value="the system" /></label>
      <label class="field"><span>background</span>
        <select>
          <option>clean</option><option selected>grid</option><option>sections</option>
        </select>
      </label>
    </div>
  `);
}

function sectionMessageBar(): string {
  return ds("message bar", "Top-of-shell announcements — hidden by default.", `
    <div class="ds-stack">
      <div class="message-bar info" style="height:34px;position:relative;border-radius:4px">
        <span>beta is out — try the new connect mode</span>
        <button class="msg-dismiss" title="dismiss">×</button>
      </div>
      <div class="message-bar warn" style="height:34px;position:relative;border-radius:4px">
        <span>storage server unreachable — running in local-draft mode</span>
        <button class="msg-dismiss" title="dismiss">×</button>
      </div>
      <div class="message-bar ok" style="height:34px;position:relative;border-radius:4px">
        <span>saved · my-diagram-9f</span>
        <button class="msg-dismiss" title="dismiss">×</button>
      </div>
    </div>
  `);
}

function sectionMasthead(): string {
  return ds("masthead", "Brand · mode switcher · global actions.", `
    <div class="ds-preview">
      <header class="masthead" style="height:44px">
        <div class="masthead-brand">sideframer</div>
        <nav class="masthead-modes">
          <div class="segmented">
            <button>gallery</button>
            <button>view</button>
            <button class="active">draw</button>
            <button>connect</button>
          </div>
        </nav>
        <div class="masthead-actions">
          <button class="btn">copy PNG</button>
          <button class="btn">save</button>
          <button class="btn">new</button>
        </div>
      </header>
    </div>
  `);
}

function sectionContextActions(): string {
  return ds("context actions", "Per-mode action row shown beneath the masthead.", `
    <div class="ds-stack">
      <div class="ds-caption">gallery</div>
      <div class="ds-preview"><div class="context-actions" style="height:44px;display:flex">
        <div class="context-actions-group" data-mode="gallery" style="display:flex">
          <button class="btn-mini">↻ refresh</button>
          <span class="ctx-note">click a tile to open it</span>
        </div>
      </div></div>

      <div class="ds-caption">view</div>
      <div class="ds-preview"><div class="context-actions" style="height:44px;display:flex">
        <div class="context-actions-group" data-mode="view" style="display:flex">
          <span class="ctx-note">read-only · press <kbd>d</kbd> to draw or <kbd>c</kbd> to connect</span>
        </div>
      </div></div>

      <div class="ds-caption">draw</div>
      <div class="ds-preview"><div class="context-actions" style="height:44px;display:flex">
        <div class="context-actions-group" data-mode="draw" style="display:flex">
          <label class="field"><span>scene</span><input type="text" value="perspective"/></label>
          <label class="field"><span>center label</span><input type="text" value="the system"/></label>
          <label class="field"><span>background</span>
            <select><option>grid</option></select>
          </label>
        </div>
      </div></div>

      <div class="ds-caption">connect</div>
      <div class="ds-preview"><div class="context-actions" style="height:44px;display:flex">
        <div class="context-actions-group" data-mode="connect" style="display:flex">
          <span class="ctx-note">click two boxes (or the center) to connect · click an arrow to select</span>
        </div>
      </div></div>
    </div>
  `);
}

function sectionFooters(): string {
  return ds("footer · brand footer", "Status / hint line, then a thin brand strip.", `
    <div class="ds-preview">
      <footer class="shell-footer" style="height:32px">
        <span class="hint">draw — double-click empty canvas to add a box · drag to move · esc / g / v / c switch modes</span>
        <span class="footer-status">7 boxes · 4 connectors</span>
      </footer>
      <div class="brand-footer" style="height:22px">
        sideframer · DFT diagrams · <a href="#design-system">components</a>
      </div>
    </div>
  `);
}

function sectionGalleryTiles(): string {
  return ds("gallery tile", "Card used in the gallery mode grid.", `
    <ul class="gallery-grid" style="list-style:none;padding:0;margin:0">
      <li class="gallery-tile">
        <span class="g-slug">checkout-flow-9f</span>
        <span class="g-uri">mutable://diagrams/checkout-flow-9f</span>
      </li>
      <li class="gallery-tile">
        <span class="g-slug">ingest-pipeline-3a</span>
        <span class="g-uri">mutable://diagrams/ingest-pipeline-3a</span>
      </li>
      <li class="gallery-tile">
        <span class="g-slug">auth-rewrite-7b</span>
        <span class="g-uri">mutable://diagrams/auth-rewrite-7b</span>
      </li>
    </ul>
  `);
}

function sectionInspector(deps: DSDeps): string {
  return ds("inspector", "Floating panel shown next to a selected box in draw mode.", `
    <div class="ds-row" style="justify-content:flex-start">
      <aside class="inspector" style="position:relative;width:220px">
        <div class="field">
          <span>shape</span>
          <div class="shape-grid">
            ${deps.SHAPES.map((s, i) => `<button class="${i === 1 ? "active" : ""}" title="${s}">${deps.shapeIconSvg(s)}</button>`).join("")}
          </div>
        </div>
        <label class="field"><span>label</span><input type="text" value="CheckoutRequest"/></label>
        <label class="field"><span>sublabel</span><input type="text" value="document"/></label>
        <div class="inspector-footer">
          <button class="btn danger">delete</button>
        </div>
      </aside>
    </div>
  `);
}

function sectionShapes(deps: DSDeps): string {
  const tiles = deps.SHAPES.map((shape) => {
    const box = { id: "x", label: "", sublabel: "", shape, x: 16, y: 14, w: 90, h: 44 };
    return `<div class="ds-shape-tile">
      <svg viewBox="0 0 120 72" width="120" height="72">${deps.renderShape(box, "white", "#54524c", 1.4)}</svg>
      <span>${shape}</span>
    </div>`;
  }).join("");
  return ds("shapes", "Box shapes available in draw mode.", `
    <div class="ds-shapes">${tiles}</div>
  `);
}

function sectionFlash(): string {
  return ds("flash toast", "Brief confirmation / error overlay.", `
    <div class="ds-row" style="gap:24px">
      <button class="btn" id="ds-flash-ok">show success</button>
      <button class="btn danger" id="ds-flash-err">show error</button>
    </div>
  `);
}

function sectionShellPreview(): string {
  return ds("full shell", "How all the pieces stack vertically.", `
    <div class="ds-preview" style="padding:0">
      <div class="message-bar info" style="height:34px;position:relative">
        <span>beta is out — try the new connect mode</span>
        <button class="msg-dismiss" title="dismiss">×</button>
      </div>
      <header class="masthead" style="height:44px">
        <div class="masthead-brand">sideframer</div>
        <nav class="masthead-modes">
          <div class="segmented">
            <button>gallery</button>
            <button>view</button>
            <button class="active">draw</button>
            <button>connect</button>
          </div>
        </nav>
        <div class="masthead-actions">
          <button class="btn">copy PNG</button>
          <button class="btn">save</button>
          <button class="btn">new</button>
        </div>
      </header>
      <div class="context-actions" style="height:44px">
        <div class="context-actions-group" data-mode="draw" style="display:flex">
          <label class="field"><span>scene</span><input type="text" value="perspective"/></label>
          <label class="field"><span>center label</span><input type="text" value="the system"/></label>
          <label class="field"><span>background</span><select><option>grid</option></select></label>
        </div>
      </div>
      <div style="background:var(--bg);height:160px;display:flex;align-items:center;justify-content:center;color:var(--mute);font-size:13px">— diagram canvas —</div>
      <footer class="shell-footer" style="height:32px">
        <span class="hint">draw — double-click empty canvas to add a box · drag to move</span>
        <span class="footer-status">7 boxes · 4 connectors</span>
      </footer>
      <div class="brand-footer" style="height:22px">
        sideframer · DFT diagrams · components
      </div>
    </div>
  `);
}

// ---------------- Helpers ----------------

function ds(title: string, note: string, body: string): string {
  return `
    <section class="ds-section">
      <h2>${title}</h2>
      ${note ? `<p class="ds-note">${note}</p>` : ""}
      ${body}
    </section>
  `;
}

function wireDemos(): void {
  const seg = document.querySelector<HTMLDivElement>("#ds-seg");
  seg?.addEventListener("click", (e) => {
    const btn = (e.target as Element).closest("button[data-mode]") as HTMLButtonElement | null;
    if (!btn) return;
    seg.querySelectorAll("button").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
  });

  document.querySelector<HTMLButtonElement>("#ds-flash-ok")
    ?.addEventListener("click", () => spawnFlash("looks good"));
  document.querySelector<HTMLButtonElement>("#ds-flash-err")
    ?.addEventListener("click", () => spawnFlash("something broke", true));
}

function spawnFlash(msg: string, isError = false): void {
  const el = document.createElement("div");
  el.className = "flash" + (isError ? " error" : "");
  el.textContent = msg;
  document.body.appendChild(el);
  requestAnimationFrame(() => el.classList.add("show"));
  setTimeout(() => {
    el.classList.remove("show");
    setTimeout(() => el.remove(), 300);
  }, 1800);
}
