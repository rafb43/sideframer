#!/usr/bin/env node
// Encode a sideframer diagram (JSON) into a shareable URL.
//
// Usage:
//   node bin/encode-diagram.mjs diagram.json
//   cat diagram.json | node bin/encode-diagram.mjs
//   node bin/encode-diagram.mjs --host=http://localhost:5173 diagram.json
//
// The output URL carries the diagram in its fragment (#d=...). Open it in a
// running sideframer to view, edit, export PNG, or re-share.

import { readFileSync } from "node:fs";

const args = process.argv.slice(2);
let host = "http://localhost:5173";
const positional = [];
for (const a of args) {
  if (a.startsWith("--host=")) host = a.slice(7);
  else if (a === "-h" || a === "--help") {
    process.stderr.write("usage: encode-diagram.mjs [--host=URL] [file]\n");
    process.exit(0);
  } else positional.push(a);
}

const input = positional[0]
  ? readFileSync(positional[0], "utf8")
  : readFileSync(0, "utf8");

let parsed;
try {
  parsed = JSON.parse(input);
} catch (e) {
  process.stderr.write(`invalid JSON: ${e.message}\n`);
  process.exit(1);
}

const encoded = Buffer.from(JSON.stringify(parsed), "utf8")
  .toString("base64")
  .replace(/\+/g, "-")
  .replace(/\//g, "_")
  .replace(/=+$/, "");

process.stdout.write(`${host}/#d=${encoded}\n`);
