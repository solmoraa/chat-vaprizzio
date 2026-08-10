import { execFileSync } from "node:child_process";
const files = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard"], { encoding: "utf8" }).trim().split(/\r?\n/).filter(Boolean);
const forbiddenNames = [/^\.env($|\.)/, /service.?account.*\.json$/i, /credentials.*\.json$/i, /\.sqlite/i, /\.pem$/i, /\.key$/i];
const bad = files.filter(f => f !== ".env.example" && forbiddenNames.some(r => r.test(f)));
if (bad.length) { console.error(`Archivos sensibles versionados:\n${bad.join("\n")}`); process.exit(1); }
const contentPatterns = [/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/, /AIza[0-9A-Za-z_-]{30,}/, /gh[pousr]_[0-9A-Za-z]{30,}/, /\b\d{8,12}:[A-Za-z0-9_-]{30,}\b/];
const textFiles = files.filter(f => !/^(node_modules|dist|extensions\/vaprizzio-tools\/dist)\//.test(f) && !/\.(?:png|jpe?g|gif|pdf|sqlite|lock)$/i.test(f));
const leaked = [];
for (const file of textFiles) { try { const content = execFileSync("git", ["show", `:${file}`], { encoding:"utf8", stdio:["ignore","pipe","ignore"] }); if (contentPatterns.some(pattern => pattern.test(content))) leaked.push(file); } catch {} }
if (leaked.length) { console.error(`Posibles secretos detectados en contenido versionado:\n${leaked.join("\n")}`); process.exit(1); }
console.log("Secret audit OK");
