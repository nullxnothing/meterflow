import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const scanRoots = [
  "src/styles",
  "public/site/css",
  "public/dashboard/css",
].map((dir) => path.join(root, dir));

const ignoredDirs = new Set(["archive", "dist", "node_modules", ".git"]);
const pxPattern = /(?<![\w-])(?:width|height|min-width|min-height|max-width|max-height|padding|padding-inline|padding-block|margin|margin-inline|margin-block|gap|font-size|border-radius|letter-spacing|top|right|bottom|left|inset|translate|box-shadow|filter|background-size)\s*:[^;{}]*\b\d+(?:\.\d+)?px\b[^;{}]*/g;

function walk(dir) {
  const entries = readdirSync(dir, { withFileTypes: true });
  return entries.flatMap((entry) => {
    if (ignoredDirs.has(entry.name)) return [];
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return walk(full);
    if (!entry.isFile() || !entry.name.endsWith(".css")) return [];
    return [full];
  });
}

function rel(file) {
  return path.relative(root, file).replaceAll("\\", "/");
}

function lineFor(content, index) {
  return content.slice(0, index).split(/\r?\n/).length;
}

const files = scanRoots.filter((dir) => statSync(dir, { throwIfNoEntry: false })?.isDirectory()).flatMap(walk);
const byFile = new Map();

for (const file of files) {
  const content = readFileSync(file, "utf8");
  for (const match of content.matchAll(pxPattern)) {
    const line = lineFor(content, match.index ?? 0);
    const item = `${line}: ${match[0].trim()}`;
    const key = rel(file);
    byFile.set(key, [...(byFile.get(key) ?? []), item]);
  }
}

const total = [...byFile.values()].reduce((sum, items) => sum + items.length, 0);
console.log(`CSS token audit: ${total} pixel literal declaration(s) across ${byFile.size} file(s).`);

for (const [file, items] of [...byFile.entries()].sort(([a], [b]) => a.localeCompare(b))) {
  console.log(`\n${file} (${items.length})`);
  for (const item of items.slice(0, 40)) {
    console.log(`  ${item}`);
  }
  if (items.length > 40) {
    console.log(`  ... ${items.length - 40} more`);
  }
}

if (total > 0) {
  console.log("\nAudit only. Convert repeated literals to design tokens where they represent shared spacing, type, shape, or component dimensions.");
}
