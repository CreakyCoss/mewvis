import { z } from "zod";

/** The one and only persisted JSON structure owned by the story toolkit. */

export const STORY_PROJECT_SCHEMA_VERSION = 1 as const;

const storyIdSchema = z
  .string()
  .trim()
  .min(1)
  .regex(/^[A-Za-z0-9][A-Za-z0-9_-]*$/, "ID 只能包含字母、数字、下划线和连字符。");
const textSchema = z.string();
const optionalTextSchema = z.string().optional();
const timestampSchema = z.number().int().nonnegative();
const entityRefsSchema = z.array(storyIdSchema).default([]);
const baseFileShape = {
  schemaVersion: z.literal(STORY_PROJECT_SCHEMA_VERSION),
  id: storyIdSchema,
  updatedAt: timestampSchema,
};

export const storyManifestFileSchema = z
  .object({
    schemaVersion: z.literal(STORY_PROJECT_SCHEMA_VERSION),
    kind: z.literal("story-manifest"),
    storyId: storyIdSchema,
    title: textSchema,
    revision: z.number().int().nonnegative(),
    createdAt: timestampSchema,
    updatedAt: timestampSchema,
    files: z.array(
      z
        .object({
          kind: textSchema.trim().min(1),
          id: storyIdSchema,
          path: z.string().trim().min(1),
        })
        .strict(),
    ),
  })
  .strict();

export const storyBookFileSchema = z
  .object({
    ...baseFileShape,
    kind: z.literal("story-book"),
    title: textSchema,
    premise: textSchema,
    goal: textSchema,
    logline: textSchema,
    centralConflict: textSchema,
    finalObstacle: textSchema,
    protagonistId: optionalTextSchema,
    playerName: textSchema,
    mode: z.enum(["serial", "interactive", "hybrid"]),
    createdAt: timestampSchema,
  })
  .strict();

export const storyPositioningFileSchema = z
  .object({
    ...baseFileShape,
    kind: z.literal("story-positioning"),
    lengthType: z.enum(["long", "short"]),
    primaryGenre: textSchema,
    secondaryGenres: z.array(textSchema),
    targetPlatform: textSchema,
    targetAudience: textSchema,
    targetWords: z.number().int().nonnegative(),
    emotionalPromise: textSchema,
    surfaceHook: textSchema,
    deepPayoff: textSchema,
    longTermHook: textSchema,
    differentiation: textSchema,
    benchmarkTitles: z.array(textSchema),
  })
  .strict();

export const storyStyleFileSchema = z
  .object({
    ...baseFileShape,
    kind: z.literal("story-style"),
    tone: textSchema,
    pointOfView: textSchema,
    tense: textSchema,
    sentenceRhythm: textSchema,
    dialogueGuidance: textSchema,
    punctuationGuidance: textSchema,
    forbiddenPatterns: z.array(textSchema),
  })
  .strict();

export const storyCharacterMemorySchema = z
  .object({
    required: textSchema,
    public: textSchema,
    known: textSchema,
    privateSelf: textSchema,
    directorSecret: textSchema,
  })
  .strict();

export const storyCharacterFileSchema = z
  .object({
    ...baseFileShape,
    kind: z.literal("story-character"),
    name: textSchema,
    role: z.enum(["protagonist", "deuteragonist", "antagonist", "supporting", "minor"]),
    avatar: textSchema,
    age: textSchema,
    description: textSchema,
    traits: z.array(textSchema),
    speakingStyle: textSchema,
    writingStyle: textSchema,
    replyStylePrompt: textSchema,
    goals: textSchema,
    motivation: textSchema,
    flaw: textSchema,
    coreAbility: textSchema,
    relationshipSummary: textSchema,
    publicRelationshipSummary: textSchema,
    arcSummary: textSchema,
    memory: storyCharacterMemorySchema,
  })
  .strict();

export const storyRelationshipSchema = z
  .object({
    id: storyIdSchema,
    fromCharacterId: storyIdSchema,
    toCharacterId: storyIdSchema,
    type: textSchema,
    emotionalDirection: textSchema,
    currentState: textSchema,
    conflict: textSchema,
    startedAtChapterId: optionalTextSchema,
    evolution: z.array(
      z
        .object({
          chapterId: storyIdSchema,
          summary: textSchema,
        })
        .strict(),
    ),
  })
  .strict();

export const storyRelationshipsFileSchema = z
  .object({
    ...baseFileShape,
    kind: z.literal("story-relationships"),
    relationships: z.array(storyRelationshipSchema),
  })
  .strict();

