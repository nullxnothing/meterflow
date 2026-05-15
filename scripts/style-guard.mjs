import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const root = process.cwd();

const scanRoots = [
  "src",
  "public/dashboard/js",
].map((dir) => path.join(root, dir));

const scanFiles = [
  "public/site/index.html",
  "public/site/home.js",
].map((file) => path.join(root, file));

const ignoredDirs = new Set(["archive", "dist", "node_modules", ".git"]);
const textFilePattern = /\.(css|html|js|jsx|ts|tsx)$/;
const hexPattern = /(?<![&\w-])#[0-9a-fA-F]{3,8}\b/g;
const numericRgbaPattern = /rgba?\(\s*\d/g;
const inlineStylePattern = /\bstyle=(["'])(?!\s*--)[\s\S]*?\1|\bstyle=\{\{/g;

const allowedHexFiles = new Set([
  "public/site/404.html",
  "public/site/apply.html",
  "public/site/docs.html",
  "public/site/how-it-works.html",
  "public/site/index.html",
  "public/site/privacy.html",
  "public/site/roadmap.html",
  "public/site/status.html",
  "public/site/terms.html",
  "public/site/token.html",
  "public/dashboard/index.html",
]);

const allowedHexLinePatterns = [
  /<meta name="theme-color"/,
  /<meta name="msapplication-TileColor"/,
];

const allowedInlineStylePatterns = [
  /style=(["'])--[a-z0-9-]+:/i,
];

function walk(dir) {
  const entries = readdirSync(dir, { withFileTypes: true });
  return entries.flatMap((entry) => {
    if (ignoredDirs.has(entry.name)) return [];
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return walk(full);
    if (!entry.isFile() || !textFilePattern.test(entry.name)) return [];
    return [full];
  });
}

function rel(file) {
  return path.relative(root, file).replaceAll("\\", "/");
}

function lineFor(content, index) {
  return content.slice(0, index).split(/\r?\n/).length;
}

function lineText(content, lineNumber) {
  return content.split(/\r?\n/)[lineNumber - 1] ?? "";
}

function collectMatches(file, content, pattern, kind) {
  const relative = rel(file);
  const matches = [];
  for (const match of content.matchAll(pattern)) {
    const line = lineFor(content, match.index ?? 0);
    const source = lineText(content, line);

    if (kind === "hex" && allowedHexFiles.has(relative) && allowedHexLinePatterns.some((allowed) => allowed.test(source))) {
      continue;
    }

    if (kind === "inline-style" && allowedInlineStylePatterns.some((allowed) => allowed.test(source))) {
      continue;
    }

    matches.push({ file: relative, line, source: source.trim() });
  }
  return matches;
}

const files = [
  ...scanRoots.filter((dir) => statSync(dir, { throwIfNoEntry: false })?.isDirectory()).flatMap(walk),
  ...scanFiles.filter((file) => statSync(file, { throwIfNoEntry: false })?.isFile()),
];

const violations = [];
for (const file of files) {
  const content = readFileSync(file, "utf8");
  violations.push(...collectMatches(file, content, hexPattern, "hex").map((match) => ({ ...match, kind: "raw hex color" })));
  violations.push(...collectMatches(file, content, numericRgbaPattern, "rgba").map((match) => ({ ...match, kind: "numeric rgb/rgba" })));
  violations.push(...collectMatches(file, content, inlineStylePattern, "inline-style").map((match) => ({ ...match, kind: "non-dynamic inline style" })));
}

if (violations.length) {
  console.error(`Style guard failed with ${violations.length} violation(s):`);
  for (const violation of violations.slice(0, 120)) {
    console.error(`- ${violation.kind}: ${violation.file}:${violation.line} ${violation.source}`);
  }
  if (violations.length > 120) {
    console.error(`...and ${violations.length - 120} more`);
  }
  process.exit(1);
}

console.log(`Style guard passed across ${files.length} files.`);
