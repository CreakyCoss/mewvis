import {
  buildPromptContext,
  loadContextResources,
} from "@/ai/context";
import type { Workspace } from "@/features/workspace/types";
import {
  readWorkspaceFile,
} from "../../api";

export type ApplicationPromptAgent = {
  id?: string | null;
  name: string;
  description?: string | null;
} | null;

export type BuildApplicationSystemPromptInput = {
  workspace: Workspace;
  text: string;
  activeFile: { path: string } | null;
  referencedFiles: Array<{ path: string }>;
  activeSkills: Array<{
    name: string;
    content: string;
    description?: string | null;
  }>;
  selectedAgent?: ApplicationPromptAgent;
  executionMemorySummary: string;
  trailingSections?: Array<string | null | undefined>;
};

const compactSections = (sections: Array<string | null | undefined>) =>
  sections.map((section) => section?.trim() ?? "").filter(Boolean).join("\n\n");

export const buildApplicationPromptParts = async ({
  workspace,
  text,
  activeFile,
  referencedFiles,
  activeSkills,
  selectedAgent = null,
  executionMemorySummary,
  trailingSections = [],
}: BuildApplicationSystemPromptInput) => {
  const resources = await loadContextResources({
    activeFile,
    references: referencedFiles,
    loadFile: async (file) => {
      const loaded = await readWorkspaceFile(workspace.path, file.path);
      return {
        path: loaded.path,
        content: loaded.content,
        updatedAt: loaded.updatedAt,
      };
    },
  });

  const selectedAgentProfile = selectedAgent?.name
    ? {
      id: selectedAgent.id ?? undefined,
      name: selectedAgent.name,
      description: selectedAgent.description ?? null,
    }
    : null;

  return {
    systemPrompt: compactSections([
      "你是 Mewvis 的工作区 AI 助手。",
      workspace.name ? `工作区名称：${workspace.name}` : "",
      `工作区路径：${workspace.path}`,
      "你可以帮助用户规划、写作、分析和修改项目文件。",
    ]),
    runtimeInstruction: compactSections(trailingSections),
    requestContext: buildPromptContext(
      resources.activeFile,
      resources.references,
      activeSkills,
      selectedAgentProfile,
      {
        contextQuery: text,
        executionMemorySummary,
      },
    ),
  };
};
