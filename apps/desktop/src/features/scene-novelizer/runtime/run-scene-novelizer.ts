import { createAgentClient } from "@/agent-client/runtime";
import type {
  AgentClientAgentEvent,
  AgentClientCollaborationEvent,
  AgentClientCollaborationResult,
} from "@/agent-client/contracts";
import type {
  SceneNovelDraft,
  SceneNovelizerRunInput,
} from "../types";
import {
  cleanSceneNovelDraftText,
} from "../quality/contamination";
import {
  evaluateSceneNovelDraft,
} from "../quality/metrics";
import {
  buildSceneNovelizerRequestContext,
  buildSceneNovelizerRuntimeInstruction,
  buildSceneNovelizerSystemPrompt,
} from "./build-novelizer-request";

const SCENE_NOVELIZER_AGENT_ROLE_ID = "scene-novelizer-webnovel-writer";
const SCENE_NOVELIZER_REVIEWER_ROLE_ID = "scene-novelizer-webnovel-reviewer";

const sceneNovelizerAgentClient = createAgentClient();

const createDraft = ({
  sourceId,
  platformStyleId,
  text,
  quality,
  rewriteCount,
}: Pick<SceneNovelDraft, "sourceId" | "platformStyleId" | "text" | "quality" | "rewriteCount">): SceneNovelDraft => ({
  id: crypto.randomUUID(),
  sourceId,
  platformStyleId,
  text,
  quality,
  rewriteCount,
  createdAt: Date.now(),
});

type SceneNovelizerCollaborationOutput = AgentClientCollaborationResult & {
  taskId: string;
};

const isCollaborationEvent = (
  event: AgentClientAgentEvent,
): event is AgentClientCollaborationEvent =>
  event.type === "workflow_started" ||
  event.type === "step_started" ||
  event.type === "agent_event" ||
  event.type === "step_done" ||
  event.type === "step_skipped" ||
  event.type === "workflow_done" ||
  event.type === "collaboration_result";

const isFailureState = (event: AgentClientAgentEvent) =>
  event.type === "error" ||
  (
    event.type === "state" &&
    (
      event.taskState === "failed" ||
      event.taskState === "error" ||
      event.taskState === "cancelled" ||
      event.workerState === "failed" ||
      event.workerState === "error"
    )
  ) ||
  (event.type === "exit" && !event.success);

const errorMessageFromEvent = (event: AgentClientAgentEvent) => {
  if (event.type === "error") {
    return event.message;
  }
  if (event.type === "state") {
    return `小说稿协作失败：${event.taskState}/${event.workerState}`;
  }
  if (event.type === "exit") {
    return `小说稿协作异常退出：${event.code ?? "unknown"}`;
  }
  return "小说稿协作失败";
};

const sanitizeSessionSegment = (value: string, fallback: string) => {
  const segment = value
    .trim()
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return segment || fallback;
};

const sceneNovelizerSessionRootDir = (sourceId: string) =>
  `scene-novelizer/${sanitizeSessionSegment(sourceId, "source")}/review-rewrite`;

const buildReviewInstruction = (source: SceneNovelizerRunInput["source"]) => [
  "审阅 producer 生成的场景小说稿，只输出严格 JSON。",
  "approved 表示可以收稿；revise 表示需要重写；blocked 表示素材不足或存在不可修复冲突。",
  "评分低于 76 时优先 revise，并给出可执行的 revisionInstruction。",
  `目标长度约 ${source.constraints.targetChars} 字；段落上限 ${source.constraints.paragraphMaxChars} 字。`,
  "重点检查：素材事实、用户行动保留、关键真相不新增、段落节奏、对白衔接、钩子和平台风格。",
].join("\n");

