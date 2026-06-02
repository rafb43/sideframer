// URI namespace contract. Both the browser app and the storage server import
// from here — keeping the two halves of the wire format from drifting.
//
// Namespaces are *injected* via a provider function (e.g. `() => "mutable://styles"`)
// rather than hardcoded. The provider is the dataspace root for one b3nd
// application — change it and the whole app moves to a different mount point
// (different scheme, different node, different prefix) without code changes.
// This is the convention for any b3nd app in this repo: take the namespace at
// the boundary, then derive every URI from it.

const FILE_EXT = ".json";

export type NamespaceProvider = () => string;

export interface Namespace {
  /** Root URI (no trailing slash), e.g. `mutable://diagrams`. */
  readonly base: string;
  /** Glob pattern for routing in a Rig, e.g. `mutable://diagrams/**`. */
  readonly pattern: string;
  /** Locator that asks the backend to list URIs in this namespace. */
  readonly listLocator: string;
  /** Concrete URI for a given slug. */
  uriFor(slug: string): string;
  /** Extract the slug from a URI in this namespace. */
  slugFromUri(uri: string): string;
  /** Filename (no directory) the server should use for a given URI. */
  uriToFilename(uri: string): string;
  /** Inverse of `uriToFilename` — recover the URI from a filename on disk. */
  filenameToUri(filename: string): string | null;
}

export function createNamespace(provider: NamespaceProvider): Namespace {
  const base = provider().replace(/\/+$/, "");
  const prefix = `${base}/`;
  return {
    base,
    pattern: `${prefix}**`,
    listLocator: `${prefix}?fn=ls&format=uris`,
    uriFor(slug) {
      return `${prefix}${slug}`;
    },
    slugFromUri(uri) {
      return uri.replace(prefix, "").split("?")[0];
    },
    uriToFilename(uri) {
      return `${this.slugFromUri(uri)}${FILE_EXT}`;
    },
    filenameToUri(filename) {
      if (!filename.endsWith(FILE_EXT)) return null;
      return this.uriFor(filename.slice(0, -FILE_EXT.length));
    },
  };
}

export function sluggify(scene: string): string {
  const slug = scene
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return slug || "untitled";
}

export interface ParsedLocator {
  uri: string;
  fn: "read" | "ls" | "count" | string;
  format: "full" | "uris" | string;
}

export function parseLocator(url: string): ParsedLocator {
  const qIdx = url.indexOf("?");
  const uri = qIdx === -1 ? url : url.slice(0, qIdx);
  const params = new URLSearchParams(qIdx === -1 ? "" : url.slice(qIdx + 1));
  return {
    uri,
    fn: params.get("fn") || "read",
    format: params.get("format") || "full",
  };
}
