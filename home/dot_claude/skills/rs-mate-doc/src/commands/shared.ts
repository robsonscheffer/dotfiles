// Small helpers shared across command implementations.
import { readdir } from "node:fs/promises";
import { join } from "node:path";

export async function collectMarkdownFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const out: string[] = [];
  for (const entry of entries) {
    if (entry.name.startsWith(".")) continue;
    const abs = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await collectMarkdownFiles(abs)));
    else if (entry.isFile() && entry.name.endsWith(".md")) out.push(abs);
  }
  return out.sort();
}

// index.md when present, else the first page alphabetically. Matches the primary-doc rule
// gate() and build() both use for picking which page carries the folder's level frontmatter.
export async function findPrimaryMarkdown(dir: string): Promise<string | null> {
  const files = await collectMarkdownFiles(dir);
  const index = files.find((f) => f.endsWith("/index.md"));
  if (index) return index;
  return files[0] ?? null;
}

// Surgical frontmatter field writer: replaces the value on an existing "key: value" line when
// the key is already present, appends a new line for the frontmatter block otherwise, and
// leaves every other line byte-for-byte untouched. Creates a frontmatter block when the file
// has none. Values are written verbatim (the caller is responsible for any YAML-safe quoting).
export function setFrontmatterFields(raw: string, updates: Record<string, string>): string {
  const remaining = new Set(Object.keys(updates));

  if (!raw.startsWith("---")) {
    const yaml = Object.entries(updates)
      .map(([k, v]) => `${k}: ${v}`)
      .join("\n");
    return `---\n${yaml}\n---\n\n${raw}`;
  }

  const firstNl = raw.indexOf("\n");
  const afterOpen = firstNl === -1 ? "" : raw.slice(firstNl + 1);
  const closeIdx = afterOpen.indexOf("\n---");
  if (closeIdx === -1) {
    const yaml = Object.entries(updates)
      .map(([k, v]) => `${k}: ${v}`)
      .join("\n");
    return `---\n${yaml}\n---\n\n${raw}`;
  }

  const yamlBlock = afterOpen.slice(0, closeIdx);
  const afterClose = afterOpen.slice(closeIdx + 4); // skip "\n---"
  const lines = yamlBlock.split("\n");

  const newLines = lines.map((line) => {
    const m = /^([A-Za-z0-9_]+):(.*)$/.exec(line);
    if (m && remaining.has(m[1]!)) {
      const key = m[1]!;
      remaining.delete(key);
      return `${key}: ${updates[key]}`;
    }
    return line;
  });

  for (const key of remaining) newLines.push(`${key}: ${updates[key]}`);

  return `---\n${newLines.join("\n")}\n---${afterClose}`;
}

export function isoWithOffset(d: Date): string {
  const pad = (n: number, len = 2) => String(n).padStart(len, "0");
  const offMin = -d.getTimezoneOffset();
  const sign = offMin >= 0 ? "+" : "-";
  const abs = Math.abs(offMin);
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T` +
    `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`
  );
}
