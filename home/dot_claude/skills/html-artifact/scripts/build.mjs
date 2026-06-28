import { execSync } from "child_process";

const entries = [
  "css",
  "showcase",
  "spec",
  "report",
  "prototype",
  "dashboard",
  "blog",
  "md",
  "burndown",
];

for (const entry of entries) {
  console.log(`\nBuilding ${entry}...`);
  execSync("node node_modules/vite/bin/vite.js build", {
    env: { ...process.env, ENTRY: entry },
    stdio: "inherit",
  });
}
