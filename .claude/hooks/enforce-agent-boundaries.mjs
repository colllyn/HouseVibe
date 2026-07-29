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

const agent = event.agent_type ?? "";
const tool = event.tool_name ?? "";
const input = event.tool_input ?? {};
const cwd = path.resolve(event.cwd ?? process.cwd());

const ownership = {
  "product-planner": [
    "docs/plans/", "docs/contracts/", "docs/handoffs/"
  ],
  "solution-architect": [
    "docs/contracts/", "docs/decisions/", "docs/handoffs/"
  ],
  "data-security-engineer": [
    "supabase/", "src/lib/supabase/", "src/features/auth/",
    "src/features/access-control/", "src/app/(auth)/",
    "src/app/api/auth/", "src/app/api/admin/",
    "src/app/admin/users/", "src/app/admin/feature-access/",
    "src/app/admin/invites/", "src/types/database.ts", "docs/handoffs/"
  ],
  "property-crm-engineer": [
    "src/features/properties/", "src/features/clients/",
    "src/features/matching/", "src/features/tasks/",
    "src/features/collaboration/", "src/app/(dashboard)/properties/",
    "src/app/(dashboard)/clients/", "src/app/(dashboard)/matches/",
    "src/app/(dashboard)/tasks/", "src/app/(dashboard)/shared/",
    "src/app/api/properties/", "src/app/api/clients/",
    "src/app/api/matches/", "src/app/api/tasks/",
    "src/app/api/shared-properties/", "docs/handoffs/"
  ],
  "ai-deepseek-engineer": [
    "src/lib/ai/", "src/lib/compliance/", "src/features/ai-ingestion/",
    "src/features/content/", "src/features/ai-admin/",
    "src/app/api/ai/", "src/app/(dashboard)/content/",
    "src/app/admin/ai-usage/", "src/app/admin/compliance/",
    "docs/handoffs/"
  ],
  "mobile-ui-engineer": [
    "src/components/ui/", "src/components/layout/",
    "src/components/responsive/", "src/hooks/use-responsive",
    "src/app/globals.css", "src/app/layout.tsx",
    "src/app/(dashboard)/layout.tsx", "docs/handoffs/"
  ],
  "test-engineer": [
    "tests/", "e2e/", "fixtures/", "playwright.config.",
    "vitest.config.", "docs/handoffs/"
  ],
  "integration-engineer": [
    "package.json", "package-lock.json", "pnpm-lock.yaml", "yarn.lock",
    "next.config.", "tsconfig.json", "eslint.config.", "postcss.config.",
    "tailwind.config.", "components.json", ".github/", "scripts/",
    "src/config/", "src/lib/env/", "vercel.json", "README.md",
    "docs/handoffs/"
  ]
};

function fail(message) {
  process.stderr.write(`[HouseVibe boundary hook] ${message}\n`);
  process.exit(2);
}

function relativeFile(filePath) {
  const absolute = path.resolve(cwd, filePath);
  const rel = path.relative(cwd, absolute).replaceAll("\\", "/");
  if (rel.startsWith("../") || path.isAbsolute(rel)) {
    fail(`拒绝访问项目目录外文件：${filePath}`);
  }
  return rel;
}

function allowedPath(rel, prefixes) {
  return prefixes.some((prefix) => {
    if (prefix.endsWith("/")) return rel.startsWith(prefix);
    if (prefix.endsWith(".")) return rel.startsWith(prefix);
    return rel === prefix || rel.startsWith(`${prefix}/`);
  });
}

// Main thread and unknown/built-in agents are not path-blocked here.
// Their behavior is governed by CLAUDE.md and normal permissions.
if (!ownership[agent]) process.exit(0);

if (["Write", "Edit", "MultiEdit"].includes(tool)) {
  const filePath = input.file_path ?? input.path;
  if (!filePath) fail(`${tool} 缺少 file_path`);
  const rel = relativeFile(filePath);
  if (!allowedPath(rel, ownership[agent])) {
    fail(`${agent} 无权修改 ${rel}。允许路径见 docs/coordination/OWNERSHIP.md`);
  }
  process.exit(0);
}

if (tool === "Bash") {
  const command = String(input.command ?? "").trim();
  const lower = command.toLowerCase();

  const universallyDangerous = [
    "rm -rf", "git reset --hard", "git clean -", "git push",
    "git checkout --", "git restore --source", "sudo ",
    "curl ", "wget ", "scp ", "ssh "
  ];
  if (universallyDangerous.some((token) => lower.includes(token))) {
    fail(`${agent} 的 Bash 命令包含禁止操作：${command}`);
  }

  // Prevent using shell as an alternate file writer.
  const shellMutation = [
    " > ", " >> ", "| tee", "sed -i", "perl -pi",
    "writefile", "appendfile", "cat >", "printf >", "echo >"
  ];
  if (shellMutation.some((token) => lower.includes(token))) {
    fail(`${agent} 不得通过 Bash 绕过 Edit/Write 边界：${command}`);
  }

  const dependencyMutation = [
    "npm install", "npm i ", "pnpm add", "yarn add",
    "bun add", "npx shadcn", "npm uninstall", "pnpm remove"
  ];
  if (
    agent !== "integration-engineer" &&
    dependencyMutation.some((token) => lower.includes(token))
  ) {
    fail(`${agent} 不得修改依赖；提交 dependency request 给 integration-engineer`);
  }

  const gitMutation = [
    "git commit", "git merge", "git rebase", "git cherry-pick",
    "git tag", "git branch -d", "git branch -D"
  ];
  if (gitMutation.some((token) => lower.includes(token))) {
    fail(`${agent} 不得自行执行 Git 集成操作：${command}`);
  }
}

process.exit(0);
