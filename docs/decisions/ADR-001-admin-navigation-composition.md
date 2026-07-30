# ADR-001: Admin Navigation Composition Pattern

| 属性 | 值 |
|---|---|
| 文档名称 | ADR-001-admin-navigation-composition |
| 版本 | 1.0 |
| 状态 | accepted |
| Owner | solution-architect |
| 依赖 | PRD v1.3, OWNERSHIP.md |
| 最后更新 | 2026-07-30 |

---

## 背景

Admin 根布局（`src/app/admin/layout.tsx`）由 `data-security-engineer` 维护，但 admin 子页面分属两个 Agent：

- **data-security-engineer**：`/admin/users`, `/admin/feature-entitlements`, `/admin/invites`
- **ai-deepseek-engineer**：`/admin/ai-usage`, `/admin/ai-models`, `/admin/ai-corrections`, `/admin/compliance`

每个 Agent 需要能贡献其导航项到 admin 侧栏，但 admin 根布局文件只能由一个 Agent 拥有。需要一种模式让各 feature 贡献导航项而不造成串行依赖——即 `ai-deepseek-engineer` 不应因为需要添加导航项而阻塞等待 `data-security-engineer` 修改 layout.tsx。

---

## 决策

选择 **集中静态配置文件 + 条件渲染** 模式。

### 实现方案

1. **导航配置文件**：`src/config/admin-navigation.ts`，由 `integration-engineer` 拥有。
2. **Admin Shell**：`src/app/admin/layout.tsx` 由 `data-security-engineer` 维护，负责读取导航配置并渲染侧栏。
3. **子页面导航注册**：各 Agent 通过 handoff 请求向 `integration-engineer` 提交新增/修改导航项。
4. **Feature 权限控制**：导航配置支持 `requiredFeature` 字段，Shell 层通过 `has_feature()` 检查控制可见性。

### 配置文件结构

```ts
// src/config/admin-navigation.ts
// Owner: integration-engineer
// 各 Agent 通过 handoff 请求修改此文件

export interface AdminNavItem {
  label: string;           // 显示文本
  href: string;            // 路由路径
  icon: string;            // Lucide icon 名称
  requiredFeature?: string; // 可选：需要的 feature key（如不填则仅需 is_system_admin）
  order: number;           // 排序
  owner: string;           // 所属 Agent 标识（用于 handoff 路由）
}

export const adminNavigation: AdminNavItem[] = [
  {
    label: '用户管理',
    href: '/admin/users',
    icon: 'Users',
    order: 1,
    owner: 'data-security-engineer',
  },
  {
    label: '功能授权',
    href: '/admin/feature-entitlements',
    icon: 'Shield',
    order: 2,
    owner: 'data-security-engineer',
  },
  {
    label: '邀请链接',
    href: '/admin/invites',
    icon: 'Link',
    order: 3,
    owner: 'data-security-engineer',
  },
  {
    label: 'AI 用量',
    href: '/admin/ai-usage',
    icon: 'BarChart3',
    order: 4,
    owner: 'ai-deepseek-engineer',
  },
  {
    label: 'AI 模型',
    href: '/admin/ai-models',
    icon: 'Cpu',
    order: 5,
    owner: 'ai-deepseek-engineer',
  },
  {
    label: 'AI 纠错',
    href: '/admin/ai-corrections',
    icon: 'Wrench',
    order: 6,
    owner: 'ai-deepseek-engineer',
  },
  {
    label: '合规词库',
    href: '/admin/compliance',
    icon: 'FileCheck',
    order: 7,
    owner: 'ai-deepseek-engineer',
  },
];
```

### Admin Shell 使用方式

```tsx
// src/app/admin/layout.tsx
// Owner: data-security-engineer

import { adminNavigation } from '@/config/admin-navigation';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  // Shell 负责：
  // 1. 验证 is_system_admin()
  // 2. 读取 adminNavigation 配置
  // 3. 对每个导航项检查 requiredFeature（如果配置了）
  // 4. 渲染侧栏
  // 5. 渲染 children（子页面由各自 Agent 实现）
}
```

### 导航项注册流程

```text
某 Agent 需要添加新的 admin 子页面
→ Agent 在 handoff 中提交导航项信息（label, href, icon, requiredFeature, order, owner）
→ integration-engineer 审查并更新 src/config/admin-navigation.ts
→ data-security-engineer 的 layout.tsx 自动反映新导航项（无需修改）
→ 子页面路由由对应 Agent 在自己的目录中实现
```

