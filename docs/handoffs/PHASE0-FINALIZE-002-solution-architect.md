# Handoff: PHASE0-FINALIZE-002

| 属性 | 值 |
|---|---|
| Task ID | PHASE0-FINALIZE-002 |
| Agent | solution-architect |
| 状态 | COMPLETED |
| 日期 | 2026-07-30 |

---

## 修复清单

本轮为质量修复轮，共修复 4 项问题。

### 修复 1：api-contract 1.3 缺失 COMPLIANCE_BLOCKED (P1)

**文件**：`docs/contracts/api-contract.md` Section 1.3

在错误码映射总表中新增一行：

```
| `COMPLIANCE_BLOCKED` | 422 | 合规输入阶段拒绝（内容完全未生成，不返回 data） |
```

该错误码已在 Section 10.6（POST /api/ai/generate-content 错误响应）和 `error-and-env-conventions.md` 中被引用，仅在 api-contract 1.3 总表中遗漏。

### 修复 2：content_projects RLS 不校验 property_id (P1)

**文件**：`docs/contracts/rls-contract.md` Section 4.13, 4.14

在 4.13 的"allow_marketing_reuse 检查说明"段落后追加"已知限制：直接 Supabase REST 调用的数据完整性"章节，记录：
- content_factory 用户可通过 Supabase REST 绕过 API 层插入指向未授权房源的 draft 记录
- 风险评估为低严重度（draft 无法触发 AI 生成，DeepSeek 调用仅在 Route Handler 中发生）
- 4 条缓解措施（API 层检查不变、Phase 1 RLS 建议跨表 Policy、Phase 2 负面测试、文档披露）

在 4.14 添加跨引用，指向 4.13 的已知限制说明。

### 修复 3：domain-model Open Questions 清零

**文件**：`docs/contracts/domain-model.md` Section 5

将原有的 3 个未决问题（业务类型扩展、视频支持优先级、多语言支持）转换为 Backlog 引用，Section 5 更新为标准措辞：

> 无。所有影响 Phase 1 的问题均已在 HouseVibe Phase 0 v1.0 中冻结。

三个问题已记录在 `docs/plans/phase0-backlog.md` 中，不阻塞 Phase 1。

### 修复 4：全部 7 份契约 Open Questions 一致性

**文件**：全部 7 份契约文档

对所有契约文件添加或更新标准 Open Questions 章节：

| 文件 | 原状态 | 操作 |
|---|---|---|
| `domain-model.md` | 有 3 个未决问题 | 已清零（修复 3） |
| `api-contract.md` | 无 Open Questions | 新增 Section 13 |
| `rls-contract.md` | 无 Open Questions | 新增 Section 8 |
| `ai-contract.md` | 无 Open Questions | 新增 Section 15 |
| `entitlement-authorization-matrix.md` | 无 Open Questions | 新增 Section 9 |
| `compliance-and-audit-contract.md` | 无 Open Questions | 新增 Section 9 |
| `error-and-env-conventions.md` | 无 Open Questions | 新增 Section 5 |

所有章节统一措辞：`无。所有影响 Phase 1 的问题均已在 HouseVibe Phase 0 v1.0 中冻结。`

---

## 契约冻结状态

全部 7 份契约状态保持 FROZEN FOR PHASE 1，版本 1.0。无架构变更，无需新 ADR。

---

## 下游影响

- **data-security-engineer**：rls-contract 4.13/4.14 新增已知限制说明，Phase 1 RLS 实现时需评估跨表 Policy 子查询可行性
- **ai-deepseek-engineer**：无影响（API 层检查不变）
- **test-engineer**：Phase 2 需覆盖 "Supabase REST 直调绕过 API 层" 负面测试用例
- **property-crm-engineer**、**mobile-ui-engineer**、**integration-engineer**：无影响