export const storyWorldEntryFileSchema = z
  .object({
    ...baseFileShape,
    kind: z.literal("story-world-entry"),
    category: z.enum(["background", "power-system", "geography", "society", "faction", "object", "rule", "other"]),
    title: textSchema,
    summary: textSchema,
    content: textSchema,
    rules: z.array(textSchema),
    constraints: z.array(textSchema),
    keywords: z.array(textSchema),
    relatedEntityIds: entityRefsSchema,
    enabled: z.boolean(),
    alwaysOn: z.boolean(),
  })
  .strict();

export const storyArcStageSchema = z
  .object({
    id: storyIdSchema,
    name: textSchema,
    phase: z.enum(["opening", "development", "climax", "ending", "custom"]),
    startChapter: z.number().int().positive(),
    endChapter: z.number().int().positive(),
    purpose: textSchema,
    emotionalTone: textSchema,
    expectedReaderState: textSchema,
    allowedReveals: z.array(textSchema),
    prohibitedReveals: z.array(textSchema),
  })
  .strict();

export const storyBookArcFileSchema = z
  .object({
    ...baseFileShape,
    kind: z.literal("story-book-arc"),
    totalChapters: z.number().int().nonnegative(),
    targetWords: z.number().int().nonnegative(),
    emotionalArc: textSchema,
    stages: z.array(storyArcStageSchema),
    volumeIds: entityRefsSchema,
    keyTurningPoints: z.array(
      z
        .object({
          chapterId: storyIdSchema,
          function: textSchema,
          emotionalEffect: textSchema,
        })
        .strict(),
    ),
  })
  .strict();

export const storyVolumeFileSchema = z
  .object({
    ...baseFileShape,
    kind: z.literal("story-volume"),
    number: z.number().int().positive(),
    title: textSchema,
    startChapter: z.number().int().positive(),
    endChapter: z.number().int().positive(),
    targetWords: z.number().int().nonnegative(),
    phase: z.enum(["opening", "development", "climax", "ending", "mixed", "custom"]),
    purpose: textSchema,
    coreConflict: textSchema,
    coreEvent: textSchema,
    startState: textSchema,
    endState: textSchema,
    emotionalArc: textSchema,
    allowedReveals: z.array(textSchema),
    prohibitedReveals: z.array(textSchema),
    chapterIds: entityRefsSchema,
  })
  .strict();

export const storyChapterBeatSchema = z
  .object({
    id: storyIdSchema,
    summary: textSchema,
    function: z.enum([
      "setup",
      "progress",
      "information-reveal",
      "characterization",
      "relationship-change",
      "foreshadow",
      "payoff",
      "reversal",
      "climax",
      "transition",
      "other",
    ]),
    density: z.enum(["dense", "medium", "sparse"]),
    wordBudget: z.number().int().nonnegative(),
    participantIds: entityRefsSchema,
    worldRefIds: entityRefsSchema,
  })
  .strict();

export const storyChapterPlanFileSchema = z
  .object({
    ...baseFileShape,
    kind: z.literal("story-chapter-plan"),
    number: z.number().int().positive(),
    volumeId: storyIdSchema,
    title: textSchema,
    phase: z.enum(["opening", "development", "climax", "ending", "custom"]),
    phasePosition: textSchema,
    chapterRole: z.enum([
      "high-pressure",
      "progress",
      "training",
      "relationship",
      "low-pressure",
      "information",
      "transition",
      "custom",
    ]),
    targetWords: z.number().int().nonnegative(),
    targetEmotion: textSchema,
    coreEvent: textSchema,
    structureFormula: textSchema,
    openingHook: textSchema,
    payoff: textSchema,
    releaseGuards: z.array(textSchema),
    summary: z
      .object({
        cause: textSchema,
        development: textSchema,
        turn: textSchema,
        climax: textSchema,
        ending: textSchema,
      })
      .strict(),
    plotLines: z
      .object({
        main: textSchema,
        secondary: textSchema,
        event: textSchema,
        relationship: textSchema,
        logic: textSchema,
      })
      .strict(),
    participantIds: entityRefsSchema,
    appearanceOrder: entityRefsSchema,
    worldRefIds: entityRefsSchema,
    pointOfView: textSchema,
    informationGap: textSchema,
    relationshipChanges: z.array(textSchema),
    beats: z.array(storyChapterBeatSchema),
    costAndPayoff: textSchema,
    ending: z
      .object({
        resolvedState: textSchema,
        unresolvedQuestion: textSchema,
        nextDrive: textSchema,
        hookType: textSchema,
        hookStrength: z.enum(["strong", "medium", "weak", "none"]),
      })
      .strict(),
    status: z.enum(["draft", "locked", "ready", "written"]),
  })
  .strict();

