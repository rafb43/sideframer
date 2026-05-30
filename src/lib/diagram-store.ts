import { connection, Rig } from "@bandeira-tech/b3nd-core/rig";
import { HttpClient } from "@bandeira-tech/b3nd-move/http/client";
import {
  DIAGRAM_PATTERN,
  diagramUri,
  LIST_LOCATOR,
  slugFromUri,
  sluggify,
} from "./sluggify.ts";

export interface DiagramRecord {
  uri: string;
  slug: string;
  scene: string;
  diagram: unknown;
}

const enc = new TextEncoder();
const dec = new TextDecoder();

export function createClientRig(serverUrl: string): Rig {
  const client = new HttpClient({ url: serverUrl });
  return new Rig({
    routes: {
      receive: [connection(client, [DIAGRAM_PATTERN])],
      read: [connection(client, [DIAGRAM_PATTERN])],
    },
  });
}

function toBytes(diagram: unknown): Uint8Array {
  return enc.encode(JSON.stringify(diagram));
}

async function bytesToDiagram(payload: unknown): Promise<unknown> {
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
  // Fallback: HTTP transport may already decode bytes into a string or object.
  if (typeof payload === "string") return JSON.parse(payload);
  return payload;
}

export class DiagramStore {
  private rig: Rig;
  constructor(rig: Rig) {
    this.rig = rig;
  }

  async save(diagram: { scene?: string }): Promise<DiagramRecord> {
    const scene = diagram.scene || "untitled";
    const slug = sluggify(scene);
    const uri = diagramUri(slug);
    const bytes = toBytes(diagram);
    const results = await this.rig.receive([[uri, bytes]]);
    const result = results[0];
    if (!result || (typeof result === "object" && "accepted" in result && !result.accepted)) {
      throw new Error(`save rejected: ${JSON.stringify(result)}`);
    }
    return { uri, slug, scene, diagram };
  }

  async load(uri: string): Promise<DiagramRecord | null> {
    const [out] = await this.rig.read([uri]);
    if (!out || out[1] == null) return null;
    const diagram = await bytesToDiagram(out[1]);
    const slug = slugFromUri(uri);
    const scene = (diagram as { scene?: string })?.scene || slug;
    return { uri, slug, scene, diagram };
  }

  async list(): Promise<{ uri: string; slug: string }[]> {
    const [out] = await this.rig.read([LIST_LOCATOR]);
    if (!out || !Array.isArray(out[1])) return [];
    return (out[1] as string[]).map((uri) => ({
      uri,
      slug: slugFromUri(uri),
    }));
  }
}
