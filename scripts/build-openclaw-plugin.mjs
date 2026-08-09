import ts from "typescript";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

const source = readFileSync("extensions/vaprizzio-tools/index.ts", "utf8");
const result = ts.transpileModule(source, {
  compilerOptions: {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ES2022,
    sourceMap: false,
    removeComments: false
  },
  fileName: "index.ts"
});
mkdirSync("extensions/vaprizzio-tools/dist", { recursive: true });
writeFileSync("extensions/vaprizzio-tools/dist/index.js", result.outputText, "utf8");
