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

// Which image (commit) an excerpt's line number applies to: "added" lines only exist at the
// PR's head commit, "removed" lines only exist at the PR's base commit.
export type ChangeSide = "added" | "removed";

export interface FileChange {
  found: boolean;
  excerpt?: string; // trimmed content of the chosen line
  line?: number; // best-effort line number in the image named by `side`
  side?: ChangeSide;
}

const HUNK_RE = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/;

// Finds the line an agent chose as evidence, for one file in a unified diff. Searches the file's
// added lines first (they exist at the PR's head commit, where claims are normally checked) and
// returns the first whose trimmed body contains the trimmed excerpt. Only when no added line
// matches does it search removed lines, which the caller must anchor at the base commit. The
// returned excerpt is the agent's own text, so audit looks for what the agent chose. Best-effort
// line numbers: hunk headers are tracked, which drifts on "\ No newline at end of file" and
// similar edge cases a real patch parser would handle.
export function findAnchorLine(diff: string, filepath: string, excerpt: string): FileChange {
  const needle = excerpt.trim();
  if (needle.length === 0) return { found: false };

  let inFile = false;
  let oldLine = 0;
  let newLine = 0;
  let removedMatch: FileChange | undefined;

  for (const raw of diff.split("\n")) {
    if (raw.startsWith("diff --git ")) {
      if (inFile) break;
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
      if (raw.slice(1).trim().includes(needle)) return { found: true, excerpt: needle, line: newLine, side: "added" };
      newLine++;
    } else if (raw.startsWith("-")) {
      if (!removedMatch && raw.slice(1).trim().includes(needle)) removedMatch = { found: true, excerpt: needle, line: oldLine, side: "removed" };
      oldLine++;
    } else {
      newLine++;
      oldLine++;
    }
  }
  return removedMatch ?? { found: false };
}
