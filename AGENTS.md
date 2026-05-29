# Notes for agents authoring diagrams

This repo includes a small CLI for producing sideframer diagram URLs from JSON, intended for AI coding agents (Claude Code and equivalents) that receive a request to draw a DFT and want to hand back a working, editable diagram.

## Step 1 — read the method spec

The diagramming method is **DFT** (Data Flow Topology). Read `../dft/SPEC.md` before composing anything. The grammar is positional: left=input, right=output (scene-relative), top=dependencies, bottom=side-effects, center=the thing.

## Step 2 — compose the JSON

Schema is documented in [`README.md`](./README.md) under "Diagram schema". Coordinates are absolute in a 1280×800 viewBox; the README has a quadrant guide.

Minimum valid diagram:

```json
{
  "scene": "the perspective you're drawing",
  "centerLabel": "the system",
  "centerSublabel": "",
  "background": "grid",
  "boxes": [],
  "connectors": []
}
```

`connectors` is optional. Each connector is `{ id, from, to }` where `from`/`to` are either box IDs from `boxes[]` or the special string `"@center"` to anchor at the central square. Arrows point from `from` to `to`. In v1 connectors are positional flourishes — the diagram's primary semantics still live in box placement.

## Step 3 — encode to URL

```
node bin/encode-diagram.mjs path/to/diagram.json
# or
cat diagram.json | node bin/encode-diagram.mjs
```

The script prints a single URL to stdout.

## Step 4 — hand the URL to the user

The user opens it in a running sideframer (`npm run dev`) and the diagram appears, ready to edit, export, or re-share. The fragment carries the whole diagram — no server needed.

**Always open the URL for the user.** When an agent is asked for an example, image, diagram, or any shareable link as part of the deliverable, run `open <url>` (macOS) / `xdg-open <url>` (Linux) so it appears in the browser immediately. Print the URL in the reply too, but don't make the user copy-paste to see what was produced.

## Things to watch for

- **State the scene.** Don't infer "the perspective" silently. The right-side output is scene-relative; without a scene, the diagram is ambiguous.
- **Side-effects are first-class.** If the system disturbs anything elsewhere, put it in the bottom quadrant. This is the most-forgotten quadrant.
- **Position carries semantics.** Connectors exist (see schema), but the grammar is primarily positional — placement decides role.
- **Don't overlap the center.** The central square is at `(620, 400)` to `(980, 600)`. Place all boxes outside this rectangle.
- **Box default size is 170×64.** Stay close unless intentionally varying.
- **`id` must be unique within `boxes[]`.** Short strings are fine (`"i1"`, `"o1"`, etc.).
- **Stay inside the frame.** `x` in `[96, 1512 − w]`, `y` in `[96, 912 − h]`. The app will clamp; better to send valid values.

## Composition guidelines

The placement principle decides *where* things go. These guidelines describe *what to put in each quadrant*. Don't drop a single box per side — favor a chain that names both the producing/receiving process and the payload entity. A diagram that reads `input: form submit` tells you nothing past position. A diagram that reads `UserApp (subprocess) → CheckoutRequest (document) → @center` tells you the entrypoint, gives the payload a searchable name, and reifies the producer so follow-up questions have somewhere to land.

### Input (left) — minimum 2 steps

```
subprocess (producer)  →  document (payload entity)  →  @center
```

The `subprocess` names *who* sent it — a user app, a scheduler, an upstream service, a cron. The `document` names *what arrived on the wire* — the message type, the request body shape, the event name.

**Pre-scene configurations** — when the process is shaped by a configuration or input provided *before* the runtime scene, and that influence should be visible, depict it on the input side as a document flowing into the center:

```
document (config / preserved input)  →  @center
```

This is distinct from a static dependency at the top: a pre-scene input is *passed to* the center as part of its setup; a static dep is *read by* the center during operation. The same blob can belong to either side depending on which framing tells the better story.

### Dependencies (top) — center initiates, chains stack vertically

The center is the *initiator* of every dependency. The first arrow goes from `@center` outward — to the request document for a live call, or to the document directly for a static dep. There is **no return arrow** from the chain back to `@center`: the dependency relationship is implicit in the chain pointing away from the center.

Two flavors:

**Static / preserved** (config blob, lookup table, pre-loaded resource):

```
@center  →  document
```

**Live call** (a round trip to a service):

```
@center  →  document (request)  →  subprocess (the service)  →  document (response)
```

**Stack each dependency as its own row above the center**, rather than spreading them in parallel across the top. The diagram should read as a list — first dep, second dep, third dep — with chain details extending sideways from each row. When order matters, top-to-bottom = call order.

### Output (right) — payload AND receiver

```
@center  →  document (output payload)  →  subprocess (receiver)
```

The receiver might be the same process that initiated the request (a round trip back), or a different downstream consumer. Name it explicitly so the diagram answers "who acts on this?".

### Side effects (bottom) — same shape as live dependencies, pointed out

```
@center  →  document (payload that goes out)  →  subprocess | database | server | cloud (receiver)
```

Match the receiver shape to what the thing actually is — `database` for a store, `server` for an upstream service, `subprocess` for an internal handler, `cloud` when it fans out somewhere external.

**Stack each side effect as its own row below the center**, same as dependencies. Top-to-bottom = order of operation when relevant.

### Why these chains

The chains turn each quadrant from a single noisy label into a tiny story: *who produced this, what entity is on the wire, who consumes it.* That is the information a reader of the diagram is trying to extract. Build the chains.

## Verifying

Round-trip your output to make sure it's well-formed:

```
node bin/encode-diagram.mjs diagram.json | xargs -I{} node bin/decode-diagram.mjs "{}"
```

The output JSON should match the input.
