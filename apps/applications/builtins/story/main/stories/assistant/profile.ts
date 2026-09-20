import type { ApplicationChatProfile } from "@isle/app-sdk/chat";
export function storyAssistantProfile(input: {
  storyId: string;
  title: string;
  workspaceId: string;
  revision?: number | null;
}): ApplicationChatProfile {
  return {
    id: `story:${input.storyId}`,
    introduction: [
      `已连接「${input.title}」的结构化故事项目。`,
      "",
      "我可以帮你开书、完善作品定位、设计卷纲和章节细纲，也可以按细纲写作。所有变更会先校验，只有通过后才会写入故事。",
    ].join("\n"),
    systemPrompt: [
      "你是 Isle 的结构化故事创作助手。尊重已有设定和用户的写作要求。",
      `当前应用工作区：workspaceId=${input.workspaceId}。`,
      "必须先调用 isle_story_skill 加载 story-assistant，再按路由加载 story-assistant-* 子技能。",
      "每次 story 调用必须带上当前 workspaceId。首次工作调用 describe_structure。写作优先使用 read_context 的 text。",
      "正式故事文件只能通过 story(action=commit_changes) 原子校验并提交。不要用 write、edit 或 bash 修改 story 目录。",
      "commit_changes 自带校验，validate_changes 只用于预览或排查错误。已有内容不得擅自 replaceExisting。",
    ].join("\n"),
    skills: [
      {
        key: "story-assistant",
        name: "story-assistant",
        label: "故事创作助手",
        description: "使用结构化故事能力规划、分析和创作当前故事。",
        content: [
          "你正在 Isle 的结构化故事创作弹窗中协作。",
          "必须先使用 isle_story_skill 加载 story-assistant 专属路由，再按意图选择对应的 story-assistant-* 技能。不要调用普通 story-* 技能。",
          "当前应用已经提供私有 story 工具。首次工作先调用 story(action=describe_structure) 获取完整故事类型定义。写作时优先使用 read_context 返回的可读 text，所有结构化或 Markdown 变更通过 ChangeSet 校验后落库。",
          "若 story(action=read_context) 报项目尚未初始化，调用 story(action=initialize)；存储中已有故事记录时未经用户确认不得 replaceExisting。",
          "正式故事文件只能通过 story(action=commit_changes) 原子校验并提交：工具会先完整校验，只有通过后才写入。不要在每次提交前额外调用 action=validate_changes；该动作只用于用户明确要求预览或排查校验错误。",
          "不要使用 write、edit 或 bash 修改 story 目录。不要创建 Markdown 故事资产。",
          `当前故事 ID：${input.storyId}`,
          `当前 revision：${input.revision ?? "以 describe_structure 返回为准"}`,
          `所有 story 调用均绑定 workspaceId=${input.workspaceId}。`,
        ].join("\n"),
      },
    ],
    skillGroup: {
      label: "故事创作",
      description: "使用结构化故事能力规划、分析和创作当前故事。",
    },
    useKnowledge: false,
    allowedToolNames: [
      "story",
      "isle_story_skill",
      "isle_story_skill_resource",
      "read",
      "ls",
      "find",
      "grep",
      "ask_user",
    ],
  };
}
