#!/usr/bin/env -S node --experimental-strip-types --no-warnings
// Seed the four b3nd brand style packs into a running sideframer
// storage server.
//
// Usage:
//   node bin/seed-b3nd-styles.mjs
//   node bin/seed-b3nd-styles.mjs --server=http://localhost:5174
//
// Packs (slug → kind):
//   b3nd-dark         canvas
//   b3nd-light        canvas
//   b3nd-dark-object  object
//   b3nd-light-object object
//
// Bind in pairs: (b3nd-dark + b3nd-dark-object) or (b3nd-light +
// b3nd-light-object). The accent token (D7) carries the per-mode flow
// cue via arrowFill — neon green on dark, pink-deep on light.
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
const PINK_DEEP = "#9e0870";      // light accent ≈ mix(pink-deep, black 12%)

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
      fontFamily: SYSTEM_FONT,
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
      fontFamily: SYSTEM_FONT,
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
    },
  },
];

for (const pack of packs) {
  const rec = await styles.save(pack);
  console.log(`saved ${rec.uri}  (${pack.kind})`);
}
console.log("\ndone — open http://localhost:5173/#m=styles to bind.");
