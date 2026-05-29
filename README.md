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
