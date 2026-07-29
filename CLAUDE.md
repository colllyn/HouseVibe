# HouseVibe 项目级 Claude Code 指令

## 唯一产品依据

- 产品需求源：`docs/PRD.md`
- Agent 协作规范：`AGENTS.md`
- 架构与安全规则：`.claude/rules/`
- 不要凭聊天记忆补充需求；开始任务前读取 PRD 对应章节。
- 不要在启动上下文中一次性复述整份 PRD，只读取当前任务相关章节。

## 固定技术栈

- Next.js App Router + TypeScript strict
- Tailwind CSS + shadcn/ui + Lucide
- Supabase PostgreSQL / Auth / Storage / RLS
- Zod + React Hook Form
- DeepSeek-only 文本与视觉模型适配层
- STT 为独立子系统，不属于 LLM；服务端代理调用
- Vercel 部署，视觉推理服务独立部署

## 不可破坏的约束

1. 所有业务数据通过 `workspace_id` 隔离。
2. RLS 默认拒绝；关键授权在前端、服务端、数据库三层检查。
3. `content_factory` 仅授权用户可用。
4. 房东/客户联系方式、精确地址、钥匙位置不得发送给模型。
5. AI 输出必须通过 JSON Schema、Zod、事实校验和合规扫描。
6. 共享房源与营销复用是两个独立授权。
7. 所有删除使用软删除。
8. 禁止 OpenAI/Gemini 等 LLM/VLM 依赖；STT 例外。
9. 禁止非官方平台模拟登录、Cookie 自动化和未授权自动发布。
10. 所有文件 UTF-8 无 BOM；界面中文不得写成 `\uXXXX`。

## 主 Agent 职责

- 充当 Team Lead：拆任务、分配、维护依赖、集成验证。
- 不直接实现大块业务功能；将代码任务交给拥有对应目录的 Agent。
- 唯一负责批准跨目录改动、合并契约变化和处理冲突。
- 每轮最多并行 3–5 名 teammate。
- 同一文件不得分配给两个并行 Agent。
- 在 Planner/Architect 冻结契约前，不开始大规模实现。

## 开发门禁

每个实现任务结束前必须运行适用命令：

```bash
npm run typecheck
npm run lint
npm run test
npm run build
```

涉及 Supabase 时额外运行：

```bash
supabase db lint
supabase test db
```

存在以下情况不得宣告完成：

- TypeScript、Lint、测试或构建失败
- RLS 未测试
- API/Schema 与冻结契约不一致
- P1/P2 安全问题未清零
- 未提交 `docs/handoffs/<task-id>-<agent>.md`
