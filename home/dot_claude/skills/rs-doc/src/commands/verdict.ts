// `mate-doc verdict <path> <Cn> --supports|--overstates|--contradicts|--unrelated
//   [--excerpt-file f] [--by name]`
//
// Writes verdict/checked_by/checked_at into one claim in claims.yaml, editing the YAML text
// surgically (locate the claim's own list item, edit only its lines) instead of round-tripping
// through Bun.YAML.stringify, so every other claim and field, and the file's key order, stay
// byte-stable. Only supports the block-style claims.yaml that `mate-doc new` produces (one key
// per line under "- id: Cn"), not a single-line flow-style claim object.
import { readFile, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { loadLedger } from "../ledger/index.ts";
import { EXIT, type ClaimId, type Verdict } from "../types.ts";

const VERDICT_FLAGS: Record<string, Verdict> = {
  "--supports": "supports",
  "--overstates": "overstates",
  "--contradicts": "contradicts",
  "--unrelated": "unrelated",
};

export interface VerdictEdit {
  verdict: string;
  checkedBy: string;
  checkedAt: string;
  excerptText?: string;
}

function findClaimBlock(lines: string[], claimId: string): { start: number; end: number; itemIndent: string } | null {
  const itemRe = /^(\s*)-\s+id:\s*(?:"([^"]*)"|'([^']*)'|(\S+))\s*$/;
  let start = -1;
  let itemIndent = "";
  for (let i = 0; i < lines.length; i++) {
    const m = itemRe.exec(lines[i] ?? "");
    if (!m) continue;
    const id = (m[2] ?? m[3] ?? m[4] ?? "").trim();
    if (id === claimId) {
      start = i;
      itemIndent = m[1] ?? "";
      break;
    }
  }
  if (start === -1) return null;

  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    const line = lines[i] ?? "";
    if (line.trim() === "") continue;
    const indent = /^(\s*)/.exec(line)![1]!.length;
    const isSiblingItem = indent === itemIndent.length && /^\s*-\s/.test(line);
    const isDedent = indent < itemIndent.length;
    if (isSiblingItem || isDedent) {
      end = i;
      break;
    }
  }
  return { start, end, itemIndent };
}

export function applyVerdictToYaml(raw: string, claimId: string, edit: VerdictEdit): string {
  const lines = raw.split("\n");
  const block = findClaimBlock(lines, claimId);
  if (!block) throw new Error(`claim ${claimId} not found (block-style claims.yaml only)`);
  const { start, end, itemIndent } = block;
  const keyIndent = `${itemIndent}  `;
  const body = lines.slice(start, end);

  function findKeyLine(key: string): number {
    const inlineRe = new RegExp(`^${itemIndent}-\\s+${key}:\\s*(.*)$`);
    const re = new RegExp(`^${keyIndent}${key}:\\s*(.*)$`);
    for (let i = 0; i < body.length; i++) {
      if (i === 0 && inlineRe.test(body[i] ?? "")) return i;
      if (re.test(body[i] ?? "")) return i;
    }
    return -1;
  }

  function setScalar(key: string, value: string, insertAfterKey: string): void {
    const idx = findKeyLine(key);
    const newLine = `${keyIndent}${key}: ${value}`;
    if (idx !== -1) {
      body[idx] = newLine;
      return;
    }
    const afterIdx = findKeyLine(insertAfterKey);
    body.splice(afterIdx !== -1 ? afterIdx + 1 : body.length, 0, newLine);
  }

  setScalar("verdict", edit.verdict, "status");
  setScalar("checked_by", edit.checkedBy, "verdict");
  setScalar("checked_at", edit.checkedAt, "checked_by");

  if (edit.excerptText !== undefined) {
    let evidenceIdx = -1;
    const evidenceRe = new RegExp(`^${keyIndent}evidence:\\s*$`);
    for (let i = 0; i < body.length; i++) {
      if (evidenceRe.test(body[i] ?? "")) {
        evidenceIdx = i;
        break;
      }
    }
    if (evidenceIdx !== -1) {
      const evidenceKeyIndent = `${keyIndent}  `;
      let evEnd = body.length;
      for (let i = evidenceIdx + 1; i < body.length; i++) {
        const line = body[i] ?? "";
        if (line.trim() === "") continue;
        const indent = /^(\s*)/.exec(line)![1]!.length;
        if (indent <= keyIndent.length) {
          evEnd = i;
          break;
        }
      }
      const excerptRe = new RegExp(`^${evidenceKeyIndent}excerpt:\\s*(.*)$`);
      let excerptIdx = -1;
      for (let i = evidenceIdx + 1; i < evEnd; i++) {
        if (excerptRe.test(body[i] ?? "")) {
          excerptIdx = i;
          break;
        }
      }
      const newExcerptLine = `${evidenceKeyIndent}excerpt: ${JSON.stringify(edit.excerptText)}`;
      if (excerptIdx !== -1) body[excerptIdx] = newExcerptLine;
      else body.splice(evEnd, 0, newExcerptLine);
    }
  }

  return [...lines.slice(0, start), ...body, ...lines.slice(end)].join("\n");
}

export async function runVerdict(argv: string[]): Promise<number> {
  const [path, claimIdArg, ...rest] = argv;
  if (!path || !claimIdArg) {
    process.stderr.write(
      "mate-doc verdict: usage: mate-doc verdict <path> <Cn> --supports|--overstates|--contradicts|--unrelated [--excerpt-file f] [--by name]\n",
    );
    return EXIT.usage;
  }

  const verdictFlag = Object.keys(VERDICT_FLAGS).find((f) => rest.includes(f));
  if (!verdictFlag) {
    process.stderr.write(
      "mate-doc verdict: one of --supports, --overstates, --contradicts, --unrelated is required\n",
    );
    return EXIT.usage;
  }
  const verdict = VERDICT_FLAGS[verdictFlag]!;

  const byIdx = rest.indexOf("--by");
  const checkedBy = byIdx !== -1 ? rest[byIdx + 1] ?? "agent:unknown" : "agent:unknown";

  const excerptIdx = rest.indexOf("--excerpt-file");
  const excerptFile = excerptIdx !== -1 ? rest[excerptIdx + 1] : undefined;

  const st = await stat(path).catch(() => null);
  if (!st) {
    process.stderr.write(`mate-doc verdict: no such file or folder: ${path}\n`);
    return EXIT.usage;
  }
  const docDir = st.isDirectory() ? path : dirname(path);
  const ledgerPath = join(docDir, "claims.yaml");
  const claimId = claimIdArg as ClaimId;

  const ledger = await loadLedger(docDir);
  if (!ledger || !ledger.claims.some((c) => c.id === claimId)) {
    process.stderr.write(`mate-doc verdict: unknown claim ${claimIdArg}\n`);
    return EXIT.usage;
  }

  const raw = await readFile(ledgerPath, "utf8");
  const checkedAt = new Date().toISOString().slice(0, 10);
  const excerptText = excerptFile ? (await readFile(excerptFile, "utf8")).replace(/\n$/, "") : undefined;

  let updated: string;
  try {
    updated = applyVerdictToYaml(raw, claimId, { verdict, checkedBy, checkedAt, excerptText });
  } catch (err) {
    process.stderr.write(`mate-doc verdict: ${(err as Error).message}\n`);
    return EXIT.usage;
  }

  await writeFile(ledgerPath, updated, "utf8");
  process.stdout.write(`mate-doc verdict: ${claimId} -> ${verdict}\n`);
  return EXIT.ok;
}
