import { execFileSync } from "node:child_process";
const files = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard"], { encoding: "utf8" }).trim().split(/\r?\n/).filter(Boolean);
const forbiddenNames = [/^\.env($|\.)/, /service.?account.*\.json$/i, /credentials.*\.json$/i, /\.sqlite/i, /\.pem$/i, /\.key$/i];
const bad = files.filter(f => f !== ".env.example" && forbiddenNames.some(r => r.test(f)));
if (bad.length) { console.error(`Archivos sensibles versionados:\n${bad.join("\n")}`); process.exit(1); }
console.log("Secret audit OK");
