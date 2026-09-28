// `mate-doc setup`: exec bin/setup, pass through its exit code.
export async function runSetup(): Promise<number> {
  const scriptPath = new URL("../../bin/setup", import.meta.url).pathname;
  const proc = Bun.spawn({
    cmd: [scriptPath],
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
  });
  return await proc.exited;
}
