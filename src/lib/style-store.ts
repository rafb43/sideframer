import { connection, Rig } from "@bandeira-tech/b3nd-core/rig";
import { HttpClient } from "@bandeira-tech/b3nd-move/http/client";
import { type Namespace, sluggify } from "./sluggify.ts";

// A style pack is a small JSON payload that overrides the default visual
// tokens of the diagram shell. Diagrams reference one by URI (`styleUri`);
// the binding is live — updating the pack updates every diagram that points
// at it. Snapshots happen only on PNG export.

export type StyleKind = "canvas" | "object";

export interface StylePack {
  name: string;
  /**
   * What the pack reskins. `canvas` packs control diagram-wide tokens
   * (background, typography, axis labels); `object` packs control box /
   * line / center tokens and can also be applied per-box as overrides.
   * Packs without a kind (older saves) are treated as `object` —
   * recreate them through the editor to claim a different role.
   */
  kind: StyleKind;
  tokens: Record<string, string>;
  createdAt?: number;
  updatedAt?: number;
}

export interface StylePackRecord {
  uri: string;
  slug: string;
  name: string;
  pack: StylePack;
}

const enc = new TextEncoder();
const dec = new TextDecoder();

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

async function bytesToJson(payload: unknown): Promise<unknown> {
  if (payload == null) return undefined;
  if (payload instanceof Uint8Array) return JSON.parse(dec.decode(payload));
  if (payload instanceof ReadableStream) {
    const chunks: Uint8Array[] = [];
    const reader = payload.getReader();
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      if (value) chunks.push(value);
    }
    const total = chunks.reduce((n, c) => n + c.byteLength, 0);
    const out = new Uint8Array(total);
    let off = 0;
    for (const c of chunks) {
      out.set(c, off);
      off += c.byteLength;
    }
    return JSON.parse(dec.decode(out));
  }
  if (typeof payload === "string") return JSON.parse(payload);
  return payload;
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
    const uri = this.ns.uriFor(slug);
    const bytes = toBytes({ ...pack, name });
    // `rig.receive` returns on pipeline-ack — the HTTP POST fires in the
    // background. Await `settled` so subsequent reads see the new state.
    const op = this.rig.receive([[uri, bytes]]);
    const results = await op;
    await op.settled;
    const result = results[0];
    if (!result || (typeof result === "object" && "accepted" in result && !result.accepted)) {
      throw new Error(`save rejected: ${JSON.stringify(result)}`);
    }
    return { uri, slug, name, pack: { ...pack, name } };
  }

  async load(uri: string): Promise<StylePackRecord | null> {
    const [out] = await this.rig.read([uri]);
    if (!out || out[1] == null) return null;
    const pack = (await bytesToJson(out[1])) as StylePack;
    const slug = this.ns.slugFromUri(uri);
    return { uri, slug, name: pack?.name || slug, pack };
  }

  async list(): Promise<{ uri: string; slug: string }[]> {
    const [out] = await this.rig.read([this.ns.listLocator]);
    if (!out || !Array.isArray(out[1])) return [];
    return (out[1] as string[]).map((uri) => ({
      uri,
      slug: this.ns.slugFromUri(uri),
    }));
  }
}
