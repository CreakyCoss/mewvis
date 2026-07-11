import { applyStoryChangeSet, storyChangeSetSchema } from "./change-set.js";
import { createEmptyStoryProject } from "./project.js";
import { STORY_CHANGE_SET_MAX_BYTES, STORY_CHANGE_SET_MAX_OPERATIONS } from "./change-set.js";
import { STORY_AUTHORING_CONTRACT, STORY_AUTHORING_MANIFEST_PATH } from "./contract.js";
import type { StoryProject } from "./schema.js";
import {
  type StoryChapterContext,
  type StoryCommitChangesResult,
  type StoryInitializeResult,
  type StoryProjectSummary,
  type StoryStructureDescription,
  type StoryToolService,
  type StoryValidateChangesResult,
} from "./tools.js";
import { validateStoryProject } from "./validation.js";
import type { StoryProjectRepository } from "./repository.js";

export const STORY_TOOL_STRUCTURE: StoryStructureDescription = {
  contract: STORY_AUTHORING_CONTRACT,
  changeSet: {
    maxOperations: STORY_CHANGE_SET_MAX_OPERATIONS,
    maxBytes: STORY_CHANGE_SET_MAX_BYTES,
    operations: [
      "upsert",
      "delete",
      "patch",
      "upsert-items",
      "remove-items",
      "add-values",
      "remove-values",
      "append-text",
      "replace-text",
    ],
    atomicCommit: true,
    revisionRequired: true,
  },
  rules: [
    "工具包只接受这一套结构，不支持结构 profile 切换或调用方自定义 Schema；validationProfile 只调整完整度校验。",
    "manifest 必须完整索引正式故事文件，文件 kind、id 与路径必须一致。",
    "正式写入必须通过 story(action=commit_changes)；校验失败时不得修改磁盘。",
    "每批提交成功后必须重新读取 revision，再构造下一批 ChangeSet。",
  ],
};

const canonicalChangedPath = (path: string) =>
  path
    .trim()
    .replace(/\\/g, "/")
    .replace(/^\/+|\/+$/g, "");

const buildProjectSummary = (project: StoryProject): StoryProjectSummary => ({
  revision: project.manifest.revision,
  book: project.book,
  positioning: project.positioning,
  style: project.style,
  arc: project.bookArc,
  volumes: project.volumes.map((volume) => ({
    id: volume.id,
    number: volume.number,
    title: volume.title,
    startChapter: volume.startChapter,
    endChapter: volume.endChapter,
    phase: volume.phase,
    purpose: volume.purpose,
    coreConflict: volume.coreConflict,
  })),
  chapters: project.chapterPlans.map((plan) => ({
    id: plan.id,
    number: plan.number,
    title: plan.title,
    volumeId: plan.volumeId,
    targetEmotion: plan.targetEmotion,
    coreEvent: plan.coreEvent,
    status: plan.status,
  })),
  characters: project.characters.map((character) => ({
    id: character.id,
    name: character.name,
    role: character.role,
    goals: character.goals,
  })),
  worldEntries: project.worldEntries.map((entry) => ({
    id: entry.id,
    title: entry.title,
    category: entry.category,
    keywords: entry.keywords,
  })),
  analyses: project.analyses.map((analysis) => ({
    id: analysis.id,
    analysisType: analysis.analysisType,
    target: analysis.target,
    status: analysis.status,
    sourceTitle: analysis.source.title,
  })),
  reviews: project.reviews.map((review) => ({
    id: review.id,
    reviewType: review.reviewType,
    verdict: review.verdict,
    openFindings: review.findings.filter((finding) => finding.status === "open").length,
  })),
  imports: project.imports.map((record) => ({
    id: record.id,
    sourceTitle: record.sourceTitle,
    lengthType: record.lengthType,
    status: record.status,
  })),
  progress: project.progress,
  validation: validateStoryProject(project, "draft"),
});

const buildChapterContext = (project: StoryProject, targetId: string): StoryChapterContext => {
  const numericTarget = Number(targetId);
  const plan = project.chapterPlans.find(
    (item) => item.id === targetId || (Number.isFinite(numericTarget) && item.number === numericTarget),
  );
  if (!plan) {
    throw new Error(`找不到章节细纲：${targetId}`);
  }
  const participantIds = new Set([...plan.participantIds, ...plan.beats.flatMap((beat) => beat.participantIds)]);
  const worldRefIds = new Set([...plan.worldRefIds, ...plan.beats.flatMap((beat) => beat.worldRefIds)]);
  const previousPlan = project.chapterPlans.find((item) => item.number === plan.number - 1);
  const chapter = project.chapters.find((item) => item.planId === plan.id);
  const previousChapter = previousPlan
    ? project.chapters.find((chapter) => chapter.planId === previousPlan.id)
    : undefined;
  const relatedForeshadows = project.foreshadows.foreshadows.filter(
    (foreshadow) =>
      foreshadow.plannedPlantChapterId === plan.id ||
      foreshadow.plantedChapterId === plan.id ||
      foreshadow.expectedResolveChapterId === plan.id ||
      foreshadow.resolvedChapterId === plan.id ||
      foreshadow.relatedEntityIds.some((id) => participantIds.has(id) || worldRefIds.has(id)),
  );
  return {
    revision: project.manifest.revision,
    book: project.book,
    positioning: project.positioning,
    style: project.style,
    volume: project.volumes.find((volume) => volume.id === plan.volumeId) ?? null,
    plan,
    chapter: chapter ?? null,
    previousChapter: previousChapter
      ? {
          id: previousChapter.id,
          title: previousChapter.title,
          summary: previousChapter.summary,
          content: previousChapter.content,
        }
      : null,
    characters: project.characters.filter((character) => participantIds.has(character.id)),
    characterStates: project.characterStates.filter((state) => participantIds.has(state.characterId)),
    worldEntries: project.worldEntries.filter((entry) => worldRefIds.has(entry.id)),
    relationships: project.relationships.relationships.filter(
      (relationship) =>
        participantIds.has(relationship.fromCharacterId) && participantIds.has(relationship.toCharacterId),
    ),
    foreshadows: relatedForeshadows,
    progress: project.progress,
    sources: [
      `story/outline/chapters/${plan.id}.json`,
      `story/outline/volumes/${plan.volumeId}.json`,
      ...[...participantIds].map((id) => `story/characters/${id}.json`),
      ...[...worldRefIds].map((id) => `story/world/${id}.json`),
    ],
  };
};

