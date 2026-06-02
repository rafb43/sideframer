#!/usr/bin/env node
// Sideframer storage server.
//
// One process. Owns a Rig that mounts multiple b3nd apps — each pinned to its
// own filesystem directory. Both the browser app and the CLI talk to this
// server. New apps register by calling `mountFs(ns, dir)` and adding the
// returned connection to the Rig routes.
//
// We assemble the HTTP route table by hand instead of calling
// `httpApi(rig)` so we can swap in a receive action that awaits
// `op.settled` — pipeline-ack alone returns before our FS write
// completes, which races with a subsequent list/read on the same URI.

import http from "node:http";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { Readable } from "node:stream";
import { homedir } from "node:os";

import { connection, Rig } from "@bandeira-tech/b3nd-core/rig";

// Internal subpaths — used here for the route table customization
// described in the file header. Pinned to the local node_modules path so
// strict `exports` in b3nd-move's package.json doesn't block them.
import { dispatchHttp, httpRequest, route } from "../node_modules/@bandeira-tech/b3nd-move/esm/http/router.js";
import { json } from "../node_modules/@bandeira-tech/b3nd-move/esm/http/wire.js";
import { receiveRoute } from "../node_modules/@bandeira-tech/b3nd-move/esm/http/receive.js";
import { readRoute } from "../node_modules/@bandeira-tech/b3nd-move/esm/http/read.js";
import { observeRoute } from "../node_modules/@bandeira-tech/b3nd-move/esm/http/observe.js";
import { statusRoute } from "../node_modules/@bandeira-tech/b3nd-move/esm/http/status.js";

import { createNamespace, parseLocator } from "../src/lib/sluggify.ts";

const PORT = Number(process.env.SIDEFRAMER_PORT) || 5174;
const ROOT = process.env.SIDEFRAMER_DATA || join(homedir(), ".sideframer");

const decoder = new TextDecoder();
const encoder = new TextEncoder();

// One mounted b3nd app: a namespace + filesystem directory.
function mountFs(ns, dir) {
  const filePath = (uri) => join(dir, ns.uriToFilename(uri));
  const client = {
    async receive(msgs) {
      const results = [];
      for (const [uri, payload] of msgs) {
        try {
          if (!uri.startsWith(`${ns.base}/`)) throw new Error(`uri outside ${ns.base}`);
          const bytes = payload instanceof Uint8Array
            ? payload
            : encoder.encode(JSON.stringify(payload));
          // Verify it parses (loud-fail on malformed input)
          JSON.parse(decoder.decode(bytes));
          const path = filePath(uri);
          await mkdir(dirname(path), { recursive: true });
          await writeFile(path, bytes);
          results.push({ accepted: true });
        } catch (err) {
          results.push({ accepted: false, error: String(err?.message || err) });
        }
      }
      return results;
    },

    async read(urls) {
      const out = [];
      for (const rawUrl of urls) {
        const { uri, fn, format } = parseLocator(rawUrl);
        if (fn === "ls") {
          let entries = [];
          try {
            const dirents = await readdir(dir, { withFileTypes: true });
            entries = dirents
              .filter((e) => e.isFile())
              .map((e) => ns.filenameToUri(e.name))
              .filter((u) => u !== null);
          } catch (e) {
            if (e?.code !== "ENOENT") throw e;
          }
          if (format === "full") {
            const full = [];
            for (const u of entries) {
              try {
                const json = await readFile(filePath(u), "utf8");
                full.push([u, JSON.parse(json)]);
              } catch { /* skip unreadable */ }
            }
            out.push([rawUrl, full]);
          } else {
            out.push([rawUrl, entries]);
          }
        } else {
          try {
            const json = await readFile(filePath(uri), "utf8");
            out.push([rawUrl, JSON.parse(json)]);
          } catch (e) {
            if (e?.code === "ENOENT") out.push([rawUrl, undefined]);
            else throw e;
          }
        }
      }
      return out;
    },

    async *observe() { /* no-op: not used in v1 */ },

    async status() {
      return { ok: true, dir };
    },
  };
  return { ns, dir, client };
}

// Mount the two apps. Each gets its own directory so slugs can't collide
// across namespaces.
const apps = [
  mountFs(createNamespace(() => "mutable://diagrams"), join(ROOT, "diagrams")),
  mountFs(createNamespace(() => "mutable://styles"), join(ROOT, "styles")),
];

for (const app of apps) {
  await mkdir(app.dir, { recursive: true });
}

const rig = new Rig({
  routes: {
    receive: apps.map((a) => connection(a.client, [a.ns.pattern])),
    read: apps.map((a) => connection(a.client, [a.ns.pattern])),
  },
});

// Receive route that waits for full route-dispatch settlement before
// returning the response. The stock `rig.receive()` resolves on
// pipeline-ack — the per-route handler (our `writeFile`) still runs in
// the background. For a local FS-backed server we want the response to
// guarantee durability, so callers can list/read right away.
const settledReceiveRoute = route({
  on: httpRequest("POST", "/api/v1/receive"),
  decode: receiveRoute.decode,
  action: async (rig, [outputs]) => {
    const op = rig.receive(outputs);
    const results = await op;
    await op.settled;
    return results;
  },
  encode: (results) => json(results, 200),
});

const routes = [statusRoute(), settledReceiveRoute, readRoute, observeRoute];
const handler = (req) => dispatchHttp(rig, routes, req);

function nodeReqToWebReq(req) {
  const host = req.headers.host || `localhost:${PORT}`;
  const url = `http://${host}${req.url}`;
  const init = { method: req.method, headers: req.headers };
  if (req.method && !["GET", "HEAD"].includes(req.method)) {
    init.body = Readable.toWeb(req);
    init.duplex = "half";
  }
  return new Request(url, init);
}

async function webResToNodeRes(webRes, nodeRes) {
  nodeRes.statusCode = webRes.status;
  webRes.headers.forEach((v, k) => nodeRes.setHeader(k, v));
  nodeRes.setHeader("Access-Control-Allow-Origin", "*");
  nodeRes.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  nodeRes.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (webRes.body) Readable.fromWeb(webRes.body).pipe(nodeRes);
  else nodeRes.end();
}

const server = http.createServer(async (req, res) => {
  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    res.statusCode = 204;
    res.end();
    return;
  }
  try {
    const webRes = await handler(nodeReqToWebReq(req));
    await webResToNodeRes(webRes, res);
  } catch (err) {
    console.error("[sideframer-server]", err);
    res.statusCode = 500;
    res.end(String(err?.message || err));
  }
});

server.listen(PORT, () => {
  console.log(`[sideframer-server] http://localhost:${PORT}`);
  for (const app of apps) {
    console.log(`[sideframer-server] mount: ${app.ns.base} → ${app.dir}`);
  }
});
