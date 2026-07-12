import {
  STORY_PROJECT_SCHEMA_VERSION,
  type StoryManifestFile,
  type StoryProject,
  type StoryProjectFile,
} from "./schema.js";
import type { StoryProjectApi } from "../../protocol.js";

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
  contract,
  timestamp = Date.now(),
}: {
  id: string;
  title: string;
  contract: StoryProjectApi;
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

  return withRebuiltManifest(project, contract, { revision: 0, timestamp });
};

export const storyProjectFiles = (project: StoryProject, contract: StoryProjectApi): StoryProjectFileEntry[] => {
  const entries: StoryProjectFileEntry[] = [
    { path: contract.resolveDocument("story-book"), value: project.book },
    { path: contract.resolveDocument("story-positioning"), value: project.positioning },
    { path: contract.resolveDocument("story-style"), value: project.style },
    { path: contract.resolveDocument("story-relationships"), value: project.relationships },
    { path: contract.resolveDocument("story-book-arc"), value: project.bookArc },
    { path: contract.resolveDocument("story-foreshadows"), value: project.foreshadows },
    { path: contract.resolveDocument("story-progress"), value: project.progress },
    { path: contract.resolveDocument("story-graph"), value: project.graph },
    ...sortById(project.characters).map((value) => ({
      path: contract.resolveDocument("story-character", { id: value.id }),
      value,
    })),
    ...sortById(project.worldEntries).map((value) => ({
      path: contract.resolveDocument("story-world-entry", { id: value.id }),
      value,
    })),
    ...project.volumes
      .slice()
      .sort((left, right) => left.number - right.number)
      .map((value) => ({ path: contract.resolveDocument("story-volume", { id: value.id }), value })),
    ...project.chapterPlans
      .slice()
      .sort((left, right) => left.number - right.number)
      .map((value) => ({ path: contract.resolveDocument("story-chapter-plan", { id: value.id }), value })),
    ...project.chapters
      .slice()
      .sort((left, right) => left.number - right.number)
      .map((value) => ({ path: contract.resolveDocument("story-chapter", { id: value.id }), value })),
    ...sortById(project.characterStates).map((value) => ({
      path: contract.resolveDocument("story-character-state", { characterId: value.characterId }),
      value,
    })),
    ...sortById(project.timelines).map((value) => ({
      path: contract.resolveDocument("story-timeline", { id: value.id }),
      value,
    })),
    ...sortById(project.scenes).map((value) => ({
      path: contract.resolveDocument("story-scene", { id: value.id }),
      value,
    })),
    ...sortById(project.analyses).map((value) => ({
      path: contract.resolveDocument("story-analysis", { id: value.id }),
      value,
    })),
    ...sortById(project.reviews).map((value) => ({
      path: contract.resolveDocument("story-review", { id: value.id }),
      value,
    })),
    ...sortById(project.imports).map((value) => ({
      path: contract.resolveDocument("story-import", { id: value.id }),
      value,
    })),
  ];
  return entries;
};

export const withRebuiltManifest = (
  project: StoryProject,
  contract: StoryProjectApi,
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
  const files = storyProjectFiles(projectWithoutManifest, contract).map(({ path, value }) => ({
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
