import { createAgentClient } from "@/agent-client/runtime";
import type { RuntimeModelInput } from "@/agent-client/types";
import { assertStoryJsonReady, normalizeStoryJson } from "../../model/normalizer";
import type { StoryJson } from "../../model/types";

type StoryJsonConversionInput = {
  source: string;
  runtimeModel?: RuntimeModelInput | null;
  existingStory?: StoryJson | null;
  storyId?: string;
  title?: string;
};

const stripOutputFence = (value: string) =>
  value
    .trim()
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/i, "")
    .trim();

const extractJsonObjectText = (value: string) => {
  const stripped = stripOutputFence(value);
  const firstBrace = stripped.indexOf("{");
  const lastBrace = stripped.lastIndexOf("}");
  return firstBrace >= 0 && lastBrace > firstBrace ? stripped.slice(firstBrace, lastBrace + 1) : stripped;
};

const parseJsonObject = (value: string) => {
  const parsed = JSON.parse(extractJsonObjectText(value));
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("输入不是 JSON 对象。");
  }
  return parsed;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === "object" && !Array.isArray(value));

const isStoryJsonLike = (value: unknown) => {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.title === "string" &&
    Array.isArray(value.scenes) &&
    isRecord(value.graph) &&
    Array.isArray(value.graph.nodes)
  );
};

export const parseStoryJsonFromText = (
  value: string,
  options: {
    storyId?: string;
    title?: string;
  } = {},
): StoryJson | null => {
  try {
    const parsed = parseJsonObject(value);
    if (!isStoryJsonLike(parsed)) {
      return null;
    }
    const normalized = normalizeStoryJson(parsed, {
      id: options.storyId,
      title: options.title,
    });
    if (!normalized) {
      return null;
    }
    assertStoryJsonReady(normalized);
    return normalized;
  } catch {
    return null;
  }
};

const buildStoryJsonSchemaInstruction = () =>
  [
    "输出必须是一个 JSON 对象，不能有 markdown、解释、注释或额外文本。",
    "JSON 必须符合 StoryJson：",
    "- id, title, premise, goal, playerName",
    "- characters: [{ id, name, avatar, description, speakingStyle, writingStyle?, replyStylePrompt?, goals?, relationshipSummary?, publicRelationshipSummary?, memory? }]",
    "- lorebookEntries: [{ id, title, content, keywords, enabled, alwaysOn }]",
    "- scenes: [{ id, title, scene, goal, plot, direction, transition, memory, status? }]",
    "- graph: { nodes, edges }",
    "- createdAt, updatedAt",
    "graph.nodes 的 sceneId 必须引用 scenes。",
    "如果无法从来源判断字段内容，填空字符串或空数组，但保留结构完整。",
  ].join("\n");

const buildStoryJsonConverterSystemPrompt = () =>
  [
    "你是 story.json 转换器，只负责把来源内容转换为应用的标准故事 JSON。",
    "先自动识别来源内容类型，例如标准 story.json、纯文本、大纲、角色卡、世界书或 AI 生成设定，再选择合适的字段映射策略。",
    "不要输出补丁、摘要或解释。",
    "不要保留非标准字段。",
    buildStoryJsonSchemaInstruction(),
  ].join("\n\n");

const buildStoryJsonConverterRequest = (input: StoryJsonConversionInput) =>
  JSON.stringify(
    {
      targetIdentity: {
        storyId: input.storyId ?? input.existingStory?.id ?? "",
        title: input.title ?? input.existingStory?.title ?? "",
      },
      mergeMode: Boolean(input.existingStory),
      existingStory: input.existingStory ?? null,
      source: input.source,
    },
    null,
    2,
  );

export const convertStorySourceToStoryJson = async (input: StoryJsonConversionInput): Promise<StoryJson> => {
  const parsed = parseStoryJsonFromText(input.source, {
    storyId: input.storyId ?? input.existingStory?.id,
    title: input.title ?? input.existingStory?.title,
  });
  if (parsed && !input.existingStory) {
    return parsed;
  }

  if (!input.runtimeModel) {
    throw new Error("非标准来源需要先在设置中选择模型，再由 AI 转换为标准 story.json。");
  }

  const storyJsonAgentClient = createAgentClient();
  const result = await storyJsonAgentClient.agent.chat({
    runtimeModel: input.runtimeModel,
    systemPrompt: buildStoryJsonConverterSystemPrompt(),
    messages: [
      {
        role: "user",
        content: [
          input.existingStory
            ? "将来源内容合并进 existingStory，并输出合并后的完整 StoryJson。"
            : "将来源内容转换为一个完整 StoryJson。",
          "<request_context>",
          buildStoryJsonConverterRequest(input),
          "</request_context>",
        ].join("\n\n"),
      },
    ],
    stream: false,
  });

  const normalized = normalizeStoryJson(parseJsonObject(result.text), {
    id: input.storyId ?? input.existingStory?.id,
    title: input.title ?? input.existingStory?.title,
  });
  if (!normalized) {
    throw new Error("AI 转换结果不是有效的 story.json。");
  }
  assertStoryJsonReady(normalized);
  return normalized;
};
