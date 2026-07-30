# ADR-003: VisualFactLevel 从 PRD 4 级扩展到 5 级

| 属性 | 值 |
|---|---|
| 文档名称 | ADR-003-visual-fact-levels |
| 版本 | 1.0 |
| 状态 | accepted |
| Owner | solution-architect |
| 依赖 | PRD v1.3, ai-contract.md |
| 最后更新 | 2026-07-30 |

---

## 1. 背景

PRD 10.4 节"文字与图片事实交叉校验"定义了 4 个视觉事实判定等级：

1. `confirmed_visual_support` -- 图片明确支持
2. `not_verified_by_images` -- 图片未拍到
3. `possible_conflict` -- 图片明确反证
4. `insufficient_evidence` -- 有图片但无法判断

ai-contract 在设计过程中新增了第 5 级 `weak_visual_support`，形成以下 5 级体系：

1. `not_verified_by_images` -- 图片未拍到，不得判定为假
2. `insufficient_evidence` -- 有图片但证据不足以判断
3. `weak_visual_support` -- 图片提供弱证据，介于 insufficient_evidence 和 confirmed_visual_support 之间
4. `confirmed_visual_support` -- 图片明确支持
5. `possible_conflict` -- 图片明确反证

---

## 2. 决策

**保留 5 级体系**，在 PRD 的 4 级基础上新增 `weak_visual_support`。

---

## 3. 理由

### 3.1 语义需要

PRD 的 4 级体系中，`insufficient_evidence` 和 `confirmed_visual_support` 之间缺少中间态。在实际场景中经常出现以下情况：

- 图片拍到部分相关特征，但角度不佳、光照不足或遮挡严重
- 图片拍到相似但不完全匹配的特征（如文字说"落地窗"，图片拍到的是大窗户但不确定是否为落地款）
- 多个图片中仅有一张提供弱证据

这些情况既不能归类为 `insufficient_evidence`（证据已经存在），也不能归类为 `confirmed_visual_support`（证据不充分）。`weak_visual_support` 填补了这一语义缺口。

### 3.2 用户体验

| 等级 | 前端展示 | 颜色 | 用户操作指引 |
|---|---|---|---|
| `not_verified_by_images` | 图片未验证 | 灰色 | "建议补充图片" |
| `insufficient_evidence` | 证据不足 | 灰色 | "图片不足以判断" |
| `weak_visual_support` | 弱支持 | 浅绿色/蓝色 | "有部分证据，建议人工确认" |
| `confirmed_visual_support` | 已确认 | 绿色 | 无需操作 |
| `possible_conflict` | 疑似冲突 | 橙色/红色 | "存在冲突，必须人工确认" |

`weak_visual_support` 使用浅绿色或蓝色展示，区别于明确的绿色（已确认）和灰色（证据不足），提示用户"有证据但建议再次确认"。

### 3.3 与 PRD 的兼容性

- 4 级体系是 5 级体系的子集：去掉 `weak_visual_support` 后，其余 4 级与 PRD 完全一致。
- 如果未来需要降级为 4 级，只需将 `weak_visual_support` 合并入 `insufficient_evidence` 或 `confirmed_visual_support`，无需 schema migration。
- DeepSeek Vision Provider 的 Prompt 明确要求模型在模糊证据场景下使用 `weak_visual_support`，而不是强制归类到两个极端。

### 3.4 触发条件

模型应返回 `weak_visual_support` 当：

- 图片中确实存在与文字声明相关的视觉元素
- 但以下任一条件成立：
  - 置信度在 0.4-0.7 之间
  - 图片角度/光照/遮挡导致无法完全确认
  - 仅部分图片支持，其他图片未拍到
  - 视觉特征与文字描述相似但不完全匹配

---

## 4. 后果

### 4.1 正面影响

- 更细腻的事实校验级别，减少 false positive/negative
- 用户能看到"半确认"状态，避免误以为所有非绿色结果都是负面
- 前端可以设计更丰富的视觉提示层次

### 4.2 负面影响

- 比 PRD 多一级，前端实现需要 5 种颜色/图标映射而非 4 种
- Prompt 设计需要更多示例来区分 `weak_visual_support` 和 `confirmed_visual_support` 的边界

### 4.3 实施要点

- `ai-contract.md` 的 VisualFactLevel 类型已冻结为 5 级
- `properties.visual_fact_flags` JSONB 字段使用 5 级枚举值
- `VisualFactCheck` 接口的 `visualResult` 字段接受 5 种值
- 前端 `ResponsiveOverlay` 中的视觉事实展示组件需要支持 5 种颜色映射

---

## 5. 替代方案（已拒绝）

**方案 A：保持 4 级，不区分弱证据和强证据**

- 拒绝理由：`insufficient_evidence` 和 `confirmed_visual_support` 之间的差距过大，用户无法区分"完全没有证据"和"有证据但不确定"，可能导致错误的信任或不信任。

**方案 B：使用连续置信度分数替代离散等级**

- 拒绝理由：非技术用户难以理解 0-1 之间的精确分数。离散等级配合颜色编码更适合房产中介的使用场景。

---

## 6. 相关文档

- ai-contract.md 第 5 节：视觉事实等级定义
- ai-contract.md 第 8 节：visual_fact_flags JSON 结构
- PRD 10.4 节：文字与图片事实交叉校验
- domain-model.md 2.4 节：properties 实体 visual_fact_flags 字段
