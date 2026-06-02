# sideframer

Local web app for authoring DFT diagrams. See the [DFT spec](../dft/SPEC.md).

## Run

```
npm install
npm run serve   # storage server on :5174 (b3nd-backed)
npm run dev     # vite on :5173
```

Open http://localhost:5173. Keyboard shortcuts switch modes: **g**allery,
**v**iew, **d**raw, **c**onnect, **s**tyles. `?` opens help; `>` opens the
design-system overview.

## v1 status

- [x] LRTB frame with axis labels
- [x] Click empty space in the frame to add a box; drag to reposition
- [x] Edit selected box (label, sublabel, shape, per-box style) via the floating inspector
- [x] Scene + center label editing in the top toolbar
- [x] Copy PNG to clipboard (snapshot the live brand)
- [x] Persist working draft to `localStorage`
- [x] Share via URL fragment (`#d=<base64url-of-JSON>`) — hash beats localStorage on load
- [x] Five modes — **gallery**, **view** (read-only), **draw** (edit boxes), **connect** (place arrows), **styles** (pack editor)
- [x] Connectors between boxes (and to/from the center) with arrow markers showing flow direction
- [x] Save diagram to a b3nd-backed storage server (`mutable://diagrams/<slug>`)
- [x] Gallery panel — list / load diagrams saved by the app **or** by an agent via CLI
- [x] Style packs: canvas (background, font, axis) and object (fill, stroke, ink, connector) — bound per-diagram and overridable per-box
- [x] Auto-save: every token edit lands on disk; the editor has no unsaved state

## Stack

