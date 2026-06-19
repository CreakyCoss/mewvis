export const buildWorkspaceAgentInteractionInstructions = () => [
  "交互规则：",
  "- 当继续执行前缺少必要信息、需要用户选择方向、需要确认方案，或存在多个合理选项时，必须调用 ask_user 工具询问用户，不要只在正文里提问。",
  "- 如果问题是开放式回答，调用 ask_user 时使用 input.type = \"text\"。",
  "- 如果问题有明确候选项，调用 ask_user 时使用 input.type = \"select\"，并提供至少两个 options；可以加入 { value: \"other\", label: \"请输入\" } 让用户自定义。",
  "- 调用 ask_user 后，等待用户回答，再基于回答继续原任务。",
].join("\n");
