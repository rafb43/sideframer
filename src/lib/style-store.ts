import { connection, Rig } from "@bandeira-tech/b3nd-core/rig";
import { HttpClient } from "@bandeira-tech/b3nd-move/http/client";
import { type Namespace, sluggify } from "./sluggify.ts";

// A style pack used to be saved as a single JSON blob at
// `mutable://styles/<slug>`. We now lean into the URI hierarchy:
// every field of the pack lives at its own URI, e.g.
//
//   mutable://styles/dark-canvas/kind   -> "canvas"
//   mutable://styles/dark-canvas/name   -> "dark-canvas"
//   mutable://styles/dark-canvas/bg     -> "#0f172a"
//   mutable://styles/dark-canvas/bgMode -> "grid"
//   ...
//
// Saves write N tuples in one `rig.receive` call; loads issue a single
// scoped `ls&format=full` read which returns every component for that
// base URI in one round-trip. Diagram state references the base URI
// (`mutable://styles/dark-canvas`) — never the per-component leaves —
// so consumers don't have to know which fields exist for which kind.

export type StyleKind = "canvas" | "object";

export interface StylePack {
  name: string;
  kind: StyleKind;
  tokens: Record<string, string>;
  createdAt?: number;
  updatedAt?: number;
}

export interface StylePackRecord {
  uri: string;       // base URI, e.g. mutable://styles/dark-canvas
  slug: string;
  name: string;
  pack: StylePack;
}

const enc = new TextEncoder();

export function createStyleRig(serverUrl: string, ns: Namespace): Rig {
  const client = new HttpClient({ url: serverUrl });
  return new Rig({
    routes: {
      receive: [connection(client, [ns.pattern])],
      read: [connection(client, [ns.pattern])],
    },
  });
}

function toBytes(value: unknown): Uint8Array {
  return enc.encode(JSON.stringify(value));
}

function componentUri(baseUri: string, key: string): string {
  return `${baseUri}/${key}`;
}

export class StyleStore {
  private rig: Rig;
  private ns: Namespace;
  constructor(rig: Rig, ns: Namespace) {
    this.rig = rig;
    this.ns = ns;
  }

  async save(pack: StylePack): Promise<StylePackRecord> {
    const name = pack.name || "untitled";
    const slug = sluggify(name);
    const base = this.ns.uriFor(slug);
    const tuples: [string, Uint8Array][] = [];
    tuples.push([componentUri(base, "kind"), toBytes(pack.kind)]);
    tuples.push([componentUri(base, "name"), toBytes(name)]);
    for (const [tokenName, value] of Object.entries(pack.tokens || {})) {
      tuples.push([componentUri(base, tokenName), toBytes(value)]);
    }
    const op = this.rig.receive(tuples);
    const results = await op;
    await op.settled;
    for (const r of results) {
      if (r && typeof r === "object" && "accepted" in r && !r.accepted) {
        throw new Error(`save rejected: ${JSON.stringify(r)}`);
      }
    }
    return { uri: base, slug, name, pack: { ...pack, name } };
  }

  // Load a single pack by issuing a scoped `ls&format=full` against its
  // base URI. The server returns every component in one trip.
  async load(baseUri: string): Promise<StylePackRecord | null> {
    const locator = `${baseUri}/?fn=ls&format=full`;
    const [out] = await this.rig.read([locator]);
    if (!out || !Array.isArray(out[1])) return null;
    const components = out[1] as [string, unknown][];
    if (components.length === 0) return null;
    return assemblePackRecord(this.ns, baseUri, components);
  }

  // List every pack the store knows about, in a single round-trip.
  // The ns-wide `ls&format=full` returns every component URI + value;
  // we group by base URI (everything before the last path segment) and
  // assemble one record per pack.
  async list(): Promise<StylePackRecord[]> {
    const locator = `${this.ns.base}/?fn=ls&format=full`;
    const [out] = await this.rig.read([locator]);
    if (!out || !Array.isArray(out[1])) return [];
    const components = out[1] as [string, unknown][];
    const byBase = new Map<string, [string, unknown][]>();
    const nsPrefix = `${this.ns.base}/`;
    for (const entry of components) {
      const [uri] = entry;
      if (!uri.startsWith(nsPrefix)) continue;
      const rel = uri.slice(nsPrefix.length);
      const firstSlash = rel.indexOf("/");
      if (firstSlash <= 0) continue;
      const slug = rel.slice(0, firstSlash);
      const base = `${this.ns.base}/${slug}`;
      let bucket = byBase.get(base);
      if (!bucket) { bucket = []; byBase.set(base, bucket); }
      bucket.push(entry);
    }
    const records: StylePackRecord[] = [];
    for (const [base, bucket] of byBase) {
      const rec = assemblePackRecord(this.ns, base, bucket);
      if (rec) records.push(rec);
    }
    return records;
  }
}

function assemblePackRecord(
  ns: Namespace,
  baseUri: string,
  components: [string, unknown][],
): StylePackRecord | null {
  let kind: StyleKind = "object";
  let name = "";
  const tokens: Record<string, string> = {};
  const prefix = `${baseUri}/`;
  let sawAny = false;
  for (const [uri, value] of components) {
    if (!uri.startsWith(prefix)) continue;
    sawAny = true;
    const key = uri.slice(prefix.length);
    const strVal = typeof value === "string" ? value : String(value ?? "");
    if (key === "kind") kind = strVal === "canvas" ? "canvas" : "object";
    else if (key === "name") name = strVal;
    else tokens[key] = strVal;
  }
  if (!sawAny) return null;
  const slug = ns.slugFromUri(baseUri);
  const finalName = name || slug;
  return {
    uri: baseUri,
    slug,
    name: finalName,
    pack: { name: finalName, kind, tokens },
  };
}