### 避免串行依赖

- `data-security-engineer` 不需要等待 `ai-deepseek-engineer` 的导航项来修改 layout.tsx。
- `ai-deepseek-engineer` 先在 `src/app/admin/ai-usage/page.tsx` 等路径下实现子页面。
- 导航项通过 `integration-engineer` 统一添加到配置文件。
- 两个 Agent 不直接编辑同一个文件。

### 文件所有权

| 文件 | Owner | 说明 |
|---|---|---|
| `src/config/admin-navigation.ts` | integration-engineer | 导航配置，通过 handoff 请求修改 |
| `src/app/admin/layout.tsx` | data-security-engineer | Admin Shell，读取配置并渲染 |
| `src/app/admin/page.tsx` | data-security-engineer | Admin 首页 |
| `src/app/admin/users/**` | data-security-engineer | 用户管理子页面 |
| `src/app/admin/feature-entitlements/**` | data-security-engineer | 功能授权子页面 |
| `src/app/admin/invites/**` | data-security-engineer | 邀请链接子页面 |
| `src/app/admin/ai-usage/**` | ai-deepseek-engineer | AI 用量子页面 |
| `src/app/admin/ai-models/**` | ai-deepseek-engineer | AI 模型子页面 |
| `src/app/admin/ai-corrections/**` | ai-deepseek-engineer | AI 纠错子页面 |
| `src/app/admin/compliance/**` | ai-deepseek-engineer | 合规词库子页面 |

---

## 替代方案及取舍

### 替代方案 1：动态注册 (Plugin Pattern)

每个 feature 导出一个 `register()` 函数，admin layout 收集所有注册项。

**优点**：完全解耦，各 feature 自主注册。

**缺点**：
- 运行时开销，需要模块动态扫描。
- Next.js App Router 下服务端组件难以实现动态模块加载。
- 调试困难，导航项来源不透明。
- 增加了 `register()` API 的额外维护负担。

**取舍**：不采用。集中配置文件更简单、可审计，且 Next.js App Router 对此模式天然友好。

### 替代方案 2：分离 layout 文件 (Parallel Routes / Route Groups)

每个 Agent 拥有自己的 admin layout 文件，通过 Next.js Route Groups 组织。

**优点**：每个 Agent 完全拥有自己的 layout。

**缺点**：
- 多个 layout 导致侧栏重复或需要共享组件。
- Route Groups 命名复杂。
- 与 Next.js App Router 的 layout 嵌套规则冲突。
- `/admin` 根路由的归属不明确。

**取舍**：不采用。单一的 admin layout 由 data-security-engineer 维护是明确且合理的。

### 替代方案 3：Content Security Engineer 独有所有导航

`data-security-engineer` 直接硬编码所有导航项在 layout.tsx 中，包括 AI 管理页面。

**优点**：实现最简单。

**缺点**：
- `ai-deepseek-engineer` 添加导航项时必须串行等待 `data-security-engineer` 修改 layout.tsx。
- 两个 Agent 需要编辑同一文件，无法并行工作。
- 违反 OWNERSHIP.md：`data-security-engineer` 不拥有 AI 管理实现。

**取舍**：不采用。违背多 Agent 并行工作的原则。

---

## 影响

### 对 data-security-engineer 的影响

- Admin Shell 仍由 `data-security-engineer` 维护。
- layout.tsx 从导航配置文件读取菜单项，而非硬编码。
- 不影响现有 Admin 用户/entitlement/invites 页面的实现。

### 对 ai-deepseek-engineer 的影响

- 可在 `src/app/admin/ai-*` 路径下独立开发子页面。
- 导航项通过 handoff 请求 `integration-engineer` 添加到配置文件。
- 不需要等待或依赖 `data-security-engineer`。

### 对 integration-engineer 的影响

- 新增职责：维护 `src/config/admin-navigation.ts`。
- 接收各 Agent 的导航项 handoff 请求。
- 审查导航项合理性后合并。

### 对 mobile-ui-engineer 的影响

- 无直接影响。Admin 布局为桌面端侧栏，不涉及移动端底部导航。

---

## 状态

**accepted** -- 此模式已通过审查并在 Phase 0 冻结。
