# 移动端 UI 规则

- Mobile-first，核心路径需在 375px 宽度下可用。
- 移动端底部导航：首页、房源、客户、内容/权限占位、我的。
- 桌面端使用侧栏，但不套用传统 Vue/Element Plus 管理后台模板。
- 筛选、智能录入确认、复杂确认界面：
  - 移动端使用 Vaul/shadcn Drawer；
  - 桌面端使用居中 Dialog；
  - 统一封装 `ResponsiveOverlay`。
- Drawer 使用 `max-height: 92dvh`、内部滚动、Safe Area、软键盘可见区域适配。
- 不在窄屏展示宽表格；默认卡片，桌面端可切表格。
- 表单必须有 loading、empty、error、retry 和保存反馈。
- 中文必须为实际 UTF-8 字符，不写 `\uXXXX`。
- 不硬编码魔法颜色；使用设计 Token 和 CSS 变量。