export const storyChapterFileSchema = z
  .object({
    ...baseFileShape,
    kind: z.literal("story-chapter"),
    planId: storyIdSchema,
    number: z.number().int().positive(),
    title: textSchema,
    status: z.enum(["draft", "review", "accepted", "published"]),
    content: textSchema,
    summary: textSchema,
    wordCount: z.number().int().nonnegative(),
    participantIds: entityRefsSchema,
    worldRefIds: entityRefsSchema,
    stateChanges: z
      .object({
        characterIds: entityRefsSchema,
        relationshipIds: entityRefsSchema,
        foreshadowIds: entityRefsSchema,
        timelineEntryIds: entityRefsSchema,
      })
      .strict(),
  })
  .strict();

export const storyCharacterStateFileSchema = z
  .object({
    ...baseFileShape,
    kind: z.literal("story-character-state"),
    characterId: storyIdSchema,
    asOfChapterId: optionalTextSchema,
    identity: textSchema,
    location: textSchema,
    physicalState: textSchema,
    abilities: z.array(textSchema),
    relationshipStates: z.array(textSchema),
    knowledge: z.array(textSchema),
    publicImage: textSchema,
    openThreads: z.array(textSchema),
    recentChanges: z.array(
      z
        .object({
          chapterId: storyIdSchema,
          summary: textSchema,
        })
        .strict(),
    ),
  })
  .strict();

export const storyForeshadowSchema = z
  .object({
    id: storyIdSchema,
    content: textSchema,
    status: z.enum(["planned", "planted", "advanced", "resolved", "expired", "abandoned"]),
    importance: z.enum(["high", "medium", "low"]),
    plannedPlantChapterId: optionalTextSchema,
    plantedChapterId: optionalTextSchema,
    expectedResolveChapterId: optionalTextSchema,
    resolvedChapterId: optionalTextSchema,
    relatedEntityIds: entityRefsSchema,
    resolution: textSchema,
  })
  .strict();

export const storyForeshadowsFileSchema = z
  .object({
    ...baseFileShape,
    kind: z.literal("story-foreshadows"),
    foreshadows: z.array(storyForeshadowSchema),
  })
  .strict();

export const storyTimelineEntrySchema = z
  .object({
    id: storyIdSchema,
    chapterId: storyIdSchema,
    storyTime: textSchema,
    event: textSchema,
    participantIds: entityRefsSchema,
    worldRefIds: entityRefsSchema,
    plotLine: textSchema,
  })
  .strict();

export const storyTimelineFileSchema = z
  .object({
    ...baseFileShape,
    kind: z.literal("story-timeline"),
    calendar: textSchema,
    openingTime: textSchema,
    currentTime: textSchema,
    entries: z.array(storyTimelineEntrySchema),
  })
  .strict();

export const storyProgressFileSchema = z
  .object({
    ...baseFileShape,
    kind: z.literal("story-progress"),
    lastCompletedChapterId: optionalTextSchema,
    totalWrittenWords: z.number().int().nonnegative(),
    currentVolumeId: optionalTextSchema,
    nextChapterPlanId: optionalTextSchema,
    recentChapterIds: entityRefsSchema,
    notes: z.array(textSchema),
  })
  .strict();

export const storySceneStatusSchema = z
  .object({
    location: optionalTextSchema,
    timeLabel: optionalTextSchema,
    weather: optionalTextSchema,
    atmosphere: optionalTextSchema,
    scenePhase: optionalTextSchema,
    immediateThreat: optionalTextSchema,
  })
  .strict();

export const storySceneFileSchema = z
  .object({
    ...baseFileShape,
    kind: z.literal("story-scene"),
    title: textSchema,
    scene: textSchema,
    goal: textSchema,
    plot: textSchema,
    direction: textSchema,
    transition: textSchema,
    memory: textSchema,
    status: storySceneStatusSchema.optional(),
  })
  .strict();

export const storyGraphNodeSchema = z
  .object({
    id: storyIdSchema,
    sceneId: optionalTextSchema,
    title: textSchema,
    type: textSchema,
    pathRole: textSchema,
    status: optionalTextSchema,
  })
  .strict();

