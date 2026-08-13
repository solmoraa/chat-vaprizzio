import { copyFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

const projectRoot = resolve(import.meta.dirname, "..");
const targetRoot = resolve(process.env.OPENCLAW_SALES_WORKSPACE || "/home/openclaw/.openclaw/workspace/vaprizzio-sales-test");
const files = [
  ["openclaw/workspace/AGENTS.md", "AGENTS.md"],
  ["skills/ventas/SKILL.md", "skills/ventas/SKILL.md"],
];

for (const [source, target] of files) {
  const targetPath = resolve(targetRoot, target);
  mkdirSync(dirname(targetPath), { recursive: true, mode: 0o700 });
  copyFileSync(resolve(projectRoot, source), targetPath);
}

console.log(`OpenClaw sales workspace synchronized: ${targetRoot}`);
