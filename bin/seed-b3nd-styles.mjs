#!/usr/bin/env -S node --experimental-strip-types --no-warnings
// Seed the b3nd brand style packs into a running sideframer storage
// server.
//
// Usage:
//   node bin/seed-b3nd-styles.mjs
//   node bin/seed-b3nd-styles.mjs --server=http://localhost:5174
//
// Packs (slug → kind):
//   b3nd-dark           canvas
//   b3nd-light          canvas
//   b3nd-green-canvas   canvas   — mint wash, "this chart is about a good thing"
//   b3nd-pink-canvas    canvas   — pink wash, "this chart is about a brand moment"
//   b3nd-fail-canvas    canvas   — red wash, "this chart is about failure"
//   b3nd-dark-object    object
//   b3nd-light-object   object
//   b3nd-green-object   object   — neon-green filled boxes (D7 green)
//   b3nd-pink-object    object   — pink-deep filled boxes (D7 pink-deep)
//   b3nd-fail-object    object   — signal-red filled boxes (D8 destructive)
//
// Bind in pairs: (b3nd-dark + b3nd-dark-object) or (b3nd-light +
// b3nd-light-object). The accent token (D7) carries the per-mode flow
// cue via arrowFill — neon green on dark, pink-deep on light.
//
// The green/pink/fail packs are emphatic accents: bind one of the
// `*-canvas` packs when the whole chart is "about" that topic, or
// apply one of the `*-object` packs per-box (inspector → style) to
// highlight specific boxes inside a neutral diagram.
//
// The token values map the b3nd palette from /Users/m0/ws/b3nd-brand
// (see DECISIONS.md and proof.html) onto sideframer's canvas/object
// token sets. surface-mix expressions from `proof.html` are baked to
// literal hex so this script doesn't need a color engine.

import { createStyleRig, StyleStore } from "../src/lib/style-store.ts";
import { createNamespace } from "../src/lib/sluggify.ts";

function parseArgs() {
  let server = "http://localhost:5174";
  for (const arg of process.argv.slice(2)) {
    if (arg.startsWith("--server=")) server = arg.slice("--server=".length);
  }
  return { server };
}

const { server } = parseArgs();
const ns = createNamespace(() => "mutable://styles");
const styles = new StyleStore(createStyleRig(server, ns), ns);

const SYSTEM_FONT = "system-ui, -apple-system, Segoe UI, sans-serif";

// b3nd canonical palette (proof.html → :root)
const BLACK = "#050807";
const WHITE = "#fffcf8";
const GREEN = "#39ff88";          // dark accent
const PINK = "#ff3fb7";           // bright pink (D7 accent-bright)
const PINK_DEEP = "#9e0870";      // light accent ≈ mix(pink-deep, black 12%)
const RED = "#ff4747";            // signal red (D8 destructive)
const RED_DEEP = "#b33232";       // light-mode signal ≈ mix(red, black 30%)

// Deep companion shades for strokes / connectors on the emphatic packs
const GREEN_DEEP = "#1d8a52";
const PINK_DARKER = "#7a0654";
const RED_DARKER = "#8a2424";

// Pale washes for canvas backgrounds — light enough that the default
// ink palette still reads, saturated enough to read as a "topic".
const GREEN_WASH = "#eafff2";
const GREEN_WASH_2 = "#cdf5da";
const GREEN_FRAME = "#bfe5cf";
const GREEN_AXIS = "#3d6b50";

const PINK_WASH = "#fff0f8";
const PINK_WASH_2 = "#fcd5ec";
const PINK_FRAME = "#f0c8e0";
const PINK_AXIS = "#7a3d68";

const RED_WASH = "#fff0ee";
const RED_WASH_2 = "#fbd2cc";
const RED_FRAME = "#f4c8c0";
const RED_AXIS = "#80322a";

// Tinted mute-inks for filled-color object packs (light text on saturated fill)
const PINK_MUTE = "#f5c8e4";
const RED_MUTE = "#f5c8c4";
const GREEN_MUTE_INK = "#1a3a25"; // dark text on green needs a deeper mute

// Dark surface neutrals (baked color-mix from proof.html)
const DARK_PANEL = "#1c1c22";
const DARK_LINE = "#26262e";
const DARK_RULE2 = "#33333d";
const DARK_INK_DIM = "#a5a5af";
const DARK_INK_MUTE = "#82828b";

