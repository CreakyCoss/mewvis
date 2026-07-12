import type { ZodIssue } from "zod";
import { storyProjectSchema, type StoryProject } from "./schema.js";
import { storyProjectFiles } from "./project.js";
import type { CompiledStoryContract } from "../../compiler.js";

export type StoryValidationProfile = "draft" | "openBook" | "chapterWrite";

export type StoryValidationIssue = {
  severity: "error" | "warning";
  code: string;
  path: string;
  message: string;
};

export type StoryValidationResult = {
  valid: boolean;
  issues: StoryValidationIssue[];
};

const issue = (
  severity: StoryValidationIssue["severity"],
  code: string,
  path: string,
  message: string,
): StoryValidationIssue => ({ severity, code, path, message });

const fromZodIssue = (value: ZodIssue): StoryValidationIssue =>
  issue("error", `schema.${value.code}`, value.path.join("."), value.message);

const duplicateValues = (values: string[]) => {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) {
      duplicates.add(value);
    }
    seen.add(value);
  }
  return [...duplicates];
};

const addMissingReference = (
  issues: StoryValidationIssue[],
  path: string,
  targetId: string | undefined,
  validIds: Set<string>,
  targetLabel: string,
) => {
  if (targetId && !validIds.has(targetId)) {
    issues.push(issue("error", "reference.missing", path, `引用的${targetLabel}「${targetId}」不存在。`));
  }
};

const addDuplicateIssues = (issues: StoryValidationIssue[], values: string[], path: string, label: string) => {
  for (const duplicate of duplicateValues(values)) {
    issues.push(issue("error", "identity.duplicate", path, `${label}「${duplicate}」重复。`));
  }
};

const validateManifest = (project: StoryProject, contract: CompiledStoryContract, issues: StoryValidationIssue[]) => {
  if (project.manifest.storyId !== project.book.id) {
    issues.push(issue("error", "manifest.story_id", "manifest.storyId", "manifest storyId 必须与 book.id 一致。"));
  }
  if (project.manifest.title !== project.book.title) {
    issues.push(issue("error", "manifest.title", "manifest.title", "manifest title 必须与 book.title 一致。"));
  }

  const expectedFiles = storyProjectFiles(project, contract).map(
    ({ path, value }) =>
      `${value.kind}\u0000${value.kind === "story-manifest" ? value.storyId : value.id}\u0000${path}`,
  );
  const declaredFiles = project.manifest.files.map(({ kind, id, path }) => `${kind}\u0000${id}\u0000${path}`);
  addDuplicateIssues(
    issues,
    project.manifest.files.map((file) => file.path),
    "manifest.files",
    "文件路径",
  );
  for (const expected of expectedFiles) {
    if (!declaredFiles.includes(expected)) {
      const [, id, path] = expected.split("\u0000");
      issues.push(
        issue("error", "manifest.file_missing", "manifest.files", `manifest 缺少 ${id} 对应的文件 ${path}。`),
      );
    }
  }
  for (const declared of declaredFiles) {
    if (!expectedFiles.includes(declared)) {
      const [, id, path] = declared.split("\u0000");
      issues.push(
        issue("error", "manifest.file_stale", "manifest.files", `manifest 包含不存在或已变化的文件 ${id}（${path}）。`),
      );
    }
  }
};

