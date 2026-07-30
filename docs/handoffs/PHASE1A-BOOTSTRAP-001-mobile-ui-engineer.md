# PHASE1A-BOOTSTRAP-001 mobile-ui-engineer Handoff

| 属性 | 值 |
|---|---|
| 任务 | PHASE1A-BOOTSTRAP-001 |
| Agent | mobile-ui-engineer |
| 状态 | 完成 |
| 日期 | 2026-07-30 |

---

## 修改/创建文件清单

### 修改

| 文件 | 说明 |
|---|---|
| `src/app/layout.tsx` | metadata title 更新为 "阳光智家 / HouseVibe" |
| `src/app/globals.css` | 中文字体栈、`min-height: 100dvh`、Safe Area 配置 |

### 新增组件

| 文件 | 说明 |
|---|---|
| `src/components/ui/dialog.tsx` | 基于 @radix-ui/react-dialog 的 Dialog 封装 |
| `src/components/ui/drawer.tsx` | 基于 vaul 的 Drawer 封装，含 Safe Area |
| `src/components/ui/responsive-overlay.tsx` | 统一 Overlay：移动端 Drawer + 桌面端 Dialog |
| `src/components/ui/loading-state.tsx` | 通用加载状态组件 |
| `src/components/ui/empty-state.tsx` | 通用空状态组件 |
| `src/components/ui/error-state.tsx` | 通用错误状态组件（含重试按钮） |
| `src/components/ui/retry-state.tsx` | 通用重试状态组件 |
| `src/components/ui/submitting-state.tsx` | 通用提交中状态组件 |
| `src/components/layout/mobile-bottom-nav.tsx` | 移动端底部导航（4 项） |
| `src/components/layout/desktop-sidebar.tsx` | 桌面端侧栏导航（5 项） |
| `src/components/layout/top-bar.tsx` | 顶部栏（移动端品牌 + 桌面端占位） |
| `src/components/layout/app-shell.tsx` | App Shell（组合侧栏、顶栏、底部导航） |
| `src/hooks/use-responsive.ts` | useIsMobile Hook（768px 断点） |

### 新增页面

| 文件 | 说明 |
|---|---|
| `src/app/(dashboard)/layout.tsx` | Dashboard 布局（含 AppShell） |
| `src/app/(dashboard)/page.tsx` | Dashboard 占位页（工作台 + 三个空状态卡片） |

### Handoff 文档

| 文件 | 说明 |
|---|---|
| `docs/handoffs/PHASE1A-BOOTSTRAP-001-mobile-ui-engineer.md` | 本文件 |

---

## 组件 API 文档

### ResponsiveOverlay

最关键的跨平台 Overlay 组件。移动端 (< 768px) 渲染 Vaul Drawer（底部抽屉），桌面端 (>= 768px) 渲染居中 Dialog。

```tsx
import { ResponsiveOverlay } from "@/components/ui/responsive-overlay";

// 基本用法
<ResponsiveOverlay
  open={isOpen}
  onOpenChange={setIsOpen}
  title="筛选条件"
  description="选择您的筛选条件"
  footer={
    <div className="flex gap-2 justify-end">
      <Button variant="outline" onClick={() => setIsOpen(false)}>取消</Button>
      <Button onClick={handleApply}>应用</Button>
    </div>
  }
>
  {/* 内容区域 */}
  <div>筛选表单内容</div>
</ResponsiveOverlay>

// Props 接口
interface ResponsiveOverlayProps {
  open: boolean;                           // 控制开关状态
  onOpenChange: (open: boolean) => void;   // 状态回调
  title?: string;                          // 标题
  description?: string;                    // 描述文本
  children: React.ReactNode;               // 主体内容
  footer?: React.ReactNode;                // 底部操作区
}
```

**行为规范（遵循 ADR-002）：**

| 特性 | 移动端 (< 768px) | 桌面端 (>= 768px) |
|---|---|---|
| 组件 | Vaul Drawer | Radix Dialog |
| 最大高度 | 92dvh | 85dvh |
| 内部滚动 | overflow-y-auto | overflow-y-auto |
| Safe Area | pb: env(safe-area-inset-bottom) | 无 |
| 焦点锁定 | Vaul 内置 | Radix 内置 |
| ESC 关闭 | 支持 | 支持 |
| Overlay 点击关闭 | 支持 | 支持 |

### 通用状态组件

```tsx
// LoadingState - 加载中
<LoadingState message="加载中..." />

// EmptyState - 空状态
<EmptyState title="暂无数据" description="还没有任何记录" action={<Button>创建</Button>} />

// ErrorState - 错误状态（含可选重试）
<ErrorState title="加载失败" description="请检查网络连接" onRetry={() => refetch()} />

// RetryState - 重试状态
<RetryState onRetry={handleRetry} message="操作失败，请重试" />

// SubmittingState - 提交中
<SubmittingState message="提交中..." />
```

### useIsMobile Hook

```ts
import { useIsMobile } from "@/hooks/use-responsive";
const isMobile = useIsMobile(); // true when viewport < 768px
```

---

## Safe Area 适配清单

- [x] 底部导航 `pb-[env(safe-area-inset-bottom,0px)]`
- [x] Drawer 内容区 `pb-[env(safe-area-inset-bottom,0px)]`
- [x] Drawer Footer `pb-[env(safe-area-inset-bottom,0px)]`
- [x] TopBar `pt-[env(safe-area-inset-top,0px)]`
- [x] Desktop Sidebar `pt-[env(safe-area-inset-top,0px)]`
- [x] 页面容器 `min-height: 100dvh`
- [x] Drawer max-height: `92dvh`
- [x] 所有触控目标 >= 44px

---

## Phase 1-B 遗留事项

1. sonner/toast 集成
2. DestructiveConfirm 组件
3. PageLoading / SectionSkeleton 骨架
4. React Hook Form 集成
5. iOS 软键盘实际设备测试
6. 暗色模式实现
7. admin 导航集成（ADR-001）
