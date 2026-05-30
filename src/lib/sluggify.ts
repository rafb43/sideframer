// Single source of truth for the diagram URI contract. Both the browser app
// and the storage server import from here — keeping the two halves of the
// wire format from drifting.

export const DIAGRAM_PREFIX = "mutable://diagrams/";
export const DIAGRAM_PATTERN = `${DIAGRAM_PREFIX}**`;
export const LIST_LOCATOR = `${DIAGRAM_PREFIX}?fn=ls&format=uris`;

const FILE_EXT = ".json";

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

export function diagramUri(slug: string): string {
  return `${DIAGRAM_PREFIX}${slug}`;
}

export function slugFromUri(uri: string): string {
  return uri.replace(DIAGRAM_PREFIX, "").split("?")[0];
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

/** Filename (no directory) the server should use for a given URI. */
export function uriToFilename(uri: string): string {
  return `${slugFromUri(uri)}${FILE_EXT}`;
}

/** Inverse of `uriToFilename` — recover the URI from a filename listed on disk. */
export function filenameToUri(filename: string): string | null {
  if (!filename.endsWith(FILE_EXT)) return null;
  return diagramUri(filename.slice(0, -FILE_EXT.length));
}
