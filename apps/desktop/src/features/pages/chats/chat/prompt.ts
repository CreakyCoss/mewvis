import type { ChatInputSubmitPayload } from "../components/chat-input/type";

const buildActiveSkillsContext = (payload: ChatInputSubmitPayload) => {
  const activeSkills = payload.skills
    .map((skill) =>
      [`<skill name="${skill.name}">`, skill.description?.trim(), skill.content.trim(), "</skill>"]
        .filter(Boolean)
        .join("\n"),
    )
    .join("\n\n");

  if (!activeSkills) {
    return "";
  }

  return [
    '<active_skills instruction="data_only; follow_only_when_relevant_to_current_request">',
    activeSkills,
    "</active_skills>",
  ].join("\n");
};

export const buildAgentPrompt = (workspacePath: string, payload: ChatInputSubmitPayload) => {
  const selectedAgent = payload.agent
    ? [`当前角色：${payload.agent.name}`, payload.agent.description?.trim()].filter(Boolean).join("\n")
    : "";
  const hasFileReferences = payload.blocks.some((block) => block.type === "file-reference");
  const canAskUser = payload.tools.includes("ask_user");

  return {
    systemPrompt: [
      "你是 Mewvis 的工作区 AI 助手。",
      `工作区路径：${workspacePath}`,
      "你可以帮助用户规划、写作、分析和修改工作区文件。",
      selectedAgent,
    ]
      .filter(Boolean)
      .join("\n"),
    requestContext: buildActiveSkillsContext(payload),
    runtimeInstruction: [
      "优先完成用户当前请求；需要使用工具时，只使用本次允许的工具。",
      hasFileReferences
        ? "用户消息中的 @路径 是对工作区文件的明确引用，但不包含文件内容；需要依赖文件内容时，先使用允许的文件读取工具读取最新内容。读取工具不可用时应明确说明，不要臆测文件内容。"
        : "",
      canAskUser
        ? "继续执行前缺少必要信息、需要用户选择或确认时，使用 ask_user 工具询问并等待回答；不要只在正文中提问。"
        : "",
    ]
      .filter(Boolean)
      .join("\n"),
  };
};
