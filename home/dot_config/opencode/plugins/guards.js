// Run ~/.claude/hooks/run-guards.py before every bash call, so opencode keeps the same
// commit-message and push rules as Claude Code. A guard's exit 2 blocks the call.
import { spawnSync } from "node:child_process";
import { homedir } from "node:os";
import { join } from "node:path";

const RUNNER = join(homedir(), ".claude", "hooks", "run-guards.py");

export const Guards = async ({ directory }) => ({
  "tool.execute.before": async (input, output) => {
    if (input.tool !== "bash") return;
    const payload = JSON.stringify({
      tool_input: { command: output.args.command ?? "" },
      cwd: output.args.workdir ?? directory,
    });
    const result = spawnSync("python3", [RUNNER], { input: payload, encoding: "utf8" });
    if (result.status === 2) throw new Error(result.stderr.trim());
  },
});
