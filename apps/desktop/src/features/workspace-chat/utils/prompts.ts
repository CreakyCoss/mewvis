import type { AgentProfile } from "@/features/agent-settings/types";
import type { LlmProvider, ProviderModel } from "@/features/llm-settings/types";
import type { WorkspaceSkill } from "@/features/workspace-skills/types";
import type { Workspace } from "@/features/workspaces/types";
import { chatWithLlm } from "../api";
import {
  buildRuntimeConversationContext,
  formatConversationForSummary,
  type ConversationSummarizer,
  type RuntimeConversationContext,
} from "../context";
import type { ResolvedFileReference } from "../page-types";
import type { ConversationMessage, WorkspaceFile } from "../types";
import { appendReferencesToPrompt } from "./references";

export const buildAgentPrompt = (
  text: string,
  references: ResolvedFileReference[],
  history: RuntimeConversationContext,
  selectedAgent: AgentProfile | null,
) => {
  const summaryContext = history.summary
    ? [
      "以下是更早对话的压缩摘要，仅用于恢复跨任务上下文：",
      history.summary,
      "",
    ].join("\n")
    : "";
  const historyContext = history.recentMessages.length
    ? [
      "以下是最近对话历史。用户当前输入可能是在回答助手上一轮提出的问题，请结合历史理解：",
      history.recentMessages
        .map((message) => `${message.role === "user" ? "用户" : "助手"}：${message.content}`)
        .join("\n\n"),
      "",
    ].join("\n")
    : "";
  const agentContext = selectedAgent
    ? [
        `当前使用 Agent：${selectedAgent.name}`,
        selectedAgent.description ? `Agent 描述：${selectedAgent.description}` : "",
        "请优先保持这个 Agent 的角色定位、语气和工作方式。",
        "",
      ].filter(Boolean).join("\n")
    : "";
  const interactionInstructions = [
    "交互规则：",
    "- 当继续执行前缺少必要信息、需要用户选择方向、需要确认方案，或存在多个合理选项时，必须调用 ask_user 工具询问用户，不要只在正文里提问。",
    "- 如果问题是开放式回答，调用 ask_user 时使用 input.type = \"text\"。",
    "- 如果问题有明确候选项，调用 ask_user 时使用 input.type = \"select\"，并提供至少两个 options；可以加入 { value: \"other\", label: \"请输入\" } 让用户自定义。",
    "- 调用 ask_user 后，等待用户回答，再基于回答继续原任务。",
    "",
  ].join("\n");

  return appendReferencesToPrompt(
    `${agentContext}${interactionInstructions}${summaryContext}${historyContext}当前用户输入：\n${text}`,
    references,
  );
};

export const createConversationSummarizer = (
  provider: LlmProvider,
  model: ProviderModel,
): ConversationSummarizer => async ({ previousSummary, messages }) => {
  if (messages.length === 0) {
    return previousSummary;
  }

  const result = await chatWithLlm({
    provider,
    model,
    stream: false,
    systemPrompt: [
      "你是聊天历史压缩器。请把跨任务恢复所需的信息压缩成中文摘要。",
      "要求：保留用户目标、已确认的决策、关键约束、文件/路径/实体名、未完成事项、助手已经给出的重要结论。",
      "不要添加新事实，不要回答用户问题，不要输出寒暄。",
      "输出适合继续追加滚动摘要的纯文本，尽量精炼。",
    ].join("\n"),
    messages: [
      {
        role: "user",
        content: [
          previousSummary
            ? `已有摘要：\n${previousSummary}`
            : "已有摘要：无",
          "",
          "需要并入摘要的新对话：",
          formatConversationForSummary(messages),
        ].join("\n"),
        timestamp: Date.now(),
      },
    ],
  });

  return result.text.trim() || previousSummary;
};

export const buildSystemPrompt = (
  workspace: Workspace,
  activeFile: WorkspaceFile | null,
  referencedFiles: ResolvedFileReference[],
  enabledSkills: WorkspaceSkill[],
  selectedAgent: AgentProfile | null,
) => {
  const fileContext = activeFile
    ? `\n\n当前打开文件：${activeFile.path}\n\n${activeFile.content.slice(0, 12000)}`
    : "";
  const referenceContext = referencedFiles.length
    ? `\n\n用户引用文件：\n${referencedFiles
      .map((file) => [
        `## ${file.path}`,
        file.content.slice(0, 20000),
      ].join("\n\n"))
      .join("\n\n")}`
    : "";
  const skillsContext = enabledSkills.length
    ? `\n\n当前工作区启用的 Skills：\n${enabledSkills
      .map((skill) => [
        `<skill name="${skill.name}">`,
        skill.content.slice(0, 12000),
        "</skill>",
      ].join("\n"))
      .join("\n\n")}`
    : "";
  const agentContext = selectedAgent
    ? [
        "",
        `当前 Agent：${selectedAgent.name}`,
        selectedAgent.description ? `Agent 描述：${selectedAgent.description}` : "",
        "请优先保持这个 Agent 的角色定位、语气和工作方式。",
      ].filter(Boolean).join("\n")
    : "";

  return [
    "你是 Novel Claw 的工作区 AI 助手。",
    `工作区名称：${workspace.name}`,
    `工作区路径：${workspace.path}`,
    "你可以帮助用户规划、写作、分析和修改项目文件。",
    "如果需要创建或修改文件，请明确说明目标路径和内容；用户可以在文件面板中保存。",
    agentContext,
    fileContext,
    referenceContext,
    skillsContext,
  ].join("\n");
};

export const buildCollaborationSystemPrompt = (
  workspace: Workspace,
  activeFile: WorkspaceFile | null,
  referencedFiles: ResolvedFileReference[],
  enabledSkills: WorkspaceSkill[],
  selectedAgent: AgentProfile,
  phase: "draft" | "review" | "revise",
) => {
  const basePrompt = buildSystemPrompt(
    workspace,
    activeFile,
    referencedFiles,
    enabledSkills,
    selectedAgent,
  );
  const phaseInstruction = {
    draft: [
      "协作阶段：写作初稿。",
      "请作为写作 Agent，根据用户需求产出完整可审查的初稿或方案。",
      "不要评价自己的结果，重点完成可交付内容。",
    ],
    review: [
      "协作阶段：审查意见。",
      "请作为审查 Agent，严格审查上一位 Agent 的输出。",
      "请指出结构、逻辑、人物、节奏、设定、表达或可执行性问题，并给出具体修改建议。",
      "不要直接重写全文，重点输出审查意见。",
    ],
    revise: [
      "协作阶段：修订定稿。",
      "请作为写作 Agent，根据审查意见修订上一版内容。",
      "最终输出应是用户可以直接使用的版本，可以简要说明采纳了哪些关键修改。",
    ],
  }[phase].join("\n");

  return [basePrompt, phaseInstruction].join("\n\n");
};

export const buildConversationContextForAgent = (
  conversation: ConversationMessage[],
  context: Parameters<typeof buildRuntimeConversationContext>[1],
) => buildRuntimeConversationContext(conversation, context);
