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
  return `mutable://diagrams/${slug}`;
}

export function slugFromUri(uri: string): string {
  return uri.replace(/^mutable:\/\/diagrams\//, "");
}
