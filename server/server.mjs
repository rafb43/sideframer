#!/usr/bin/env node
// Sideframer storage server.
//
// One process. Owns a Rig backed by a filesystem-resident PIN client; served
// over HTTP via b3nd-move's httpApi. Both the browser app and the CLI talk to
// this server — same rig, same URIs, same diagrams.

import http from "node:http";
import { mkdir, readdir, readFile, stat, unlink, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { Readable } from "node:stream";
import { homedir } from "node:os";

import { connection, Rig } from "@bandeira-tech/b3nd-core/rig";
import { httpApi } from "@bandeira-tech/b3nd-move/http/service";

import {
  DIAGRAM_PATTERN,
  DIAGRAM_PREFIX,
  filenameToUri,
  parseLocator,
  uriToFilename,
} from "../src/lib/sluggify.ts";

const PORT = Number(process.env.SIDEFRAMER_PORT) || 5174;
const DATA_DIR = process.env.SIDEFRAMER_DATA || join(homedir(), ".sideframer", "diagrams");

await mkdir(DATA_DIR, { recursive: true });

const decoder = new TextDecoder();
const encoder = new TextEncoder();

function filePath(uri) {
  return join(DATA_DIR, uriToFilename(uri));
}

const diagramsClient = {
  async receive(msgs) {
    const results = [];
    for (const [uri, payload] of msgs) {
      try {
        if (!uri.startsWith(DIAGRAM_PREFIX)) throw new Error(`uri outside ${DIAGRAM_PREFIX}`);
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
          const dirents = await readdir(DATA_DIR, { withFileTypes: true });
          entries = dirents
            .filter((e) => e.isFile())
            .map((e) => filenameToUri(e.name))
            .filter((u) => u !== null);
        } catch (e) {
          if (e?.code !== "ENOENT") throw e;
        }
        if (format === "full") {
          // not used today but cheap to provide: pair each uri with its payload
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
    return { ok: true, dir: DATA_DIR };
  },
};

const rig = new Rig({
  routes: {
    receive: [connection(diagramsClient, [DIAGRAM_PATTERN])],
    read: [connection(diagramsClient, [DIAGRAM_PATTERN])],
  },
});

const handler = httpApi(rig);

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
  console.log(`[sideframer-server] data: ${DATA_DIR}`);
});
