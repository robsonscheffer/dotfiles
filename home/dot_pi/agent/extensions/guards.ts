// Run ~/.claude/hooks/run-guards.py before every bash call, so pi keeps the same
// commit-message and push rules as Claude Code. A guard's exit 2 blocks the call.
import { spawnSync } from "node:child_process";
import { homedir } from "node:os";
import { join } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const RUNNER = join(homedir(), ".claude", "hooks", "run-guards.py");

export default function (pi: ExtensionAPI) {
  pi.on("tool_call", async (event, ctx) => {
    if (event.toolName !== "bash") return undefined;
    const payload = JSON.stringify({
      tool_input: { command: String(event.input.command ?? "") },
      cwd: ctx.cwd,
    });
    const result = spawnSync("python3", [RUNNER], { input: payload, encoding: "utf8" });
    if (result.status === 2) return { block: true, reason: result.stderr.trim() };
    return undefined;
  });
}
