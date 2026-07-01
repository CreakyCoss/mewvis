import { createAgentClient } from "@/agent-client/runtime";
import type { RuntimeModelInput } from "@/agent-client/protocol";
import {
  buildStoryContextPackageFromAsset,
  type StoryAsset,
} from "../application/state";

export type StoryWriterAgentMode = "polish" | "expand";

export type StoryWriterAgentInput = {
  workspacePath: string;
  runtimeModel?: RuntimeModelInput | null;
  story: StoryAsset;
  nodeId: string;
  mode: StoryWriterAgentMode;
  title: string;
  summary?: string;
  content: string;
};

const stripOutputFence = (value: string) =>
  value.trim()
    .replace(/^```(?:text|markdown|md)?/i, "")
    .replace(/```$/i, "")
    .trim();

const buildStoryWriterSystemPrompt = () => [
  "你是故事端独立写作助手，只处理 story_context 与当前稿件。",
  "必须只输出可直接保存为稿件正文的内容，不要输出解释、标题、JSON、markdown 代码块或额外问候。",
  "polish 模式：保留原剧情事实、视角和人物意图，提升文笔、节奏、清晰度和连续性。",
  "expand 模式：在不篡改故事结构和节点目标的前提下补足描写、动作、对话和承接。",
  "不得启动酒馆导演调度，不得安排多 agent 发言，不得替换 story_context 中的角色设定。",
  "若原稿为空，基于当前节点写一段可收稿正文；若原稿非空，优先保留原稿信息密度。",
].join("\n");

const buildStoryWriterRequestContext = (input: StoryWriterAgentInput) => {
  const context = buildStoryContextPackageFromAsset(input.story, {
    activeNodeId: input.nodeId,
  });
  const activeNode = context.graph.activeNode;
  const activeScene = context.graph.activeScene;

  return JSON.stringify({
    mode: input.mode,
    story: context.story,
    currentNode: activeNode,
    currentScene: activeScene,
    graph: {
      activeStage: context.graph.activeStage,
      outgoingEdges: context.graph.edges.filter((edge) =>
        !activeNode?.id || edge.fromNodeId === activeNode.id
      ),
    },
    characters: context.characters,
    lorebookEntries: context.world.lorebookEntries.filter((entry) => entry.enabled),
    manuscript: {
      title: input.title,
      summary: input.summary ?? "",
      content: input.content,
    },
  }, null, 2);
};

export const runStoryWriterAgent = async (
  input: StoryWriterAgentInput,
) => {
  const storyWriterAgentClient = createAgentClient();
  const result = await storyWriterAgentClient.run({
    type: "chat",
    workspacePath: input.workspacePath,
    runtimeModel: input.runtimeModel,
    systemPrompt: buildStoryWriterSystemPrompt(),
    requestContext: buildStoryWriterRequestContext(input),
    runtimeInstruction: input.mode === "polish"
      ? "润色当前稿件，只输出润色后的正文。"
      : "扩写当前稿件，只输出扩写后的正文。",
    userMessage: `处理故事稿件：${input.title || "未命名稿件"}`,
    stream: false,
  });

  return stripOutputFence(result.text);
};
