// `mate-doc verdict <path> <Cn> --supports|--overstates|--contradicts|--unrelated|--uncheckable
//   [--reason text] [--excerpt-file f]`
//
// Writes verdict/verdict_reason/checked_by/checked_at/verdict_hash into one claim in claims.yaml, editing the YAML text
// surgically (locate the claim's own list item, edit only its lines) instead of round-tripping
// through Bun.YAML.stringify, so every other claim and field, and the file's key order, stay
// byte-stable. Only supports the block-style claims.yaml that `mate-doc new` produces (one key
// per line under "- id: Cn"), not a single-line flow-style claim object.
import { readFile, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";
import { claimHash, loadLedger } from "../ledger/index.ts";
import { detectActor, isAgent } from "../identity.ts";
import { EXIT, type Claim, type ClaimId, type ClaimStatus, type Verdict } from "../types.ts";

const VERDICT_FLAGS: Record<string, Verdict> = {
  "--supports": "supports",
  "--overstates": "overstates",
  "--contradicts": "contradicts",
  "--unrelated": "unrelated",
  "--uncheckable": "uncheckable",
};

export interface VerdictEdit {
  verdict: string;
  checkedBy: string;
  checkedAt: string;
  excerptText?: string;
  status?: ClaimStatus;
  verdictReason?: string;
  verdictHash?: string;
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

  function setScalar(key: string, value: string, insertAfterKeys: string[]): void {
    const idx = findKeyLine(key);
    const newLine = `${keyIndent}${key}: ${value}`;
    if (idx !== -1) {
      body[idx] = newLine;
      return;
    }
    let afterIdx = -1;
    for (const k of insertAfterKeys) {
      afterIdx = findKeyLine(k);
      if (afterIdx !== -1) break;
    }
    body.splice(afterIdx !== -1 ? afterIdx + 1 : body.length, 0, newLine);
  }

  function removeKey(key: string): void {
    const idx = findKeyLine(key);
    if (idx > 0) body.splice(idx, 1);
  }

  if (edit.status !== undefined) setScalar("status", edit.status, ["claim", "id"]);
  setScalar("verdict", edit.verdict, ["status", "claim", "id"]);
  if (edit.verdictReason !== undefined) {
    setScalar("verdict_reason", JSON.stringify(edit.verdictReason), ["verdict"]);
  } else {
    removeKey("verdict_reason");
  }
  setScalar("checked_by", edit.checkedBy, ["verdict_reason", "verdict"]);
  setScalar("checked_at", edit.checkedAt, ["checked_by"]);
  if (edit.verdictHash !== undefined) setScalar("verdict_hash", edit.verdictHash, ["checked_at"]);

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

export interface VerdictDeps {
  envVars?: Record<string, string | undefined>;
  isTTY?: boolean;
  gitName?: () => string;
}

function realGitName(): string {
  const result = spawnSync("git", ["config", "user.name"], { encoding: "utf8" });
  return result.status === 0 ? result.stdout.trim() : "";
}

// Writes one verdict onto one claim and returns the new file text. Shared with `verify`, so
// both commands edit the file through the same code path. The hash is taken from the claim as
// it reads after any excerpt edit, since that edit changes the evidence the verdict is about.
export function writeVerdict(
  raw: string,
  claimId: string,
  edit: Omit<VerdictEdit, "verdictHash">,
  currentStatus: ClaimStatus | undefined,
): string {
  const status: ClaimStatus | undefined =
    edit.status ?? (edit.verdict !== "supports" && currentStatus === "verified" ? "proposed" : undefined);
  const first = applyVerdictToYaml(raw, claimId, { ...edit, status });
  const parsed = Bun.YAML.parse(first) as { claims?: Claim[] } | null;
  const claim = parsed?.claims?.find((c) => c.id === claimId);
  if (!claim) return first;
  return applyVerdictToYaml(first, claimId, { ...edit, status, verdictHash: claimHash(claim) });
}

export async function runVerdict(argv: string[], deps: VerdictDeps = {}): Promise<number> {
  const [path, claimIdArg, ...rest] = argv;
  if (!path || !claimIdArg) {
    process.stderr.write(
      "mate-doc verdict: usage: mate-doc verdict <path> <Cn> --supports|--overstates|--contradicts|--unrelated|--uncheckable [--reason text] [--excerpt-file f]\n",
    );
    return EXIT.usage;
  }

  if (rest.includes("--by")) {
    process.stderr.write(
      "mate-doc verdict: --by was removed; identity is detected. Use mate-doc verify for agent checks.\n",
    );
    return EXIT.usage;
  }

  const verdictFlag = Object.keys(VERDICT_FLAGS).find((f) => rest.includes(f));
  if (!verdictFlag) {
    process.stderr.write(
      "mate-doc verdict: one of --supports, --overstates, --contradicts, --unrelated, --uncheckable is required\n",
    );
    return EXIT.usage;
  }
  const verdict = VERDICT_FLAGS[verdictFlag]!;

  const reasonIdx = rest.indexOf("--reason");
  const reason = reasonIdx !== -1 ? rest[reasonIdx + 1] : undefined;
  if (reasonIdx !== -1 && reason === undefined) {
    process.stderr.write("mate-doc verdict: --reason needs text\n");
    return EXIT.usage;
  }

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
  const claim = ledger?.claims.find((c) => c.id === claimId);
  if (!ledger || !claim) {
    process.stderr.write(`mate-doc verdict: unknown claim ${claimIdArg}\n`);
    return EXIT.usage;
  }

  const envVars = deps.envVars ?? process.env;
  const isTTY = deps.isTTY ?? Boolean(process.stdin.isTTY);
  const checkedBy = detectActor(envVars, deps.gitName ?? realGitName);

  if (verdict === "supports") {
    if (!isTTY || isAgent(envVars)) {
      process.stderr.write(
        "mate-doc verdict: --supports needs a person at a terminal. Agents use mate-doc verify.\n",
      );
      return EXIT.failed;
    }
    if (ledger.author !== undefined && ledger.author === checkedBy) {
      process.stderr.write("mate-doc verdict: the author of a doc cannot support its claims.\n");
      return EXIT.failed;
    }
  }

  const raw = await readFile(ledgerPath, "utf8");
  const checkedAt = new Date().toISOString().slice(0, 10);
  const excerptText = excerptFile ? (await readFile(excerptFile, "utf8")).replace(/\n$/, "") : undefined;

  let updated: string;
  try {
    updated = writeVerdict(
      raw,
      claimId,
      {
        verdict,
        checkedBy,
        checkedAt,
        excerptText,
        verdictReason: reason,
        status: verdict === "supports" ? "verified" : undefined,
      },
      claim.status,
    );
  } catch (err) {
    process.stderr.write(`mate-doc verdict: ${(err as Error).message}\n`);
    return EXIT.usage;
  }

  await writeFile(ledgerPath, updated, "utf8");
  process.stdout.write(`mate-doc verdict: ${claimId} -> ${verdict}\n`);
  return EXIT.ok;
}
