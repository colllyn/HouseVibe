# DeepSeek AI 规则

- 所有 LLM/VLM 统一为 DeepSeek；禁止添加 OpenAI、Gemini、Claude API 作为产品运行时依赖。
- STT 是独立能力，可使用浏览器 Web Speech 或服务端 STT Provider。
- DeepSeek 文本与视觉 Provider 分离；视觉推理不得在 Vercel Function 内加载模型。
- 每次 AI 请求顺序：
  1. 身份验证
  2. 功能授权
  3. 原子配额与成本预占
  4. 资源访问权限
  5. 隐私预处理
  6. 模型调用
  7. Structured Output + Zod
  8. 事实与图文交叉校验
  9. 合规扫描
  10. 用量与纠错日志
- 图片未展示某特征不能等同于反证；只有明确视觉冲突才能标记 contradiction。
- 用户偏好学习仅影响 Prompt 上下文和候选排序，不得绕过事实与合规。
- 配额必须原子预占，并支持幂等键、失败释放和成本熔断。
- 高风险合规命中时禁止一键复制，直到修改或完成显式人工确认。
