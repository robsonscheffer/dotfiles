// Builds the compare output files: without.md / with.md per run, and an index.md that shows
// the prompt and both outputs side by side in a :::tabs block. Every piece of agent-controlled
// text (prompt, run output) is fenced as code so nothing in it can be read as a directive or
// heading by the mate-doc parser - agent output is not trusted markdown.

export interface CompareRun {
  without: string;
  with: string;
}

export interface ComposeInput {
  promptFile: string;
  prompt: string;
  corePath: string;
  coreHash: string;
  runs: CompareRun[];
}

export interface ComposeResult {
  files: Record<string, string>; // filename -> content, including index.md
}

export function wordCount(text: string): number {
  const trimmed = text.trim();
  if (trimmed.length === 0) return 0;
  return trimmed.split(/\s+/).length;
}

// A fence long enough that no run of the same character inside `content` can close it early.
function fenceFor(content: string): string {
  let longest = 0;
  for (const run of content.match(/`+/g) ?? []) longest = Math.max(longest, run.length);
  return "`".repeat(Math.max(3, longest + 1));
}

function fenced(content: string): string {
  const fence = fenceFor(content);
  return `${fence}\n${content}\n${fence}`;
}

function runFilenames(index: number, total: number): { without: string; with: string } {
  if (total === 1) return { without: "without.md", with: "with.md" };
  return { without: `without-${index}.md`, with: `with-${index}.md` };
}

export function composeCompare(input: ComposeInput): ComposeResult {
  const files: Record<string, string> = {};
  const total = input.runs.length;

  const runSections: string[] = [];
  for (let i = 0; i < total; i++) {
    const run = input.runs[i]!;
    const names = runFilenames(i + 1, total);
    files[names.without] = run.without;
    files[names.with] = run.with;

    const heading = total > 1 ? `## Run ${i + 1}\n\n` : "";
    const wc = `Without core: ${wordCount(run.without)} words. With core: ${wordCount(run.with)} words.\n\n`;
    const tabs =
      ":::tabs\n" +
      "## Without core\n\n" +
      `${fenced(run.without)}\n\n` +
      "## With core\n\n" +
      `${fenced(run.with)}\n` +
      ":::\n";
    runSections.push(`${heading}${wc}${tabs}`);
  }

  const index =
    `---\n` +
    `title: "Compare: ${input.promptFile}"\n` +
    `summary: Same prompt run with and without the core, output side by side.\n` +
    `---\n\n` +
    `# Compare: ${input.promptFile}\n\n` +
    `## Prompt\n\n` +
    `${fenced(input.prompt)}\n\n` +
    `## Core\n\n` +
    `- path: \`${input.corePath}\`\n` +
    `- sha256: \`${input.coreHash}\`\n\n` +
    `## Output\n\n` +
    runSections.join("\n");

  files["index.md"] = index;
  return { files };
}