// Light surface neutrals
const LIGHT_PANEL = "#f0ece4";
const LIGHT_LINE = "#dad6ce";
const LIGHT_RULE2 = "#9b9892";
const LIGHT_INK_DIM = "#4e4e48";
const LIGHT_INK_MUTE = "#7b7b75";

const packs = [
  {
    name: "b3nd-dark",
    kind: "canvas",
    tokens: {
      bgMode: "clean",
      bg: BLACK,
      frameStroke: DARK_LINE,
      axisInk: DARK_INK_MUTE,
      gradientFrom: "#15151a",
      gradientTo: BLACK,
    },
  },
  {
    name: "b3nd-light",
    kind: "canvas",
    tokens: {
      bgMode: "clean",
      bg: WHITE,
      frameStroke: LIGHT_LINE,
      axisInk: LIGHT_INK_MUTE,
      gradientFrom: WHITE,
      gradientTo: "#f0ece4",
    },
  },
  {
    name: "b3nd-dark-object",
    kind: "object",
    tokens: {
      fill: DARK_PANEL,
      stroke: DARK_RULE2,
      ink: WHITE,
      muteInk: DARK_INK_DIM,
      connectorStroke: DARK_INK_MUTE,
      arrowFill: GREEN,
      fontFamily: SYSTEM_FONT,
    },
  },
  {
    name: "b3nd-light-object",
    kind: "object",
    tokens: {
      fill: LIGHT_PANEL,
      stroke: LIGHT_RULE2,
      ink: BLACK,
      muteInk: LIGHT_INK_DIM,
      connectorStroke: LIGHT_INK_MUTE,
      arrowFill: PINK_DEEP,
      fontFamily: SYSTEM_FONT,
    },
  },

  // Emphatic canvases — wash the whole diagram in a topical tint.
  // Backgrounds are pale so default ink (and the neutral object packs)
  // still read; the gradient pair pulls toward a deeper saturation.
  {
    name: "b3nd-green-canvas",
    kind: "canvas",
    tokens: {
      bgMode: "clean",
      bg: GREEN_WASH,
      frameStroke: GREEN_FRAME,
      axisInk: GREEN_AXIS,
      gradientFrom: GREEN_WASH,
      gradientTo: GREEN_WASH_2,
    },
  },
  {
    name: "b3nd-pink-canvas",
    kind: "canvas",
    tokens: {
      bgMode: "clean",
      bg: PINK_WASH,
      frameStroke: PINK_FRAME,
      axisInk: PINK_AXIS,
      gradientFrom: PINK_WASH,
      gradientTo: PINK_WASH_2,
    },
  },
  {
    name: "b3nd-fail-canvas",
    kind: "canvas",
    tokens: {
      bgMode: "clean",
      bg: RED_WASH,
      frameStroke: RED_FRAME,
      axisInk: RED_AXIS,
      gradientFrom: RED_WASH,
      gradientTo: RED_WASH_2,
    },
  },

  // Emphatic object packs — saturated fills so individual boxes shout.
  // Bind diagram-wide for "the whole picture is X", or apply per-box
  // from the inspector to mark a single highlight inside a neutral
  // diagram. ink/muteInk are chosen to clear contrast on the fill.
  {
    name: "b3nd-green-object",
    kind: "object",
    tokens: {
      fill: GREEN,
      stroke: GREEN_DEEP,
      ink: BLACK,
      muteInk: GREEN_MUTE_INK,
      connectorStroke: GREEN_DEEP,
      arrowFill: BLACK,
      fontFamily: SYSTEM_FONT,
    },
  },
  {
    name: "b3nd-pink-object",
    kind: "object",
    tokens: {
      fill: PINK,
      stroke: PINK_DARKER,
      ink: WHITE,
      muteInk: PINK_MUTE,
      connectorStroke: PINK_DARKER,
      arrowFill: WHITE,
      fontFamily: SYSTEM_FONT,
    },
  },
  {
    name: "b3nd-fail-object",
    kind: "object",
    tokens: {
      fill: RED,
      stroke: RED_DARKER,
      ink: WHITE,
      muteInk: RED_MUTE,
      connectorStroke: RED_DARKER,
      arrowFill: WHITE,
      fontFamily: SYSTEM_FONT,
    },
  },
];

for (const pack of packs) {
  const rec = await styles.save(pack);
  console.log(`saved ${rec.uri}  (${pack.kind})`);
}
console.log("\ndone — open http://localhost:5173/#m=styles to bind.");