Vite + vanilla TypeScript + SVG. No framework. Storage is built on
[**b3nd**](https://github.com/bandeira-tech) — the same Rig + `HttpClient`
model used elsewhere in the bandeira stack.

## Conventions

- The SVG `viewBox` is fixed at 1600 × 1000. Boxes use absolute coordinates inside that frame.
- Scene is declared above the frame. Output (right) is scene-relative — see the spec.
- The grammar is positional: boxes have no edges/arrows in v1. Position carries semantics.

## Architecture

### One server, many b3nd apps

`server/server.mjs` runs a single HTTP process that mounts multiple b3nd
apps. Each app is a *namespace* with its own filesystem directory:

```
mutable://diagrams/...  → ~/.sideframer/diagrams/
mutable://styles/...    → ~/.sideframer/styles/
```

Mounts register with the Rig as separate `connection(client, [pattern])`
entries, so the dispatcher routes by URI prefix. Slugs cannot collide
across apps because each app has its own subtree on disk.

### URI namespaces are injected, not hardcoded

A b3nd app never bakes its scheme/prefix in. The dataspace root comes in
as a function:

```ts
const diagramNs = createNamespace(() => "mutable://diagrams");
const styleNs   = createNamespace(() => "mutable://styles");
```

`createNamespace(provider)` returns a `Namespace` value that knows how to
build URIs, match a routing pattern, and map URIs ↔ filenames. Swap the
provider to point at a different scheme, prefix, or remote node — every
caller adapts without code changes. This is the convention for any b3nd
app in this repo.

### Settle before responding

`rig.receive()` returns on *pipeline-ack*: the URI is accepted, but the
route handlers (our `writeFile`) still run in the background. For a
local FS server that wants a save-then-list to be consistent, that
window is a race.

Server-side, the HTTP receive route awaits `op.settled` before
returning the response. Client-side, `StyleStore.save` / `DiagramStore.save`
also await `op.settled`. The pair makes the round-trip durable end-to-end.

## Diagram schema

A diagram is a JSON object:

```json
{
  "scene": "checkout · fraud perspective",
  "centerLabel": "checkout service",
  "centerSublabel": "",
  "canvasStyleUri": "mutable://styles/dark-canvas",
  "objectStyleUri": "mutable://styles/entitya-main",
  "boxes": [
    {
      "id": "in1",
      "label": "user submits",
      "sublabel": "POST /checkout",
      "shape": "rounded",
      "x": 150, "y": 380, "w": 170, "h": 64,
      "styleUri": "mutable://styles/entitya-secondary"
    }
  ],
  "connectors": [
    { "id": "c1", "from": "in1", "to": "@center" }
  ]
}
```

### Field reference

| Field                | Values                                                                                          |
|----------------------|-------------------------------------------------------------------------------------------------|
| `scene`              | freeform string — the perspective being discussed                                                |
| `centerLabel`        | freeform string                                                                                  |
| `centerSublabel`     | freeform string (may be empty)                                                                   |
| `centerX`, `centerY` | absolute coordinates of the central square's top-left corner                                     |
| `canvasStyleUri`     | optional. Base URI of a canvas style pack (controls bg, font, axis labels, frame line)           |
| `objectStyleUri`     | optional. Base URI of an object style pack — the diagram-wide default for boxes / lines / center |
| `boxes[].shape`      | `rect` \| `rounded` \| `document` \| `subprocess` \| `database` \| `server` \| `cloud` \| `user` |
| `boxes[].x,y,w,h`    | absolute coordinates in a 1600 × 1000 viewBox                                                    |
| `boxes[].styleUri`   | optional. Per-box object pack override — wins over `objectStyleUri`                              |
| `connectors[]`       | optional. Each: `{ id, from, to }`. `from`/`to` are box IDs, or `"@center"` for the central square. |

`background` / `gradientFrom` / `gradientTo` used to live on the diagram;
they're now part of the canvas style pack. Loaders strip them off legacy
saves so the URL hash stays clean.

### Coordinate guide

The canvas is 1600 × 1000. The frame border spans `(88, 88)` to `(1512, 912)`. The central square is at `(620, 400)` to `(980, 600)`. Place boxes outside the center, inside the frame.

Suggested quadrant bands for a default 170 × 64 box:

| Quadrant              | x range       | y range       |
|-----------------------|---------------|---------------|
| Input (left)          | 100 — 450     | 100 — 836     |
| Output (right)        | 980 — 1340    | 100 — 836     |
| Dependencies (top)    | 100 — 1340    | 100 — 336     |
| Side-effects (bottom) | 100 — 1340    | 600 — 836     |

Position carries semantics. The placement principle: position should add information to the story being told.

## Style packs

The diagram itself is unstyled — fills, strokes, fonts, axis colors,
background mode all come from *style packs* bound at load time. Updating a
pack updates every diagram pointing at it. For frozen handoff, export the
PNG.

### Two kinds

| Kind     | Tokens                                                                              | Bound by                                                |
|----------|-------------------------------------------------------------------------------------|---------------------------------------------------------|
| `canvas` | `bgMode`, `bg`, `gradientFrom`, `gradientTo`, `frameStroke`, `axisInk`, `fontFamily` | `state.canvasStyleUri` (one per diagram)                |
| `object` | `fill`, `stroke`, `ink`, `muteInk`, `connectorStroke`, `arrowFill`                  | `state.objectStyleUri` (default) + `Box.styleUri` (per-box override) |

`bgMode` is one of `clean` / `grid` / `sections` / `diagonals` / `gradient`.
Gradient endpoints (`gradientFrom` / `gradientTo`) only matter when
`bgMode === "gradient"`.

Selection blue (`#3b82f6`) and connect-source green (`#10b981`) are
interaction feedback, not brand — they stay hardcoded.

### Per-component URIs

A pack is *not* stored as a single JSON blob. Every field is its own
URI:

```
mutable://styles/dark-canvas/kind         "canvas"
mutable://styles/dark-canvas/name         "dark-canvas"
mutable://styles/dark-canvas/bg           "#0f172a"
mutable://styles/dark-canvas/bgMode       "grid"
mutable://styles/dark-canvas/axisInk      "#94a3b8"
mutable://styles/dark-canvas/frameStroke  "#c8c4b8"
mutable://styles/dark-canvas/fontFamily   "Georgia, 'Times New Roman', serif"
mutable://styles/dark-canvas/gradientFrom "#ffffff"
mutable://styles/dark-canvas/gradientTo   "#efe7d2"
```

Each value is a single JSON-encoded string. `DiagramState` references
the *base* URI (`mutable://styles/dark-canvas`) — consumers don't have
to know which fields exist for which kind.

#### Why URIs over JSON

- **Auto-save writes one component**, not the whole pack. Editing one
  color rewrites a single small file; the others stay untouched.
- **Listing every pack is one round-trip**: `?fn=ls&format=full` against
  the namespace root returns every component URI+value, grouped by
  base client-side.
- **Loading a single pack is one round-trip**: scoped
  `<base>/?fn=ls&format=full` returns just that pack's components.
- **Disk layout mirrors the URI**: walk
  `~/.sideframer/styles/dark-canvas/` to see exactly what the pack
  contains.

The server's `ls` walks recursively and honors scope:
`mutable://x/sub/?fn=ls` walks only `sub/`. The recursive walk lives in
`server/server.mjs` (`walkFiles`).

### The styles mode

The **styles** mode (shortcut `s`) shows every pack as a clickable row.
Click a row to open the inline editor:

- The canvas live-previews the pack's tokens while the editor is open,
  even before binding.
- Every input change auto-saves with a short debounce (250 ms for
  tokens, 1 s for the name field).
- **apply** binds the pack to its matching diagram-level slot (canvas
  or object default). **close** discards the live preview and reverts
  to whatever's actually bound.
- New packs (`+ canvas pack` / `+ object pack`) start as an "unsaved"
  row at the top with the editor already open. The first auto-save
  promotes it to a normal row.

Per-box overrides happen in the inspector: select a box in draw mode,
pick an object pack from the *style* field.

### b3nd brand packs

The `bin/seed-b3nd-styles.mjs` script populates four packs derived from
the b3nd brand book (`../b3nd-brand/DECISIONS.md` and `proof.html`):

| Pack                 | Kind   | Notes                                                                  |
|----------------------|--------|------------------------------------------------------------------------|
| `b3nd-dark`          | canvas | Near-black `#050807` bg, system font, dim white axis labels            |
| `b3nd-light`         | canvas | Warm white `#fffcf8` bg, system font, mid-grey axis labels             |
| `b3nd-dark-object`   | object | Panel-mix fills, white labels, **neon green** `#39ff88` arrows (D7)    |
| `b3nd-light-object`  | object | Cream fills, black labels, **pink-deep** `#9e0870` arrows (D7)         |

```
node bin/seed-b3nd-styles.mjs                    # default server :5174
node bin/seed-b3nd-styles.mjs --server=http://...
```

Bind the pair that matches the mode you want: a diagram pointing at
`(b3nd-dark, b3nd-dark-object)` flips to light mode by switching the
two pickers to `(b3nd-light, b3nd-light-object)` — every visual cue
inverts, the diagram structure stays.

## Authoring diagrams programmatically

Use the helpers in `bin/`:

```
# JSON file → shareable URL
node bin/encode-diagram.mjs diagram.json

# stdin → URL
cat diagram.json | node bin/encode-diagram.mjs

# URL → JSON
node bin/decode-diagram.mjs "http://localhost:5173/#d=..."
```

The URL fragment carries the entire diagram — open it in a running
sideframer to view, edit, export PNG, or re-share. The hash beats
`localStorage` on bootstrap, so a freshly authored URL always shows what
was authored.

### Saving to the gallery

```
# JSON file → b3nd URI + load-in-app URL
node bin/save-diagram.mjs diagram.json
```

Both the browser and the CLI talk to the same storage server over HTTP
(via `b3nd-move`'s `HttpClient`). Anything an agent saves shows up in
your gallery.

Agents (Claude Code etc.) authoring diagrams from natural-language requests should read [`AGENTS.md`](./AGENTS.md) first.

## Transient artifacts

`.claude/`, `.playwright-mcp/`, and root-level `*.png` screenshots are
agent/tooling scratch and are gitignored. Drop a screenshot at the repo
root if you need to share it — it won't end up in a commit.
