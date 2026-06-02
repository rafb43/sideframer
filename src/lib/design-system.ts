// A self-contained "components" page that showcases every UI element in
// sideframer. Mounted via `#design-system` hash route. Reuses the same
// stylesheet so what you see here is what ships.

type Shape =
  | "rect" | "rounded" | "document" | "subprocess"
  | "database" | "server" | "cloud" | "user";

interface DSBox {
  id: string; label: string; sublabel: string; shape: Shape;
  x: number; y: number; w: number; h: number;
}

interface DSDeps {
  renderShape: (b: DSBox, fill: string, stroke: string, sw: number, dashed?: boolean) => string;
  shapeIconSvg: (shape: Shape) => string;
  buildPreviewSVG: (d: {
    boxes?: DSBox[];
    connectors?: { id: string; from: string; to: string }[];
  }) => string;
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
      ${sectionGalleryTiles(deps)}
      ${sectionInspector(deps)}
      ${sectionShapesTable(deps)}
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
        <span class="hint">draw — click empty canvas to add a box · drag to move · click a box to edit · esc / g / v / c switch modes</span>
        <span class="footer-status">7 boxes · 4 connectors</span>
      </footer>
      <div class="brand-footer" style="height:22px">
        sideframer · DFT diagrams · <a href="#design-system">components</a>
      </div>
    </div>
  `);
}

function sectionGalleryTiles(deps: DSDeps): string {
  const fixtures: { slug: string; uri: string; diagram: Parameters<DSDeps["buildPreviewSVG"]>[0] }[] = [
    {
      slug: "checkout-flow-9f",
      uri: "mutable://diagrams/checkout-flow-9f",
      diagram: galleryFixture("varied"),
    },
    {
      slug: "ingest-pipeline-3a",
      uri: "mutable://diagrams/ingest-pipeline-3a",
      diagram: galleryFixture("pipeline"),
    },
    {
      slug: "auth-rewrite-7b",
      uri: "mutable://diagrams/auth-rewrite-7b",
      diagram: galleryFixture("hub"),
    },
  ];
  const rows = fixtures.map((f) => `
    <li class="gallery-tile">
      <div class="g-meta">
        <span class="g-slug">${f.slug}</span>
        <span class="g-uri">${f.uri}</span>
      </div>
      <div class="g-preview">${deps.buildPreviewSVG(f.diagram)}</div>
    </li>
  `).join("");
  return ds("gallery tile", "Row used in the gallery list — meta on the left, rendered preview on the right.", `
    <ul class="gallery-grid">${rows}</ul>
  `);
}

// Small fixed diagrams used to make the gallery preview legible. Coordinates
// match the canvas viewBox (1600×1000) consumed by buildPreviewSVG.
function galleryFixture(kind: "varied" | "pipeline" | "hub"):
  Parameters<DSDeps["buildPreviewSVG"]>[0] {
  if (kind === "pipeline") {
    return {
      boxes: [
        { id: "a", label: "", sublabel: "", shape: "subprocess", x: 110, y: 465, w: 170, h: 64 },
        { id: "b", label: "", sublabel: "", shape: "document", x: 320, y: 465, w: 200, h: 64 },
        { id: "c", label: "", sublabel: "", shape: "document", x: 1010, y: 465, w: 200, h: 64 },
        { id: "d", label: "", sublabel: "", shape: "subprocess", x: 1240, y: 465, w: 170, h: 64 },
        { id: "e", label: "", sublabel: "", shape: "database", x: 510, y: 770, w: 220, h: 64 },
        { id: "f", label: "", sublabel: "", shape: "cloud", x: 770, y: 770, w: 200, h: 64 },
      ],
      connectors: [
        { id: "1", from: "a", to: "b" },
        { id: "2", from: "b", to: "@center" },
        { id: "3", from: "@center", to: "c" },
        { id: "4", from: "c", to: "d" },
        { id: "5", from: "@center", to: "e" },
        { id: "6", from: "e", to: "f" },
      ],
    };
  }
  if (kind === "hub") {
    return {
      boxes: [
        { id: "u", label: "", sublabel: "", shape: "user", x: 100, y: 465, w: 250, h: 64 },
        { id: "d1", label: "", sublabel: "", shape: "document", x: 510, y: 110, w: 200, h: 64 },
        { id: "d2", label: "", sublabel: "", shape: "rounded", x: 750, y: 110, w: 200, h: 64 },
        { id: "o", label: "", sublabel: "", shape: "server", x: 1010, y: 465, w: 200, h: 64 },
        { id: "s", label: "", sublabel: "", shape: "database", x: 700, y: 770, w: 220, h: 64 },
      ],
      connectors: [
        { id: "1", from: "u", to: "@center" },
        { id: "2", from: "@center", to: "d1" },
        { id: "3", from: "@center", to: "d2" },
        { id: "4", from: "@center", to: "o" },
        { id: "5", from: "@center", to: "s" },
      ],
    };
  }
  // varied
  return {
    boxes: [
      { id: "a", label: "", sublabel: "", shape: "rect", x: 110, y: 230, w: 200, h: 64 },
      { id: "b", label: "", sublabel: "", shape: "rounded", x: 110, y: 465, w: 200, h: 64 },
      { id: "c", label: "", sublabel: "", shape: "document", x: 110, y: 700, w: 200, h: 64 },
      { id: "d", label: "", sublabel: "", shape: "cloud", x: 1290, y: 230, w: 200, h: 64 },
      { id: "e", label: "", sublabel: "", shape: "database", x: 1290, y: 465, w: 200, h: 64 },
      { id: "f", label: "", sublabel: "", shape: "server", x: 1290, y: 700, w: 200, h: 64 },
    ],
    connectors: [
      { id: "1", from: "a", to: "@center" },
      { id: "2", from: "b", to: "@center" },
      { id: "3", from: "c", to: "@center" },
      { id: "4", from: "@center", to: "d" },
      { id: "5", from: "@center", to: "e" },
      { id: "6", from: "@center", to: "f" },
    ],
  };
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

function sectionShapesTable(deps: DSDeps): string {
  // Three forms each shape takes:
  //   canvas — what gets drawn on the diagram (white fill, ink stroke)
  //   icon   — the picker button glyph (used in the inspector shape grid)
  //   thumb  — silhouette form used in the gallery preview SVG (filled ink)
  const rows = deps.SHAPES.map((shape) => {
    const canvasBox: DSBox = { id: "c", label: "", sublabel: "", shape, x: 16, y: 14, w: 90, h: 44 };
    const thumbBox: DSBox = { id: "t", label: "", sublabel: "", shape, x: 16, y: 14, w: 90, h: 44 };
    return `<tr>
      <th scope="row">${shape}</th>
      <td>
        <svg viewBox="0 0 120 72" width="120" height="72">
          ${deps.renderShape(canvasBox, "#ffffff", "#54524c", 1.5)}
        </svg>
      </td>
      <td>
        <div class="shape-grid" style="display:inline-flex">
          <button type="button" title="${shape}">${deps.shapeIconSvg(shape)}</button>
        </div>
      </td>
      <td>
        <svg viewBox="0 0 120 72" width="120" height="72">
          ${deps.renderShape(thumbBox, "#2a2a28", "#2a2a28", 2)}
        </svg>
      </td>
    </tr>`;
  }).join("");
  return ds(
    "shapes",
    "Each shape appears in three forms: rendered on the canvas, as a picker button icon, and as a silhouette in gallery thumbnails.",
    `
    <table class="ds-shape-table">
      <thead>
        <tr>
          <th></th>
          <th>canvas</th>
          <th>button icon</th>
          <th>thumbnail</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `,
  );
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
        <span class="hint">draw — click empty canvas to add a box · drag to move</span>
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
