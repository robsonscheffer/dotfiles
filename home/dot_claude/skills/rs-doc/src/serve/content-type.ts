const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
};

export function contentTypeFor(path: string): string {
  const idx = path.lastIndexOf(".");
  if (idx === -1) return "application/octet-stream";
  const ext = path.slice(idx).toLowerCase();
  return TYPES[ext] ?? "application/octet-stream";
}
