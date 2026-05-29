# Notes for agents authoring diagrams

This repo includes a small CLI for producing sideframer diagram URLs from JSON, intended for AI coding agents (Claude Code and equivalents) that receive a request to draw a DFT and want to hand back a working, editable diagram.

## Step 1 — read the method spec

The diagramming method is **DFT** (Data Flow Topology). Read `../dft/SPEC.md` before composing anything. The grammar is positional: left=input, right=output (theme-relative), top=dependencies, bottom=side-effects, center=the thing.

## Step 2 — compose the JSON

Schema is documented in [`README.md`](./README.md) under "Diagram schema". Coordinates are absolute in a 1280×800 viewBox; the README has a quadrant guide.

Minimum valid diagram:

```json
{
  "theme": "the perspective you're drawing",
  "centerLabel": "the system",
  "centerSublabel": "",
  "background": "grid",
  "boxes": []
}
```

## Step 3 — encode to URL

```
node bin/encode-diagram.mjs path/to/diagram.json
# or
cat diagram.json | node bin/encode-diagram.mjs
```

The script prints a single URL to stdout.

## Step 4 — hand the URL to the user

The user opens it in a running sideframer (`npm run dev`) and the diagram appears, ready to edit, export, or re-share. The fragment carries the whole diagram — no server needed.

## Things to watch for

- **State the theme.** Don't infer "the perspective" silently. The right-side output is theme-relative; without a theme, the diagram is ambiguous.
- **Side-effects are first-class.** If the system disturbs anything elsewhere, put it in the bottom quadrant. This is the most-forgotten quadrant.
- **Position carries semantics.** There are no connector arrows in v1. The grammar is positional, not graph-theoretic.
- **Don't overlap the center.** The central square is at `(460, 300)` to `(820, 500)`. Place all boxes outside this rectangle.
- **Box default size is 170×64.** Stay close unless intentionally varying.
- **`id` must be unique within `boxes[]`.** Short strings are fine (`"i1"`, `"o1"`, etc.).
- **Stay inside the frame.** `x` in `[96, 1184 − w]`, `y` in `[96, 704 − h]`. The app will clamp; better to send valid values.

## Verifying

Round-trip your output to make sure it's well-formed:

```
node bin/encode-diagram.mjs diagram.json | xargs -I{} node bin/decode-diagram.mjs "{}"
```

The output JSON should match the input.
