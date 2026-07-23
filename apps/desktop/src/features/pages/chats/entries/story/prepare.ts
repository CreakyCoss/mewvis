import { createAgentClient } from "@/agent-client/runtime";
import { getAiAgentSettings } from "@/api/agents";
import { getLlmSettings } from "@/api/llm";
import { buildRuntimeModelInputs, buildRuntimeModelOptions } from "@/features/pages/settings/llm/store/model";
import type { StoryLibraryItem } from "@/features/pages/stories/storage";
import { storyDocumentData } from "@/features/pages/stories/story-document";
import type { ChatInputResources, ChatInputSkillOption } from "../../components/chat-input/type";

const STORY_SKILL_NAME = "story-assistant";
const storyToolNames = new Set(["read", "ls", "find", "grep", "ask_user"]);

const resolveRevision = (story: StoryLibraryItem) => {
  const manifest = story.documents.map(storyDocumentData).find((data) => data?.kind === "story-manifest");
  return typeof manifest?.revision === "number" ? manifest.revision : null;
};

const storySkill = (story: StoryLibraryItem): ChatInputSkillOption => ({
  key: STORY_SKILL_NAME,
  name: STORY_SKILL_NAME,
  label: "故事创作助手",
  description: "使用结构化故事能力规划、分析和创作当前故事。",
  content: [
    "你正在 Novel Claw 的结构化故事创作会话中协作。",
    "必须先使用 story-assistant 专属路由，再选择对应的 story-assistant-* 技能。",
    "所有结构化或 Markdown 变更必须通过 story 工具校验后提交。",
    `当前故事 ID：${story.overview.id}`,
    `当前 revision：${resolveRevision(story) ?? "尚未初始化"}`,
  ].join("\n"),
  source: "system",
  path: "",
});

export const prepareStoryChatResources = async (story: StoryLibraryItem): Promise<ChatInputResources> => {
  const agentClient = createAgentClient();
  const [llmSettings, agentSettings, toolSettings] = await Promise.all([
    getLlmSettings(),
    getAiAgentSettings(),
    agentClient.capabilities.listAgentTools(),
  ]);
  const models = buildRuntimeModelOptions(llmSettings);
  const runtimeModels = buildRuntimeModelInputs(llmSettings);
  const skill = storySkill(story);

  return {
    models: models.flatMap((model, index) => {
      const runtimeModel = runtimeModels[model.id];
      return runtimeModel
        ? [
            {
              value: model.id,
              label: `${model.provider.name}/${model.modelName}`,
              selectedLabel: model.modelName,
              description: `${model.provider.name} / ${model.modelName}`,
              isDefault: index === 0,
              runtimeModel,
            },
          ]
        : [];
    }),
    agents: agentSettings.agents.map((agent) => ({
      value: agent.id,
      label: agent.name,
      description: agent.description ?? "",
      isDefault: false,
      agent,
    })),
    skillGroups: [
      {
        value: STORY_SKILL_NAME,
        label: "故事创作",
        description: skill.description,
        isDefault: true,
        skills: [skill],
      },
    ],
    tools: toolSettings.tools
      .filter((tool) => storyToolNames.has(tool.name))
      .map((tool) => ({
        value: tool.name,
        label: tool.label,
        description: tool.description ?? "",
        isDefault: true,
      })),
  };
};