export const storyGraphEdgeSchema = z
  .object({
    id: storyIdSchema,
    fromNodeId: storyIdSchema,
    toNodeId: storyIdSchema,
    label: textSchema,
    reason: optionalTextSchema,
    isDefault: z.boolean().optional(),
    priority: z.number().int(),
  })
  .strict();

export const storyGraphFileSchema = z
  .object({
    ...baseFileShape,
    kind: z.literal("story-graph"),
    nodes: z.array(storyGraphNodeSchema),
    edges: z.array(storyGraphEdgeSchema),
  })
  .strict();

export const storyAnalysisFileSchema = z
  .object({
    ...baseFileShape,
    kind: z.literal("story-analysis"),
    analysisType: z.enum(["long", "short"]),
    target: z.enum(["current-story", "benchmark", "import-source"]),
    status: z.enum(["draft", "partial", "complete"]),
    source: z
      .object({
        title: textSchema,
        platform: textSchema,
        path: optionalTextSchema,
        wordCount: z.number().int().nonnegative(),
        chapterCount: z.number().int().nonnegative(),
      })
      .strict(),
    summary: textSchema,
    storyCore: textSchema,
    structureStages: z.array(
      z
        .object({
          name: textSchema,
          range: textSchema,
          function: textSchema,
          emotion: textSchema,
          evidence: z.array(textSchema),
        })
        .strict(),
    ),
    turningPoints: z.array(textSchema),
    emotionalArc: z.array(
      z
        .object({
          label: textSchema,
          intensity: z.number().min(0).max(10),
          chapterRef: optionalTextSchema,
          cause: textSchema,
        })
        .strict(),
    ),
    plotModules: z.array(
      z
        .object({
          id: storyIdSchema,
          name: textSchema,
          function: textSchema,
          setup: textSchema,
          payoff: textSchema,
          reusablePattern: textSchema,
          evidence: z.array(textSchema),
        })
        .strict(),
    ),
    styleProfile: z
      .object({
        pointOfView: textSchema,
        tone: textSchema,
        sentenceRhythm: textSchema,
        dialogue: textSchema,
        proseRules: z.array(textSchema),
        anchorExcerpts: z.array(textSchema),
      })
      .strict(),
    characterInsights: z.array(
      z
        .object({
          name: textSchema,
          role: textSchema,
          function: textSchema,
          arc: textSchema,
          evidence: z.array(textSchema),
        })
        .strict(),
    ),
    worldInsights: z.array(textSchema),
    reusableTechniques: z.array(textSchema),
    gaps: z.array(textSchema),
    createdAt: timestampSchema,
  })
  .strict();

export const storyReviewFindingSchema = z
  .object({
    id: storyIdSchema,
    severity: z.enum(["S1", "S2", "S3", "S4"]),
    category: z.enum([
      "structure",
      "character",
      "prose",
      "consistency",
      "platform",
      "factual",
      "format",
      "causal",
      "rule-boundary",
    ]),
    scopePath: textSchema,
    evidence: textSchema,
    issue: textSchema,
    fix: textSchema,
    status: z.enum(["open", "accepted", "resolved", "dismissed"]),
  })
  .strict();

export const storyReviewFileSchema = z
  .object({
    ...baseFileShape,
    kind: z.literal("story-review"),
    reviewType: z.enum(["review", "deslop"]),
    mode: z.enum(["full", "lean", "solo", "detect", "rewrite"]),
    rubric: textSchema,
    scopePaths: z.array(textSchema),
    summary: textSchema,
    verdict: z.enum(["approve", "concerns", "reject", "not-applicable"]),
    findings: z.array(storyReviewFindingSchema),
    createdAt: timestampSchema,
  })
  .strict();

export const storyImportFileSchema = z
  .object({
    ...baseFileShape,
    kind: z.literal("story-import"),
    sourceTitle: textSchema,
    sourcePath: optionalTextSchema,
    lengthType: z.enum(["long", "short"]),
    status: z.enum(["detected", "analyzing", "ready", "committed", "partial", "failed"]),
    wordCount: z.number().int().nonnegative(),
    chapterCount: z.number().int().nonnegative(),
    lastCompleteChapterNumber: z.number().int().nonnegative(),
    analysisId: optionalTextSchema,
    generatedFileIds: entityRefsSchema,
    warnings: z.array(textSchema),
    createdAt: timestampSchema,
  })
  .strict();

