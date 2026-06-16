import {
  type BuildSystemPromptInput,
  type PromptAgentProfile,
} from "@/ai/agent-context";
import type { CollaborationPromptPhase } from "../../../utils/collaboration";
import {
  buildWorkspaceSystemPrompt,
  type WorkspacePromptContext,
} from "./workspace-system-prompt";

type CollaborationPromptOptions = {
  collaborationInstruction?: string | null;
  collaborationStepName?: string;
  collaborationStepIndex?: number;
  collaborationStepCount?: number;
};

type BuildCollaborationSystemPromptInput = BuildSystemPromptInput & {
  workspace: WorkspacePromptContext;
  selectedAgent: PromptAgentProfile;
  phase: CollaborationPromptPhase;
} & CollaborationPromptOptions;

const phaseInstructionFor = (
  phase: CollaborationPromptPhase,
  options: CollaborationPromptOptions,
) => {
  const instructions = {
    draft: [
      "协作阶段：写作初稿。",
      "请作为写作角色，根据用户需求产出完整可审查的初稿或方案。",
      "不要评价自己的结果，重点完成可交付内容。",
    ],
    review: [
      "协作阶段：审查意见。",
      "请作为审查角色，严格审查上一位角色的输出。",
      "请指出结构、逻辑、人物、节奏、设定、表达或可执行性问题，并给出具体修改建议。",
      "不要直接重写全文，重点输出审查意见。",
    ],
    revise: [
      "协作阶段：修订定稿。",
      "请作为写作角色，根据审查意见修订上一版内容。",
      "最终输出应是用户可以直接使用的版本，可以简要说明采纳了哪些关键修改。",
    ],
    custom: [
      `协作阶段：${options.collaborationStepName ?? "自定义步骤"}。`,
      options.collaborationStepIndex && options.collaborationStepCount
        ? `这是协作流程中的第 ${options.collaborationStepIndex} 步，共 ${options.collaborationStepCount} 步。`
        : "",
      "请根据用户需求、已有上下文和前序步骤输出完成当前步骤需要交付的内容。",
      "如果前序步骤输出中包含建议或审查意见，请结合当前步骤说明决定如何处理。",
    ].filter(Boolean),
  }[phase];

  return instructions.join("\n");
};

export const buildCollaborationSystemPrompt = ({
  workspace,
  phase,
  collaborationInstruction,
  collaborationStepName,
  collaborationStepIndex,
  collaborationStepCount,
  trailingSections,
  ...promptInput
}: BuildCollaborationSystemPromptInput) => {
  const collaborationOptions = {
    collaborationInstruction,
    collaborationStepName,
    collaborationStepIndex,
    collaborationStepCount,
  };
  const customInstruction = collaborationInstruction?.trim()
    ? [
        "协作流程自定义说明：",
        collaborationInstruction.trim(),
      ].join("\n")
    : "";

  return buildWorkspaceSystemPrompt({
    workspace,
    ...promptInput,
    trailingSections: [
      phaseInstructionFor(phase, collaborationOptions),
      customInstruction,
      ...(trailingSections ?? []),
    ],
  });
};
