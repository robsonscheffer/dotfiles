// Per-file diff extraction, ported from rs-walk's render-diff.sh (section rendering) plus a
// best-effort line locator used only for anchoring claims - real diffs don't line up 1:1 with
// hunk math once context collapses, so this is "good enough to point a reviewer at," not a
// byte-exact patch parser.

const METADATA_PREFIXES = ["index ", "--- ", "+++ ", "new file mode", "deleted file mode", "similarity", "rename", "Binary"];

// Extracts one file's diff lines (hunk headers plus content, metadata stripped), matching
// render-diff.sh's awk extraction: from the `diff --git` header containing `filepath` to the
// next `diff --git` line.
function extractFileLines(diff: string, filepath: string): string[] {
  const out: string[] = [];
  let inFile = false;
  for (const line of diff.split("\n")) {
    if (line.startsWith("diff --git ")) {
      inFile = line.includes(filepath);
      continue;
    }
    if (!inFile) continue;
    if (METADATA_PREFIXES.some((p) => line.startsWith(p))) continue;
    out.push(line);
  }
  while (out.length > 0 && out[out.length - 1] === "") out.pop();
  return out;
}

// Renders one file's diff as a fenced code block with the `diff` info string and a
// `title=<path>` meta, capped at `maxLines` like render-diff.sh's default of 80.
export function renderDiffFence(filepath: string, diff: string, maxLines = 80): string {
  const extracted = extractFileLines(diff, filepath);
  if (extracted.length === 0) {
    return ["```diff title=" + filepath, `No diff found for ${filepath}.`, "```"].join("\n");
  }
  let lines = extracted;
  let note = "";
  if (lines.length > maxLines) {
    const remaining = lines.length - maxLines;
    lines = lines.slice(0, maxLines);
    note = `\n[... ${remaining} more lines not shown]`;
  }
  return ["```diff title=" + filepath, lines.join("\n") + note, "```"].join("\n");
}

export interface FileChange {
  found: boolean;
  excerpt?: string; // trimmed content of the first non-empty added/removed line
  line?: number; // best-effort line number in the new file (old file for a removed-only line)
}

const HUNK_RE = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/;

// Finds the first real content change for one file in a unified diff, for anchoring a code
// claim. Best-effort: it walks hunk headers to track line numbers, which drifts on the "\ No
// newline at end of file" marker and similar edge cases a real patch parser would handle -
// acceptable here since this only has to point close enough for a human to confirm.
export function firstFileChange(diff: string, filepath: string): FileChange {
  let inFile = false;
  let oldLine = 0;
  let newLine = 0;
  for (const raw of diff.split("\n")) {
    if (raw.startsWith("diff --git ")) {
      inFile = raw.includes(filepath);
      continue;
    }
    if (!inFile) continue;

    const hunk = HUNK_RE.exec(raw);
    if (hunk) {
      oldLine = Number(hunk[1]);
      newLine = Number(hunk[2]);
      continue;
    }
    if (raw.startsWith("+++") || raw.startsWith("---")) continue;
    if (METADATA_PREFIXES.some((p) => raw.startsWith(p))) continue;

    if (raw.startsWith("+")) {
      const body = raw.slice(1).trim();
      if (body.length > 0) return { found: true, excerpt: body, line: newLine };
      newLine++;
    } else if (raw.startsWith("-")) {
      const body = raw.slice(1).trim();
      if (body.length > 0) return { found: true, excerpt: body, line: oldLine };
      oldLine++;
    } else {
      newLine++;
      oldLine++;
    }
  }
  return { found: false };
}
