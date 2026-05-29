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
- [ ] Save diagram as B3nd URI + payload (next round)
- [ ] Load diagram from B3nd URI (next round)

## Stack

Vite + vanilla TypeScript + SVG. No framework.

## Conventions

- The SVG `viewBox` is fixed at 1280 × 800. Boxes use absolute coordinates inside that frame.
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
| `boxes[].shape`   | `rect` \| `rounded` \| `document` \| `subprocess` \| `database` \| `server` \| `cloud` |
| `boxes[].x,y,w,h` | absolute coordinates in a 1280 × 800 viewBox                                  |

### Coordinate guide

The canvas is 1280 × 800. The frame border spans `(88, 88)` to `(1192, 712)`. The central square is at `(460, 300)` to `(820, 500)`. Place boxes outside the center, inside the frame.

Suggested quadrant bands for a default 170 × 64 box:

| Quadrant              | x range       | y range       |
|-----------------------|---------------|---------------|
| Input (left)          | 100 — 290     | 100 — 640     |
| Output (right)        | 820 — 1020    | 100 — 640     |
| Dependencies (top)    | 100 — 1020    | 100 — 240     |
| Side-effects (bottom) | 100 — 1020    | 500 — 640     |

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