const invalidIssue = (error: unknown) => ({
  severity: "error" as const,
  code: "changeset.invalid",
  path: "changeSet",
  message: error instanceof Error ? error.message : String(error),
});

export const createStoryToolService = (repository: StoryProjectRepository): StoryToolService => ({
  async describeStructure() {
    return { available: true, structure: STORY_TOOL_STRUCTURE };
  },

  async initialize(input): Promise<StoryInitializeResult> {
    try {
      const status = await repository.inspect();
      if (status.initialized) {
        const current = await repository.load();
        return {
          initialized: false,
          alreadyInitialized: true,
          revision: current.manifest.revision,
          manifestPath: STORY_AUTHORING_MANIFEST_PATH,
          existingJsonPaths: status.jsonPaths,
          issues: [],
          hint: "故事工具结构已经初始化，请先读取上下文再增量提交。",
        };
      }
      if (status.jsonPaths.length > 0 && !input.replaceExistingJson) {
        return {
          initialized: false,
          alreadyInitialized: false,
          revision: null,
          manifestPath: STORY_AUTHORING_MANIFEST_PATH,
          existingJsonPaths: status.jsonPaths,
          issues: [
            {
              severity: "error",
              code: "initialize.existing-json",
              path: "story",
              message: "story 目录已有不受工具包管理的 JSON；明确允许替换后才能初始化唯一合法结构。",
            },
          ],
          hint: "确认这些普通 JSON 可以被替换后，将 replaceExistingJson 设为 true 重试。",
        };
      }
      const project = createEmptyStoryProject({ id: input.storyId, title: input.title });
      const validation = validateStoryProject(project, "draft");
      if (!validation.valid) {
        throw new Error(validation.issues.map((item) => `${item.path}：${item.message}`).join("\n"));
      }
      await repository.initialize(project, input.replaceExistingJson === true);
      return {
        initialized: true,
        alreadyInitialized: false,
        revision: project.manifest.revision,
        manifestPath: STORY_AUTHORING_MANIFEST_PATH,
        existingJsonPaths: status.jsonPaths,
        issues: validation.issues,
        hint: null,
      };
    } catch (error) {
      return {
        initialized: false,
        alreadyInitialized: false,
        revision: null,
        manifestPath: STORY_AUTHORING_MANIFEST_PATH,
        existingJsonPaths: [],
        issues: [invalidIssue(error)],
        hint: "未创建任何正式故事文件。请修正初始化参数后重试。",
      };
    }
  },

  async readContext(input) {
    const project = await repository.load();
    return input.scope === "chapter"
      ? buildChapterContext(project, input.targetId?.trim() || "")
      : buildProjectSummary(project);
  },

  async validateChanges(input): Promise<StoryValidateChangesResult> {
    try {
      const project = await repository.load();
      const changeSet = storyChangeSetSchema.parse(input.changeSet);
      const next = applyStoryChangeSet(project, changeSet);
      const validation = validateStoryProject(next, changeSet.validationProfile);
      return {
        valid: validation.valid,
        nextRevision: next.manifest.revision,
        issues: validation.issues,
        batch: changeSet.batch ?? null,
        operationTypes: [...new Set(changeSet.operations.map((operation) => operation.type))],
        changedPaths: [...new Set(changeSet.operations.map((operation) => canonicalChangedPath(operation.path)))],
      };
    } catch (error) {
      return {
        valid: false,
        nextRevision: null,
        issues: [invalidIssue(error)],
        batch: null,
        operationTypes: [],
        changedPaths: [],
      };
    }
  },

  async commitChanges(input): Promise<StoryCommitChangesResult> {
    try {
      const project = await repository.load();
      const changeSet = storyChangeSetSchema.parse(input.changeSet);
      const next = applyStoryChangeSet(project, changeSet);
      const changedPaths = [...new Set(changeSet.operations.map((operation) => canonicalChangedPath(operation.path)))];
      await repository.writeChanges(next, changedPaths);
      const validation = validateStoryProject(next, changeSet.validationProfile);
      return {
        committed: true,
        valid: true,
        revision: next.manifest.revision,
        batch: changeSet.batch ?? null,
        operationTypes: [...new Set(changeSet.operations.map((operation) => operation.type))],
        changedPaths,
        validation,
        issues: validation.issues,
        hint: null,
      };
    } catch (error) {
      return {
        committed: false,
        valid: false,
        revision: null,
        batch: null,
        operationTypes: [],
        changedPaths: [],
        validation: null,
        issues: [invalidIssue(error)],
        hint: "正式文件未修改。请读取最新 revision，并只修正当前小批次后重新提交。",
      };
    }
  },
});
