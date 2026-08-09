import { cpSync, mkdirSync } from "node:fs";
mkdirSync("dist/fixtures", { recursive: true });
cpSync("fixtures", "dist/fixtures", { recursive: true });
