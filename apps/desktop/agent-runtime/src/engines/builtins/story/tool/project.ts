import {
  STORY_PROJECT_SCHEMA_VERSION,
  type StoryManifestFile,
  type StoryProject,
  type StoryProjectFile,
} from "./schema.js";

export const STORY_PROJECT_ROOT = "story";
export const STORY_PROJECT_MANIFEST_PATH = `${STORY_PROJECT_ROOT}/manifest.json`;

export type StoryProjectFileEntry = {
  path: string;
  value: StoryProjectFile;
};

const canonicalId = (value: string, prefix: string, index = 0) => {
  const normalized = value
    .trim()
    .replace(/[^A-Za-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return normalized || `${prefix}-${index + 1}`;
};

const sortById = <T extends { id: string }>(items: T[]) =>
  [...items].sort((left, right) => left.id.localeCompare(right.id));

export const createEmptyStoryProject = ({
  id,
  title,
  timestamp = Date.now(),
}: {
  id: string;
  title: string;
  timestamp?: number;
}): StoryProject => {
  const storyId = canonicalId(id, "story");
  const normalizedTitle = title.trim() || "未命名故事";
  const relationshipsId = `${storyId}-relationships`;
  const bookArcId = `${storyId}-book-arc`;
  const foreshadowsId = `${storyId}-foreshadows`;
  const progressId = `${storyId}-progress`;
  const graphId = `${storyId}-graph`;

  const project: StoryProject = {
    manifest: {
      schemaVersion: STORY_PROJECT_SCHEMA_VERSION,
      kind: "story-manifest",
      storyId,
      title: normalizedTitle,
      revision: 0,
      createdAt: timestamp,
      updatedAt: timestamp,
      files: [],
    },
    book: {
      schemaVersion: STORY_PROJECT_SCHEMA_VERSION,
      kind: "story-book",
      id: storyId,
      title: normalizedTitle,
      premise: "",
      goal: "",
      logline: "",
      centralConflict: "",
      finalObstacle: "",
      playerName: "我",
      mode: "hybrid",
      createdAt: timestamp,
      updatedAt: timestamp,
    },
    positioning: {
      schemaVersion: STORY_PROJECT_SCHEMA_VERSION,
      kind: "story-positioning",
      id: `${storyId}-positioning`,
      lengthType: "long",
      primaryGenre: "",
      secondaryGenres: [],
      targetPlatform: "",
      targetAudience: "",
      targetWords: 0,
      emotionalPromise: "",
      surfaceHook: "",
      deepPayoff: "",
      longTermHook: "",
      differentiation: "",
      benchmarkTitles: [],
      updatedAt: timestamp,
    },
    style: {
      schemaVersion: STORY_PROJECT_SCHEMA_VERSION,
      kind: "story-style",
      id: `${storyId}-style`,
      tone: "",
      pointOfView: "",
      tense: "",
      sentenceRhythm: "",
      dialogueGuidance: "",
      punctuationGuidance: "",
      forbiddenPatterns: [],
      updatedAt: timestamp,
    },
    characters: [],
    relationships: {
      schemaVersion: STORY_PROJECT_SCHEMA_VERSION,
      kind: "story-relationships",
      id: relationshipsId,
      relationships: [],
      updatedAt: timestamp,
    },
    worldEntries: [],
    bookArc: {
      schemaVersion: STORY_PROJECT_SCHEMA_VERSION,
      kind: "story-book-arc",
      id: bookArcId,
      totalChapters: 0,
      targetWords: 0,
      emotionalArc: "",
      stages: [],
      volumeIds: [],
      keyTurningPoints: [],
      updatedAt: timestamp,
    },
    volumes: [],
    chapterPlans: [],
    chapters: [],
    characterStates: [],
    foreshadows: {
      schemaVersion: STORY_PROJECT_SCHEMA_VERSION,
      kind: "story-foreshadows",
      id: foreshadowsId,
      foreshadows: [],
      updatedAt: timestamp,
    },
    timelines: [],
    progress: {
      schemaVersion: STORY_PROJECT_SCHEMA_VERSION,
      kind: "story-progress",
      id: progressId,
      totalWrittenWords: 0,
      recentChapterIds: [],
      notes: [],
      updatedAt: timestamp,
    },
    scenes: [],
    graph: {
      schemaVersion: STORY_PROJECT_SCHEMA_VERSION,
      kind: "story-graph",
      id: graphId,
      nodes: [],
      edges: [],
      updatedAt: timestamp,
    },
    analyses: [],
    reviews: [],
    imports: [],
  };

  return withRebuiltManifest(project, { revision: 0, timestamp });
};

export const storyProjectFiles = (project: StoryProject): StoryProjectFileEntry[] => {
  const entries: StoryProjectFileEntry[] = [
    { path: `${STORY_PROJECT_ROOT}/book.json`, value: project.book },
    { path: `${STORY_PROJECT_ROOT}/positioning.json`, value: project.positioning },
    { path: `${STORY_PROJECT_ROOT}/style.json`, value: project.style },
    { path: `${STORY_PROJECT_ROOT}/relationships.json`, value: project.relationships },
    { path: `${STORY_PROJECT_ROOT}/outline/book-arc.json`, value: project.bookArc },
    { path: `${STORY_PROJECT_ROOT}/tracking/foreshadows.json`, value: project.foreshadows },
    { path: `${STORY_PROJECT_ROOT}/tracking/progress.json`, value: project.progress },
    { path: `${STORY_PROJECT_ROOT}/interactive/graph.json`, value: project.graph },
    ...sortById(project.characters).map((value) => ({
      path: `${STORY_PROJECT_ROOT}/characters/${value.id}.json`,
      value,
    })),
    ...sortById(project.worldEntries).map((value) => ({
      path: `${STORY_PROJECT_ROOT}/world/${value.id}.json`,
      value,
    })),
    ...project.volumes
      .slice()
      .sort((left, right) => left.number - right.number)
      .map((value) => ({ path: `${STORY_PROJECT_ROOT}/outline/volumes/${value.id}.json`, value })),
    ...project.chapterPlans
      .slice()
      .sort((left, right) => left.number - right.number)
      .map((value) => ({ path: `${STORY_PROJECT_ROOT}/outline/chapters/${value.id}.json`, value })),
    ...project.chapters
      .slice()
      .sort((left, right) => left.number - right.number)
      .map((value) => ({ path: `${STORY_PROJECT_ROOT}/chapters/${value.id}.json`, value })),
    ...sortById(project.characterStates).map((value) => ({
      path: `${STORY_PROJECT_ROOT}/tracking/character-states/${value.characterId}.json`,
      value,
    })),
    ...sortById(project.timelines).map((value) => ({
      path: `${STORY_PROJECT_ROOT}/tracking/timeline/${value.id}.json`,
      value,
    })),
    ...sortById(project.scenes).map((value) => ({
      path: `${STORY_PROJECT_ROOT}/interactive/scenes/${value.id}.json`,
      value,
    })),
    ...sortById(project.analyses).map((value) => ({
      path: `${STORY_PROJECT_ROOT}/analysis/${value.id}.json`,
      value,
    })),
    ...sortById(project.reviews).map((value) => ({
      path: `${STORY_PROJECT_ROOT}/reviews/${value.id}.json`,
      value,
    })),
    ...sortById(project.imports).map((value) => ({
      path: `${STORY_PROJECT_ROOT}/imports/${value.id}.json`,
      value,
    })),
  ];
  return entries;
};

export const withRebuiltManifest = (
  project: StoryProject,
  { revision = project.manifest.revision, timestamp = Date.now() }: { revision?: number; timestamp?: number } = {},
): StoryProject => {
  const projectWithoutManifest = {
    ...project,
    manifest: {
      ...project.manifest,
      revision,
      title: project.book.title,
      updatedAt: timestamp,
      files: [],
    },
  };
  const files = storyProjectFiles(projectWithoutManifest).map(({ path, value }) => ({
    kind: value.kind,
    id: value.kind === "story-manifest" ? value.storyId : value.id,
    path,
  }));
  const manifest: StoryManifestFile = {
    ...projectWithoutManifest.manifest,
    storyId: project.book.id,
    title: project.book.title,
    revision,
    updatedAt: timestamp,
    files,
  };
  return { ...projectWithoutManifest, manifest };
};
