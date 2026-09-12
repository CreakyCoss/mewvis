import type { ChatProfile } from "@/chat/desktop";
export const workspaceChatProfile: ChatProfile = {
  id: "workspace",
  systemPrompt: (path) =>
    ["你是 Mewvis 的工作区 AI 助手。", `工作区路径：${path}`, "你可以帮助用户规划、写作、分析和修改工作区文件。"].join(
      "\n",
    ),
};
