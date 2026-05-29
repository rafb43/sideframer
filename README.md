# sideframer

Local web app for authoring DFT diagrams. See the [DFT spec](../dft/SPEC.md).

## Run

```
npm install
npm run dev
```

Open http://localhost:5173.

## v1 status

- [x] LRTB frame with axis labels
- [x] Click empty space in the frame to add a box
- [x] Drag boxes to reposition
- [x] Edit selected box (label, sublabel) via the bottom inspector
- [x] Theme + center label editing in the top toolbar
- [x] Copy PNG to clipboard
- [x] Persist working draft to `localStorage`
- [x] Share via URL fragment (`#d=<base64url-of-JSON>`) — hash beats localStorage on load
- [x] Three modes — **view** (read-only), **author** (edit boxes), **connect** (place arrows)
- [x] Connectors between boxes (and to/from the center) with arrow markers showing flow direction
- [ ] Save diagram as B3nd URI + payload (next round)
- [ ] Load diagram from B3nd URI (next round)

## Stack

Vite + vanilla TypeScript + SVG. No framework.

## Conventions

- The SVG `viewBox` is fixed at 1600 × 1000. Boxes use absolute coordinates inside that frame.
- Theme is declared above the frame. Output (right) is theme-relative — see the spec.
- The grammar is positional: boxes have no edges/arrows in v1. Position carries semantics.

## Diagram schema

A diagram is a JSON object:

```json
{
  "theme": "checkout · fraud perspective",
  "centerLabel": "checkout service",
  "centerSublabel": "",
  "background": "grid",
  "boxes": [
    {
      "id": "in1",
      "label": "user submits",
      "sublabel": "POST /checkout",
      "shape": "rounded",
      "x": 150, "y": 380, "w": 170, "h": 64
    }
  ],
  "connectors": [
    { "id": "c1", "from": "in1", "to": "@center" }
  ]
}
```

### Field reference

| Field             | Values                                                                        |
|-------------------|-------------------------------------------------------------------------------|
| `theme`           | freeform string — the perspective being discussed                             |
| `centerLabel`     | freeform string                                                               |
| `centerSublabel`  | freeform string (may be empty)                                                |
| `background`      | `clean` \| `grid` \| `sections` \| `diagonals` \| `gradient`                  |
| `boxes[].shape`   | `rect` \| `rounded` \| `document` \| `subprocess` \| `database` \| `server` \| `cloud` \| `user` |
| `boxes[].x,y,w,h` | absolute coordinates in a 1600 × 1000 viewBox                                 |
| `connectors[]`    | optional. Each: `{ id, from, to }`. `from`/`to` are box IDs, or `"@center"` for the central square. |

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

The URL fragment carries the entire diagram — open it in a running sideframer to view, edit, export PNG, or re-share. The hash beats `localStorage` on bootstrap, so a freshly authored URL always shows what was authored.

Agents (Claude Code etc.) authoring diagrams from natural-language requests should read [`AGENTS.md`](./AGENTS.md) first.
