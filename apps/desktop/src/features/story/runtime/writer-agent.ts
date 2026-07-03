import { createAgentClient } from "@/agent-client/runtime";
import type { RuntimeModelInput } from "@/agent-client/types";
import { extractStoryNodeRuntimeData } from "../application/data-package";
import type { StoryJson } from "../schema";

export type StoryWriterAgentMode = "polish" | "expand";

export type StoryWriterAgentInput = {
  workspacePath: string;
  runtimeModel?: RuntimeModelInput | null;
  story: StoryJson;
  nodeId: string;
  mode: StoryWriterAgentMode;
  title: string;
  summary?: string;
  content: string;
};

const stripOutputFence = (value: string) =>
  value
    .trim()
    .replace(/^```(?:text|markdown|md)?/i, "")
    .replace(/```$/i, "")
    .trim();

const buildStoryWriterSystemPrompt = () =>
  [
    "你是故事端独立写作助手，只处理 story_context 与当前稿件。",
    "必须只输出可直接保存为稿件正文的内容，不要输出解释、标题、JSON、markdown 代码块或额外问候。",
    "polish 模式：保留原剧情事实、视角和人物意图，提升文笔、节奏、清晰度和连续性。",
    "expand 模式：在不篡改故事结构和节点目标的前提下补足描写、动作、对话和承接。",
    "不得启动酒馆导演调度，不得安排多 agent 发言，不得替换 story_context 中的角色设定。",
    "若原稿为空，基于当前节点写一段可收稿正文；若原稿非空，优先保留原稿信息密度。",
  ].join("\n");

const buildStoryWriterRequestContext = (input: StoryWriterAgentInput) => {
  const runtimeData = extractStoryNodeRuntimeData(input.story, {
    nodeId: input.nodeId,
  });

  return JSON.stringify(
    {
      mode: input.mode,
      story: runtimeData.background,
      currentNode: runtimeData.current.node,
      currentScene: runtimeData.current.scene,
      graph: {
        activeStage: runtimeData.current.stage,
        outgoingEdges: runtimeData.branch.outgoingEdges,
      },
      characters: runtimeData.characters,
      lorebookEntries: runtimeData.world.lorebookEntries.filter((entry) => entry.enabled),
      manuscript: {
        title: input.title,
        summary: input.summary ?? "",
        content: input.content,
      },
    },
    null,
    2,
  );
};

export const runStoryWriterAgent = async (input: StoryWriterAgentInput) => {
  const storyWriterAgentClient = createAgentClient();
  const taskInstruction =
    input.mode === "polish" ? "润色当前稿件，只输出润色后的正文。" : "扩写当前稿件，只输出扩写后的正文。";
  const result = await storyWriterAgentClient.agent.chat({
    runtimeModel: input.runtimeModel,
    systemPrompt: buildStoryWriterSystemPrompt(),
    messages: [
      {
        role: "user",
        content: [
          taskInstruction,
          `处理故事稿件：${input.title || "未命名稿件"}`,
          "<request_context>",
          buildStoryWriterRequestContext(input),
          "</request_context>",
        ].join("\n\n"),
      },
    ],
    stream: false,
  });

  return stripOutputFence(result.text);
};