export const storyProjectSchema = z
  .object({
    manifest: storyManifestFileSchema,
    book: storyBookFileSchema,
    positioning: storyPositioningFileSchema,
    style: storyStyleFileSchema,
    characters: z.array(storyCharacterFileSchema),
    relationships: storyRelationshipsFileSchema,
    worldEntries: z.array(storyWorldEntryFileSchema),
    bookArc: storyBookArcFileSchema,
    volumes: z.array(storyVolumeFileSchema),
    chapterPlans: z.array(storyChapterPlanFileSchema),
    chapters: z.array(storyChapterFileSchema),
    characterStates: z.array(storyCharacterStateFileSchema),
    foreshadows: storyForeshadowsFileSchema,
    timelines: z.array(storyTimelineFileSchema),
    progress: storyProgressFileSchema,
    scenes: z.array(storySceneFileSchema),
    graph: storyGraphFileSchema,
    analyses: z.array(storyAnalysisFileSchema),
    reviews: z.array(storyReviewFileSchema),
    imports: z.array(storyImportFileSchema),
  })
  .strict();

export type StoryManifestFile = z.infer<typeof storyManifestFileSchema>;
export type StoryBookFile = z.infer<typeof storyBookFileSchema>;
export type StoryPositioningFile = z.infer<typeof storyPositioningFileSchema>;
export type StoryStyleFile = z.infer<typeof storyStyleFileSchema>;
export type StoryCharacterFile = z.infer<typeof storyCharacterFileSchema>;
export type StoryRelationshipsFile = z.infer<typeof storyRelationshipsFileSchema>;
export type StoryWorldEntryFile = z.infer<typeof storyWorldEntryFileSchema>;
export type StoryBookArcFile = z.infer<typeof storyBookArcFileSchema>;
export type StoryVolumeFile = z.infer<typeof storyVolumeFileSchema>;
export type StoryChapterPlanFile = z.infer<typeof storyChapterPlanFileSchema>;
export type StoryChapterFile = z.infer<typeof storyChapterFileSchema>;
export type StoryCharacterStateFile = z.infer<typeof storyCharacterStateFileSchema>;
export type StoryForeshadowsFile = z.infer<typeof storyForeshadowsFileSchema>;
export type StoryTimelineFile = z.infer<typeof storyTimelineFileSchema>;
export type StoryProgressFile = z.infer<typeof storyProgressFileSchema>;
export type StorySceneFile = z.infer<typeof storySceneFileSchema>;
export type StoryGraphFile = z.infer<typeof storyGraphFileSchema>;
export type StoryAnalysisFile = z.infer<typeof storyAnalysisFileSchema>;
export type StoryReviewFile = z.infer<typeof storyReviewFileSchema>;
export type StoryImportFile = z.infer<typeof storyImportFileSchema>;
export type StoryProject = z.infer<typeof storyProjectSchema>;

export type StoryProjectFile =
  | StoryManifestFile
  | StoryBookFile
  | StoryPositioningFile
  | StoryStyleFile
  | StoryCharacterFile
  | StoryRelationshipsFile
  | StoryWorldEntryFile
  | StoryBookArcFile
  | StoryVolumeFile
  | StoryChapterPlanFile
  | StoryChapterFile
  | StoryCharacterStateFile
  | StoryForeshadowsFile
  | StoryTimelineFile
  | StoryProgressFile
  | StorySceneFile
  | StoryGraphFile
  | StoryAnalysisFile
  | StoryReviewFile
  | StoryImportFile;

export const storyProjectFileSchemasByKind = {
  "story-manifest": storyManifestFileSchema,
  "story-book": storyBookFileSchema,
  "story-positioning": storyPositioningFileSchema,
  "story-style": storyStyleFileSchema,
  "story-character": storyCharacterFileSchema,
  "story-relationships": storyRelationshipsFileSchema,
  "story-world-entry": storyWorldEntryFileSchema,
  "story-book-arc": storyBookArcFileSchema,
  "story-volume": storyVolumeFileSchema,
  "story-chapter-plan": storyChapterPlanFileSchema,
  "story-chapter": storyChapterFileSchema,
  "story-character-state": storyCharacterStateFileSchema,
  "story-foreshadows": storyForeshadowsFileSchema,
  "story-timeline": storyTimelineFileSchema,
  "story-progress": storyProgressFileSchema,
  "story-scene": storySceneFileSchema,
  "story-graph": storyGraphFileSchema,
  "story-analysis": storyAnalysisFileSchema,
  "story-review": storyReviewFileSchema,
  "story-import": storyImportFileSchema,
} as const;
