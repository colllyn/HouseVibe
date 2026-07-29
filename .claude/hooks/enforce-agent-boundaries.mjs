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
    "supabase/",
    "src/lib/supabase/",
    "src/features/auth/",
    "src/features/access-control/",
    "src/features/entitlements/",
    "src/app/(auth)/",
    "src/app/onboarding/",
    "src/app/admin/layout.tsx",
    "src/app/admin/page.tsx",
    "src/app/admin/users/",
    "src/app/admin/feature-access/",
    "src/app/admin/invites/",
    "src/app/api/auth/",
    "src/app/api/invites/",
    "src/app/api/admin/users/",
    "src/app/api/admin/entitlements/",
    "src/app/api/admin/invites/",
    "src/types/database.ts",
    "docs/handoffs/"
  ],
  "property-crm-engineer": [
    "src/features/properties/",
    "src/features/clients/",
    "src/features/matching/",
    "src/features/tasks/",
    "src/features/collaboration/",
    "src/app/(dashboard)/properties/",
    "src/app/(dashboard)/clients/",
    "src/app/(dashboard)/matches/",
    "src/app/(dashboard)/tasks/",
    "src/app/(dashboard)/shared-properties/",
    "src/app/(dashboard)/collaboration-requests/",
    "src/app/api/properties/",
    "src/app/api/clients/",
    "src/app/api/matches/",
    "src/app/api/tasks/",
    "src/app/api/shared-properties/",
    "src/app/api/collaboration-requests/",
    "docs/handoffs/"
  ],
  "ai-deepseek-engineer": [
    "src/lib/ai/",
    "src/lib/compliance/",
    "src/features/content-generation/",
    "src/features/ai-runtime/",
    "src/features/ai-corrections/",
    "src/features/ai-preferences/",
    "src/features/ai-quota/",
    "src/features/compliance/",
    "src/app/api/ai/",
    "src/app/(dashboard)/content/",
    "src/app/(dashboard)/publishing/",
    "src/app/admin/ai-usage/",
    "src/app/admin/ai-models/",
    "src/app/admin/ai-corrections/",
    "src/app/admin/compliance/",
    "src/app/api/admin/ai-usage/",
    "src/app/api/admin/ai-models/",
    "src/app/api/admin/ai-corrections/",
    "src/app/api/admin/compliance-terms/",
    "docs/handoffs/"
  ],
  "mobile-ui-engineer": [
    "src/components/ui/",
    "src/components/layout/",
    "src/components/responsive/",
    "src/hooks/use-responsive",
    "src/app/globals.css",
    "src/app/layout.tsx",
    "src/app/(dashboard)/layout.tsx",
    "docs/handoffs/"
  ],
  "test-engineer": [
    "tests/", "e2e/", "supabase/tests/",
    "playwright.config.", "vitest.config.",
    "docs/handoffs/"
  ],
  "integration-engineer": [
    "package.json", "package-lock.json", "pnpm-lock.yaml", "yarn.lock",
    "next.config.", "tsconfig.json", "eslint.config.", "postcss.config.",
    "tailwind.config.", "components.json", ".github/", "scripts/",
    "src/config/", "src/lib/env/", "vercel.json", "README.md",
    "docs/handoffs/"
  ]
};

// Test file patterns for test-engineer cross-directory access
const testFileSuffixes = [
  ".test.ts", ".test.tsx", ".spec.ts", ".spec.tsx"
];

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

// ====================================================================
// Layer 1: Global dangerous command check (ALL agents including main)
// ====================================================================

if (tool === "Bash") {
  const command = String(input.command ?? "").trim();
  const lower = command.toLowerCase();

  // 8.1 Globally forbidden dangerous commands
  const universallyDangerous = [
    "rm -rf", "rm -fr", "rm -r -f", "rm --recursive",
    "sudo ",
    "git reset --hard",
    "git clean -f",
    "git push --force", "git push -f",
    "git checkout --",
    "git restore --source",
  ];
  if (universallyDangerous.some((token) => lower.includes(token))) {
    fail(`Bash 命令包含全局禁止操作：${command}`);
  }

  // 8.3 Protect ~/.claude/ internal directories from manual deletion
  const claudeInternalPaths = [
    "~/.claude/teams",
    "~/.claude/tasks",
    "$HOME/.claude/teams",
    "$HOME/.claude/tasks",
  ];
  if (claudeInternalPaths.some((p) => lower.includes(p))) {
    fail(`禁止直接操作 Claude 内部目录：${command}`);
  }
}

// ====================================================================
// Layer 2: Agent identity check
// Main thread and unknown agents pass through for Write/Edit operations.
// Their behavior in those areas is governed by CLAUDE.md and normal permissions.
// ====================================================================

if (!ownership[agent]) process.exit(0);

// ====================================================================
// Layer 3: File write boundary enforcement (known agents only)
// ====================================================================

if (["Write", "Edit", "MultiEdit"].includes(tool)) {
  const filePath = input.file_path ?? input.path;
  if (!filePath) fail(`${tool} 缺少 file_path`);

  const rel = relativeFile(filePath);

  // test-engineer cross-directory: allow test file suffixes anywhere under src/
  if (agent === "test-engineer" && (rel.startsWith("src/") || rel.startsWith("supabase/tests/"))) {
    const isTestFile = testFileSuffixes.some((suffix) => rel.endsWith(suffix));
    if (!isTestFile) {
      fail(`${agent} 只能修改测试文件；${rel} 不是测试文件后缀（${testFileSuffixes.join(", ")}）`);
    }
    process.exit(0);
  }

  if (!allowedPath(rel, ownership[agent])) {
    fail(`${agent} 无权修改 ${rel}。允许路径见 docs/coordination/OWNERSHIP.md`);
  }
  process.exit(0);
}

// ====================================================================
// Layer 4: Bash agent-specific restrictions (known agents only)
// ====================================================================

if (tool === "Bash") {
  const command = String(input.command ?? "").trim();
  const lower = command.toLowerCase();

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