const validateReferences = (project: StoryProject, contract: CompiledStoryContract, issues: StoryValidationIssue[]) => {
  const characterIds = new Set(project.characters.map((item) => item.id));
  const worldIds = new Set(project.worldEntries.map((item) => item.id));
  const volumeIds = new Set(project.volumes.map((item) => item.id));
  const planIds = new Set(project.chapterPlans.map((item) => item.id));
  const chapterIds = new Set(project.chapters.map((item) => item.id));
  const relationshipIds = new Set(project.relationships.relationships.map((item) => item.id));
  const foreshadowIds = new Set(project.foreshadows.foreshadows.map((item) => item.id));
  const timelineEntryIds = new Set(project.timelines.flatMap((timeline) => timeline.entries.map((entry) => entry.id)));
  const sceneIds = new Set(project.scenes.map((item) => item.id));
  const analysisIds = new Set(project.analyses.map((item) => item.id));
  const reviewIds = new Set(project.reviews.map((item) => item.id));
  const importIds = new Set(project.imports.map((item) => item.id));
  const nodeIds = new Set(project.graph.nodes.map((item) => item.id));
  const allEntityIds = new Set([
    project.book.id,
    ...characterIds,
    ...worldIds,
    ...volumeIds,
    ...planIds,
    ...chapterIds,
    ...relationshipIds,
    ...foreshadowIds,
    ...timelineEntryIds,
    ...sceneIds,
    ...analysisIds,
    ...reviewIds,
    ...importIds,
    ...nodeIds,
  ]);

  const allFileIds = storyProjectFiles(project, contract).map(({ value }) =>
    value.kind === "story-manifest" ? value.storyId : value.id,
  );
  addDuplicateIssues(issues, allFileIds, "project", "文件 ID");
  addDuplicateIssues(
    issues,
    project.volumes.map((item) => String(item.number)),
    "volumes.number",
    "卷序号",
  );
  addDuplicateIssues(
    issues,
    project.chapterPlans.map((item) => String(item.number)),
    "chapterPlans.number",
    "细纲章节号",
  );
  addDuplicateIssues(
    issues,
    project.chapters.map((item) => String(item.number)),
    "chapters.number",
    "正文章节号",
  );
  addDuplicateIssues(
    issues,
    project.relationships.relationships.map((item) => item.id),
    "relationships",
    "关系 ID",
  );
  addDuplicateIssues(
    issues,
    project.foreshadows.foreshadows.map((item) => item.id),
    "foreshadows",
    "伏笔 ID",
  );
  addDuplicateIssues(
    issues,
    project.graph.nodes.map((item) => item.id),
    "graph.nodes",
    "节点 ID",
  );
  addDuplicateIssues(
    issues,
    project.graph.edges.map((item) => item.id),
    "graph.edges",
    "边 ID",
  );

  addMissingReference(issues, "book.protagonistId", project.book.protagonistId, characterIds, "角色");
  project.relationships.relationships.forEach((relationship, index) => {
    addMissingReference(
      issues,
      `relationships.relationships.${index}.fromCharacterId`,
      relationship.fromCharacterId,
      characterIds,
      "角色",
    );
    addMissingReference(
      issues,
      `relationships.relationships.${index}.toCharacterId`,
      relationship.toCharacterId,
      characterIds,
      "角色",
    );
    relationship.evolution.forEach((entry, entryIndex) =>
      addMissingReference(
        issues,
        `relationships.relationships.${index}.evolution.${entryIndex}.chapterId`,
        entry.chapterId,
        new Set([...planIds, ...chapterIds]),
        "章节",
      ),
    );
  });
  project.worldEntries.forEach((entry, index) =>
    entry.relatedEntityIds.forEach((id, refIndex) =>
      addMissingReference(issues, `worldEntries.${index}.relatedEntityIds.${refIndex}`, id, allEntityIds, "实体"),
    ),
  );
  project.bookArc.volumeIds.forEach((id, index) =>
    addMissingReference(issues, `bookArc.volumeIds.${index}`, id, volumeIds, "卷"),
  );
  project.bookArc.keyTurningPoints.forEach((turningPoint, index) =>
    addMissingReference(
      issues,
      `bookArc.keyTurningPoints.${index}.chapterId`,
      turningPoint.chapterId,
      planIds,
      "章节细纲",
    ),
  );
  project.volumes.forEach((volume, index) => {
    if (volume.startChapter > volume.endChapter) {
      issues.push(issue("error", "range.invalid", `volumes.${index}`, "卷的起始章节不能晚于结束章节。"));
    }
    volume.chapterIds.forEach((id, refIndex) =>
      addMissingReference(issues, `volumes.${index}.chapterIds.${refIndex}`, id, planIds, "章节细纲"),
    );
  });
  const sortedVolumes = [...project.volumes].sort((left, right) => left.startChapter - right.startChapter);
  for (let index = 1; index < sortedVolumes.length; index += 1) {
    const previous = sortedVolumes[index - 1];
    const current = sortedVolumes[index];
    if (previous && current && current.startChapter <= previous.endChapter) {
      issues.push(
        issue("error", "range.overlap", "volumes", `卷「${previous.title}」与「${current.title}」的章节范围重叠。`),
      );
    }
  }

  project.chapterPlans.forEach((plan, index) => {
    addMissingReference(issues, `chapterPlans.${index}.volumeId`, plan.volumeId, volumeIds, "卷");
    plan.participantIds.forEach((id, refIndex) =>
      addMissingReference(issues, `chapterPlans.${index}.participantIds.${refIndex}`, id, characterIds, "角色"),
    );
    plan.appearanceOrder.forEach((id, refIndex) =>
      addMissingReference(issues, `chapterPlans.${index}.appearanceOrder.${refIndex}`, id, allEntityIds, "实体"),
    );
    plan.worldRefIds.forEach((id, refIndex) =>
      addMissingReference(issues, `chapterPlans.${index}.worldRefIds.${refIndex}`, id, worldIds, "世界设定"),
    );
    plan.beats.forEach((beat, beatIndex) => {
      beat.participantIds.forEach((id, refIndex) =>
        addMissingReference(
          issues,
          `chapterPlans.${index}.beats.${beatIndex}.participantIds.${refIndex}`,
          id,
          characterIds,
          "角色",
        ),
      );
      beat.worldRefIds.forEach((id, refIndex) =>
        addMissingReference(
          issues,
          `chapterPlans.${index}.beats.${beatIndex}.worldRefIds.${refIndex}`,
          id,
          worldIds,
          "世界设定",
        ),
      );
    });
    const totalBudget = plan.beats.reduce((sum, beat) => sum + beat.wordBudget, 0);
    if (
      plan.targetWords > 0 &&
      plan.beats.length > 0 &&
      (totalBudget < plan.targetWords || totalBudget > plan.targetWords * 1.1)
    ) {
      issues.push(
        issue(
          "error",
          "chapter.budget",
          `chapterPlans.${index}.beats`,
          `第 ${plan.number} 章情节点预算合计 ${totalBudget}，应在 ${plan.targetWords}-${Math.floor(plan.targetWords * 1.1)} 字之间。`,
        ),
      );
    }
  });

  project.chapters.forEach((chapter, index) => {
    addMissingReference(issues, `chapters.${index}.planId`, chapter.planId, planIds, "章节细纲");
    chapter.participantIds.forEach((id, refIndex) =>
      addMissingReference(issues, `chapters.${index}.participantIds.${refIndex}`, id, characterIds, "角色"),
    );
    chapter.worldRefIds.forEach((id, refIndex) =>
      addMissingReference(issues, `chapters.${index}.worldRefIds.${refIndex}`, id, worldIds, "世界设定"),
    );
    chapter.stateChanges.characterIds.forEach((id, refIndex) =>
      addMissingReference(issues, `chapters.${index}.stateChanges.characterIds.${refIndex}`, id, characterIds, "角色"),
    );
    chapter.stateChanges.relationshipIds.forEach((id, refIndex) =>
      addMissingReference(
        issues,
        `chapters.${index}.stateChanges.relationshipIds.${refIndex}`,
        id,
        relationshipIds,
        "关系",
      ),
    );
    chapter.stateChanges.foreshadowIds.forEach((id, refIndex) =>
      addMissingReference(
        issues,
        `chapters.${index}.stateChanges.foreshadowIds.${refIndex}`,
        id,
        foreshadowIds,
        "伏笔",
      ),
    );
    chapter.stateChanges.timelineEntryIds.forEach((id, refIndex) =>
      addMissingReference(
        issues,
        `chapters.${index}.stateChanges.timelineEntryIds.${refIndex}`,
        id,
        timelineEntryIds,
        "时间线事件",
      ),
    );
  });

  project.characterStates.forEach((state, index) => {
    addMissingReference(issues, `characterStates.${index}.characterId`, state.characterId, characterIds, "角色");
    addMissingReference(
      issues,
      `characterStates.${index}.asOfChapterId`,
      state.asOfChapterId,
      new Set([...planIds, ...chapterIds]),
      "章节",
    );
  });
  project.foreshadows.foreshadows.forEach((foreshadow, index) => {
    for (const [field, id] of [
      ["plannedPlantChapterId", foreshadow.plannedPlantChapterId],
      ["plantedChapterId", foreshadow.plantedChapterId],
      ["expectedResolveChapterId", foreshadow.expectedResolveChapterId],
      ["resolvedChapterId", foreshadow.resolvedChapterId],
    ] as const) {
      addMissingReference(
        issues,
        `foreshadows.foreshadows.${index}.${field}`,
        id,
        new Set([...planIds, ...chapterIds]),
        "章节",
      );
    }
    if (foreshadow.status === "resolved" && !foreshadow.resolvedChapterId) {
      issues.push(
        issue("error", "foreshadow.resolution", `foreshadows.foreshadows.${index}`, "已回收伏笔必须填写回收章节。"),
      );
    }
  });
  project.timelines.forEach((timeline, timelineIndex) =>
    timeline.entries.forEach((entry, entryIndex) => {
      addMissingReference(
        issues,
        `timelines.${timelineIndex}.entries.${entryIndex}.chapterId`,
        entry.chapterId,
        new Set([...planIds, ...chapterIds]),
        "章节",
      );
      entry.participantIds.forEach((id, refIndex) =>
        addMissingReference(
          issues,
          `timelines.${timelineIndex}.entries.${entryIndex}.participantIds.${refIndex}`,
          id,
          characterIds,
          "角色",
        ),
      );
      entry.worldRefIds.forEach((id, refIndex) =>
        addMissingReference(
          issues,
          `timelines.${timelineIndex}.entries.${entryIndex}.worldRefIds.${refIndex}`,
          id,
          worldIds,
          "世界设定",
        ),
      );
    }),
  );
  addMissingReference(
    issues,
    "progress.lastCompletedChapterId",
    project.progress.lastCompletedChapterId,
    chapterIds,
    "正文章节",
  );
  addMissingReference(issues, "progress.currentVolumeId", project.progress.currentVolumeId, volumeIds, "卷");
  addMissingReference(issues, "progress.nextChapterPlanId", project.progress.nextChapterPlanId, planIds, "章节细纲");

  project.graph.nodes.forEach((node, index) =>
    addMissingReference(issues, `graph.nodes.${index}.sceneId`, node.sceneId, sceneIds, "场景"),
  );
  project.graph.edges.forEach((edge, index) => {
    addMissingReference(issues, `graph.edges.${index}.fromNodeId`, edge.fromNodeId, nodeIds, "剧情节点");
    addMissingReference(issues, `graph.edges.${index}.toNodeId`, edge.toNodeId, nodeIds, "剧情节点");
  });
  project.imports.forEach((record, index) => {
    addMissingReference(issues, `imports.${index}.analysisId`, record.analysisId, analysisIds, "拆文分析");
    record.generatedFileIds.forEach((id, refIndex) =>
      addMissingReference(issues, `imports.${index}.generatedFileIds.${refIndex}`, id, allEntityIds, "故事文件"),
    );
  });
};

