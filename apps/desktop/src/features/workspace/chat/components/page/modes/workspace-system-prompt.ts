import {
  agentContext,
  type BuildSystemPromptInput,
} from "@/ai/agent-context";
import { APP_DISPLAY_NAME } from "@/product-config";

const {
  buildSystemPrompt,
} = agentContext;

export type WorkspacePromptContext = {
  name: string;
  path: string;
};

export type BuildWorkspaceSystemPromptInput = BuildSystemPromptInput & {
  workspace: WorkspacePromptContext;
};

export const buildWorkspaceSystemPrompt = ({
  workspace,
  leadingSections,
  trailingSections,
  ...promptInput
}: BuildWorkspaceSystemPromptInput) => buildSystemPrompt({
  ...promptInput,
  leadingSections: [
    `你是 ${APP_DISPLAY_NAME} 的工作区 AI 助手。`,
    `工作区名称：${workspace.name}`,
    `工作区路径：${workspace.path}`,
    "你可以帮助用户规划、写作、分析和修改项目文件。",
    "如果需要创建或修改文件，请明确说明目标路径和内容；用户可以在文件面板中保存。",
    ...(leadingSections ?? []),
  ],
  trailingSections,
});