const runSceneNovelizerCollaboration = async ({
  workspacePath,
  agentId,
  runtimeModel,
  source,
  autoRewrite,
  onTextDelta,
}: SceneNovelizerRunInput & {
  autoRewrite: boolean;
}): Promise<SceneNovelizerCollaborationOutput> => {
  let taskId = "";
  let unlisten: (() => void) | undefined;
  let settled = false;

  const resultPromise = new Promise<SceneNovelizerCollaborationOutput>(async (resolve, reject) => {
    const rejectOnce = (error: unknown) => {
      if (settled) {
        return;
      }
      settled = true;
      reject(error);
    };
    const resolveOnce = (result: SceneNovelizerCollaborationOutput) => {
      if (settled) {
        return;
      }
      settled = true;
      resolve(result);
    };

    try {
      unlisten = await sceneNovelizerAgentClient.subscribe((event) => {
        if (!taskId || ("taskId" in event && event.taskId !== taskId)) {
          return;
        }
        if (isFailureState(event)) {
          rejectOnce(new Error(errorMessageFromEvent(event)));
          return;
        }
        if (!isCollaborationEvent(event)) {
          return;
        }
        if (
          event.type === "agent_event" &&
          event.agentRoleId === SCENE_NOVELIZER_AGENT_ROLE_ID &&
          event.event.type === "text_delta" &&
          typeof event.event.delta === "string"
        ) {
          onTextDelta?.(event.event.delta);
          return;
        }
        if (event.type === "workflow_done") {
          resolveOnce({
            ...event.result,
            taskId,
          });
          return;
        }
        if (event.type === "collaboration_result") {
          const { type: _type, requestId: _requestId, taskId: _eventTaskId, ...result } = event;
          resolveOnce({
            ...result,
            taskId,
          });
        }
      });

      const task = await sceneNovelizerAgentClient.run({
        type: "collaborationMode",
        mode: "producer.review-rewrite-loop",
        workspacePath,
        sessionRootDir: sceneNovelizerSessionRootDir(source.id),
        participants: [
          {
            id: SCENE_NOVELIZER_AGENT_ROLE_ID,
            kind: "producer",
            label: "场景小说写手",
            agentId,
            runtimeModel,
            systemPrompt: buildSceneNovelizerSystemPrompt(source),
            requestContext: buildSceneNovelizerRequestContext(source),
            runtimeInstruction: buildSceneNovelizerRuntimeInstruction(source),
            userMessage: "请生成本场景小说稿。",
            capabilities: ["draft", "rewrite"],
          },
          {
            id: SCENE_NOVELIZER_REVIEWER_ROLE_ID,
            kind: "reviewer",
            label: "小说稿审阅",
            agentId,
            runtimeModel,
            systemPrompt: "你是场景小说稿审阅 agent，只审阅 producer 的正文并输出严格 JSON。",
            instruction: buildReviewInstruction(source),
            requestContext: buildSceneNovelizerRequestContext(source),
            userMessage: [
              "请审阅以下场景小说稿，并只输出严格 JSON：",
              "",
              "{{ outputs.draft }}",
            ].join("\n"),
            capabilities: ["review", "score"],
          },
        ],
        context: {
          sourceId: source.id,
          title: source.title,
          platformStyleId: source.platformStyleId,
          targetChars: source.constraints.targetChars,
          paragraphMaxChars: source.constraints.paragraphMaxChars,
        },
        options: {
          maxRounds: autoRewrite ? 2 : 1,
        },
        allowedTools: [],
        enabledSkills: [],
      });
      taskId = task.taskId;
    } catch (error) {
      rejectOnce(error);
    }
  });

  try {
    return await resultPromise;
  } finally {
    unlisten?.();
  }
};

const readOutputText = (
  output: unknown,
  key: string,
) => output && typeof output === "object" && !Array.isArray(output)
  ? typeof (output as Record<string, unknown>)[key] === "string"
    ? (output as Record<string, string>)[key]
    : null
  : null;

export const runSceneNovelizer = async ({
  workspacePath,
  agentId,
  runtimeModel,
  source,
  autoRewrite = true,
  onTextDelta,
}: SceneNovelizerRunInput): Promise<SceneNovelDraft> => {
  const result = await runSceneNovelizerCollaboration({
    workspacePath,
    agentId,
    runtimeModel,
    source,
    autoRewrite,
    onTextDelta,
  });
  const latestDraftStep = [...result.steps].reverse().find((step) =>
    step.outputKey === "draft"
  );
  const draftText = readOutputText(result.output, "draft") ??
    latestDraftStep?.text ??
    "";
  const text = cleanSceneNovelDraftText(draftText);
  const producerRuns = result.steps.filter((step) =>
    step.agentRoleId === SCENE_NOVELIZER_AGENT_ROLE_ID
  ).length;

  return createDraft({
    sourceId: source.id,
    platformStyleId: source.platformStyleId,
    text,
    quality: evaluateSceneNovelDraft({ text, source }),
    rewriteCount: Math.max(0, producerRuns - 1),
  });
};