const validateOpeningCompleteness = (project: StoryProject, issues: StoryValidationIssue[]) => {
  const requiredText: Array<[string, string, string]> = [
    ["book.title", project.book.title, "书名"],
    ["book.logline", project.book.logline, "一句话梗概"],
    ["book.centralConflict", project.book.centralConflict, "核心冲突"],
    ["positioning.primaryGenre", project.positioning.primaryGenre, "主题材"],
    ["positioning.targetPlatform", project.positioning.targetPlatform, "目标平台"],
    ["positioning.emotionalPromise", project.positioning.emotionalPromise, "目标情绪"],
    ["bookArc.emotionalArc", project.bookArc.emotionalArc, "全书情绪曲线"],
  ];
  for (const [path, value, label] of requiredText) {
    if (!value.trim()) {
      issues.push(issue("error", "opening.required", path, `开书结果缺少${label}。`));
    }
  }
  if (!project.book.protagonistId) {
    issues.push(issue("error", "opening.protagonist", "book.protagonistId", "开书结果必须指定主角。"));
  }
  if (project.volumes.length === 0) {
    issues.push(issue("error", "opening.volume", "volumes", "开书结果至少需要一卷卷纲。"));
  }
  if (project.bookArc.stages.length === 0) {
    issues.push(issue("error", "opening.stage", "bookArc.stages", "开书结果必须包含全书阶段划分。"));
  }
  const expectedPlanCount = Math.min(10, project.bookArc.totalChapters || 10);
  if (project.chapterPlans.length < expectedPlanCount) {
    issues.push(
      issue(
        "error",
        "opening.chapter_plans",
        "chapterPlans",
        `开书结果至少需要前 ${expectedPlanCount} 章细纲，当前只有 ${project.chapterPlans.length} 章。`,
      ),
    );
  }
  const sortedNumbers = project.chapterPlans.map((plan) => plan.number).sort((left, right) => left - right);
  for (let number = 1; number <= expectedPlanCount; number += 1) {
    if (!sortedNumbers.includes(number)) {
      issues.push(issue("error", "opening.chapter_gap", "chapterPlans", `开书细纲缺少第 ${number} 章。`));
    }
  }
};

