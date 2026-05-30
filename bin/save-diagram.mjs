#!/usr/bin/env -S node --experimental-strip-types --no-warnings
// Save a diagram JSON to the sideframer server's b3nd-backed gallery.
//
// Usage:
//   node bin/save-diagram.mjs diagram.json
//   cat diagram.json | node bin/save-diagram.mjs
//   node bin/save-diagram.mjs --server=http://localhost:5174 diagram.json
//
// Prints the b3nd URI and the share URL.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { createClientRig, DiagramStore } from "../src/lib/diagram-store.ts";

const args = process.argv.slice(2);
let server = "http://localhost:5174";
let viewer = "http://localhost:5173";
const positional = [];
for (const a of args) {
  if (a.startsWith("--server=")) server = a.slice(9);
  else if (a.startsWith("--viewer=")) viewer = a.slice(9);
  else if (a === "-h" || a === "--help") {
    process.stderr.write(
      "usage: save-diagram.mjs [--server=URL] [--viewer=URL] [file]\n",
    );
    process.exit(0);
  } else positional.push(a);
}

const input = positional[0]
  ? readFileSync(positional[0], "utf8")
  : readFileSync(0, "utf8");

let diagram;
try {
  diagram = JSON.parse(input);
} catch (e) {
  process.stderr.write(`invalid JSON: ${e.message}\n`);
  process.exit(1);
}

// Tolerate the legacy `theme` field — sideframer's UI uses `scene`.
if (diagram.theme && !diagram.scene) diagram.scene = diagram.theme;

const rig = createClientRig(server);
const store = new DiagramStore(rig);

try {
  const rec = await store.save(diagram);
  process.stdout.write(`saved   ${rec.uri}\n`);
  process.stdout.write(`open    ${viewer}/?load=${encodeURIComponent(rec.uri)}\n`);
} catch (e) {
  process.stderr.write(`save failed: ${e?.message || e}\n`);
  process.stderr.write(`  is the server running?  npm run serve\n`);
  process.exit(1);
}
