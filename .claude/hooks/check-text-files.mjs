#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const raw = fs.readFileSync(0, "utf8");
let event;
try {
  event = JSON.parse(raw);
} catch {
  process.exit(0);
}

const input = event.tool_input ?? {};
const filePath = input.file_path ?? input.path;
if (!filePath) process.exit(0);

const ext = path.extname(filePath).toLowerCase();
const checked = new Set([
  ".ts", ".tsx", ".js", ".jsx", ".css", ".md", ".json",
  ".sql", ".yaml", ".yml", ".toml", ".html"
]);
if (!checked.has(ext) || !fs.existsSync(filePath)) process.exit(0);

const buffer = fs.readFileSync(filePath);
if (buffer.length >= 3 && buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf) {
  process.stderr.write(`[HouseVibe text hook] ${filePath} 含 UTF-8 BOM，请移除。\n`);
  process.exit(2);
}

const text = buffer.toString("utf8");
if (text.includes("\uFFFD")) {
  process.stderr.write(`[HouseVibe text hook] ${filePath} 可能包含无效 UTF-8 字符。\n`);
  process.exit(2);
}

// Scope the escape rule to source/UI-like files. JSON/SQL may legitimately need escapes.
if ([".ts", ".tsx", ".js", ".jsx", ".css", ".html", ".md"].includes(ext)) {
  const unicodeEscapes = text.match(/\\u[0-9a-fA-F]{4}/g);
  if (unicodeEscapes) {
    process.stderr.write(
      `[HouseVibe text hook] ${filePath} 出现 Unicode 转义 ${[...new Set(unicodeEscapes)].join(", ")}；界面中文必须保存为实际 UTF-8。\n`
    );
    process.exit(2);
  }
}

process.exit(0);