const validateChapterWriteReadiness = (project: StoryProject, issues: StoryValidationIssue[]) => {
  const nextPlanId = project.progress.nextChapterPlanId;
  if (!nextPlanId) {
    const allPlannedChaptersWritten =
      project.chapterPlans.length > 0 &&
      project.chapterPlans.every(
        (plan) => plan.status === "written" && project.chapters.some((chapter) => chapter.planId === plan.id),
      );
    if (allPlannedChaptersWritten) {
      return;
    }
    issues.push(issue("error", "write.next_plan", "progress.nextChapterPlanId", "写作前必须指定下一章细纲。"));
    return;
  }
  const plan = project.chapterPlans.find((item) => item.id === nextPlanId);
  if (!plan) {
    return;
  }
  if (plan.targetWords <= 0 || !plan.coreEvent.trim() || plan.beats.length === 0) {
    issues.push(
      issue("error", "write.plan_incomplete", `chapterPlans.${plan.id}`, "下一章细纲缺少字数、核心事件或情节点。"),
    );
  }
};

export const validateStoryProject = (
  value: unknown,
  contract: CompiledStoryContract,
  profile: StoryValidationProfile = "draft",
): StoryValidationResult => {
  const parsed = storyProjectSchema.safeParse(value);
  if (!parsed.success) {
    const issues = parsed.error.issues.map(fromZodIssue);
    return { valid: false, issues };
  }

  const project = parsed.data;
  const issues: StoryValidationIssue[] = [];
  validateManifest(project, contract, issues);
  validateReferences(project, contract, issues);
  if (!project.book.title.trim()) {
    issues.push(issue("error", "book.title", "book.title", "故事标题不能为空。"));
  }
  if (profile === "openBook") {
    validateOpeningCompleteness(project, issues);
  }
  if (profile === "chapterWrite") {
    validateChapterWriteReadiness(project, issues);
  }
  if (!project.positioning.primaryGenre.trim()) {
    issues.push(issue("warning", "quality.genre_missing", "positioning.primaryGenre", "尚未填写主题材。"));
  }
  if (!project.style.tone.trim()) {
    issues.push(issue("warning", "quality.style_missing", "style.tone", "尚未建立本书文风。"));
  }

  return {
    valid: !issues.some((item) => item.severity === "error"),
    issues,
  };
};

export const assertValidStoryProject = (
  project: StoryProject,
  contract: CompiledStoryContract,
  profile: StoryValidationProfile = "draft",
) => {
  const validation = validateStoryProject(project, contract, profile);
  if (!validation.valid) {
    const message = validation.issues
      .filter((item) => item.severity === "error")
      .slice(0, 8)
      .map((item) => `${item.path || "story"}：${item.message}`)
      .join("\n");
    throw new Error(message || "故事结构校验失败。");
  }
  return project;
};
