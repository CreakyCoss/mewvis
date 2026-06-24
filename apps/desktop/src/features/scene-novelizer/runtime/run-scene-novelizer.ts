import { runTavernOneShotAgent } from "@/features/pages/tavern/runtime/agent";
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

const buildRewriteFeedback = (draft: SceneNovelDraft) => [
  `当前本地质量分：${draft.quality.score}`,
  ...draft.quality.issues.map((issue) => `- ${issue}`),
].join("\n");

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

export const runSceneNovelizer = async ({
  workspacePath,
  agentId,
  runtimeModel,
  source,
  autoRewrite = true,
  onTextDelta,
}: SceneNovelizerRunInput): Promise<SceneNovelDraft> => {
  const runWriter = async (feedback?: string) => {
    const result = await runTavernOneShotAgent({
      agentId,
      workspacePath,
      agentRoleId: SCENE_NOVELIZER_AGENT_ROLE_ID,
      runtimeModel,
      systemPrompt: buildSceneNovelizerSystemPrompt(source),
      requestContext: buildSceneNovelizerRequestContext(source, feedback),
      runtimeInstruction: buildSceneNovelizerRuntimeInstruction(source, feedback),
      userMessage: feedback ? "请重写本场景小说稿。" : "请生成本场景小说稿。",
      allowedTools: [],
      enabledSkills: [],
      onTextDelta,
    });
    const text = cleanSceneNovelDraftText(result.text);
    return createDraft({
      sourceId: source.id,
      platformStyleId: source.platformStyleId,
      text,
      quality: evaluateSceneNovelDraft({ text, source }),
      rewriteCount: feedback ? 1 : 0,
    });
  };

  const firstDraft = await runWriter();
  if (!autoRewrite || firstDraft.quality.score >= 76) {
    return firstDraft;
  }

  return runWriter(buildRewriteFeedback(firstDraft));
};
