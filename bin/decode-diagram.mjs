#!/usr/bin/env node
// Decode a sideframer URL back into the diagram JSON.
//
// Usage:
//   node bin/decode-diagram.mjs "<url>"

const url = process.argv[2];
if (!url || url === "-h" || url === "--help") {
  process.stderr.write("usage: decode-diagram.mjs <url>\n");
  process.exit(url ? 0 : 1);
}

const m = url.match(/[#&]d=([^&]+)/);
if (!m) {
  process.stderr.write("no diagram (#d=...) in URL\n");
  process.exit(1);
}

const b64 = m[1].replace(/-/g, "+").replace(/_/g, "/");
const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);

try {
  const json = Buffer.from(padded, "base64").toString("utf8");
  process.stdout.write(JSON.stringify(JSON.parse(json), null, 2) + "\n");
} catch (e) {
  process.stderr.write(`failed to decode: ${e.message}\n`);
  process.exit(1);
}
