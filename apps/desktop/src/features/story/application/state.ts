import {
  createEmptyStoryManuscriptInbox,
  submitStoryManuscriptDraft,
  type StoryManuscriptInbox,
  type StoryManuscriptSubmissionInput,
} from "./manuscript-inbox";
import {
  assertStoryImportDraftReady,
  type StoryImportDraft,
} from "./import-draft";
import {
  buildStoryContextPackage,
  type StoryContextPackage,
  type StoryContextCharacter,
  type StoryContextEdge,
  type StoryContextLorebookEntry,
  type StoryContextMemoryLayers,
  type StoryContextNode,
  type StoryContextScene,
  type StoryContextStage,
} from "./context-package";

export type StorySourceRef = {
  channel: string;
  id: string;
  label?: string;
};

export type StoryAsset = {
  id: string;
  workspaceId: string;
  title: string;
  outline: string;
  goal: string;
  userPersonaName: string;
  characters: StoryContextCharacter[];
  lorebookEntries: StoryContextLorebookEntry[];
  scenes: StoryContextScene[];
  graph: {
    entryNodeId: string;
    activeNodeId: string;
    stages: StoryContextStage[];
    nodes: StoryContextNode[];
    edges: StoryContextEdge[];
  };
  manuscriptInbox: StoryManuscriptInbox;
  sourceRefs: StorySourceRef[];
  createdAt: number;
  updatedAt: number;
};

export type StoryState = {
  version: 1;
  activeStoryId: string;
  stories: StoryAsset[];
};

const trimText = (value: unknown) => typeof value === "string" ? value.trim() : "";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === "object" && !Array.isArray(value));

export const createEmptyStoryState = (): StoryState => ({
  version: 1,
  activeStoryId: "",
  stories: [],
});

export const createStandaloneStoryAsset = ({
  workspaceId,
  title = "未命名故事",
  timestamp = Date.now(),
}: {
  workspaceId: string;
  title?: string;
  timestamp?: number;
}): StoryAsset => {
  const id = `story-${crypto.randomUUID()}`;
  const sceneId = `${id}-scene-main`;
  const stageId = `${id}-stage-main`;
  const nodeId = `${id}-node-main`;

  return {
    id,
    workspaceId,
    title: title.trim() || "未命名故事",
    outline: "",
    goal: "",
    userPersonaName: "我",
    characters: [],
    lorebookEntries: [],
    scenes: [{
      id: sceneId,
      title: "起始场景",
      scene: "",
      goal: "",
      plot: "",
      direction: "",
      transition: "",
      memory: "",
    }],
    graph: {
      entryNodeId: nodeId,
      activeNodeId: nodeId,
      stages: [{
        id: stageId,
        title: "起始阶段",
        order: 0,
      }],
      nodes: [{
        id: nodeId,
        stageId,
        sceneId,
        title: "起始节点",
        type: "normal",
        pathRole: "main",
        status: "draft",
      }],
      edges: [],
    },
    manuscriptInbox: createEmptyStoryManuscriptInbox(),
    sourceRefs: [],
    createdAt: timestamp,
    updatedAt: timestamp,
  };
};

export const createStoryAssetFromContextPackage = ({
  workspaceId,
  context,
  existing,
  sourceRef,
  timestamp = Date.now(),
}: {
  workspaceId: string;
  context: StoryContextPackage;
  existing?: StoryAsset;
  sourceRef?: StoryAsset["sourceRefs"][number];
  timestamp?: number;
}): StoryAsset => {
  const sourceRefs = sourceRef
    ? [
        ...(existing?.sourceRefs.filter((ref) =>
          !(ref.channel === sourceRef.channel && ref.id === sourceRef.id)
        ) ?? []),
        sourceRef,
      ]
    : existing?.sourceRefs ?? [];

  return {
    id: context.story.id,
    workspaceId,
    title: context.story.title,
    outline: context.story.outline,
    goal: context.story.goal,
    userPersonaName: context.story.userPersonaName ?? "我",
    characters: context.characters,
    lorebookEntries: context.world.lorebookEntries,
    scenes: context.scenes,
    graph: {
      entryNodeId: context.graph.entryNodeId,
      activeNodeId: context.graph.activeNodeId,
      stages: context.graph.stages,
      nodes: context.graph.nodes,
      edges: context.graph.edges,
    },
    manuscriptInbox: existing?.manuscriptInbox ?? createEmptyStoryManuscriptInbox(),
    sourceRefs,
    createdAt: existing?.createdAt ?? timestamp,
    updatedAt: timestamp,
  };
};

const createImportedStoryId = () => `story-${crypto.randomUUID()}`;

const createImportedStoryLocalId = (storyId: string, prefix: string, index: number) =>
  `${storyId}-${prefix}-${index + 1}`;

export const createStoryAssetFromImportDraft = ({
  workspaceId,
  draft,
  timestamp = Date.now(),
}: {
  workspaceId: string;
  draft: StoryImportDraft;
  timestamp?: number;
}): StoryAsset => {
  assertStoryImportDraftReady(draft);
  if (draft.mode !== "story") {
    throw new Error("世界书补丁不能创建为独立故事。");
  }

  const storyId = createImportedStoryId();
  const scenes = draft.scenes.length > 0
    ? draft.scenes.map((scene, index): StoryContextScene => ({
        id: scene.id || createImportedStoryLocalId(storyId, "scene", index),
        title: scene.title || `场景 ${index + 1}`,
        scene: scene.scene,
        goal: scene.goal,
        plot: scene.plot,
        direction: scene.direction,
        transition: scene.transition,
        memory: scene.memory,
      }))
    : [{
        id: createImportedStoryLocalId(storyId, "scene", 0),
        title: "起始场景",
        scene: draft.story.outline,
        goal: draft.story.goal,
        plot: "",
        direction: "",
        transition: "",
        memory: "",
      }];
  const stageId = createImportedStoryLocalId(storyId, "stage", 0);
  const nodeId = createImportedStoryLocalId(storyId, "node", 0);

  return {
    id: storyId,
    workspaceId,
    title: draft.story.title.trim() || "导入故事",
    outline: draft.story.outline,
    goal: draft.story.goal,
    userPersonaName: draft.story.userPersonaName.trim() || "我",
    characters: draft.characters.map((character, index): StoryContextCharacter => ({
      id: character.id || createImportedStoryLocalId(storyId, "character", index),
      name: character.name || `角色 ${index + 1}`,
      description: character.description,
      speakingStyle: character.speakingStyle,
      writingStyle: character.writingStyle,
      replyStylePrompt: character.replyStylePrompt,
      goals: character.goals,
      relationshipSummary: Array.isArray(character.relationships)
        ? JSON.stringify(character.relationships)
        : undefined,
      memory: character.memory
        ? {
            required: "",
            public: character.memory,
            known: "",
            privateSelf: "",
            directorSecret: "",
          }
        : undefined,
    })),
    lorebookEntries: [
      ...draft.lorebookEntries,
      ...draft.scenes.flatMap((scene) => scene.lorebookEntries),
    ].map((entry, index): StoryContextLorebookEntry => ({
      id: entry.id || createImportedStoryLocalId(storyId, "lore", index),
      title: entry.title || `世界书 ${index + 1}`,
      content: entry.content,
      keywords: entry.keywords,
      enabled: entry.enabled,
      alwaysOn: entry.alwaysOn,
    })),
    scenes,
    graph: {
      entryNodeId: nodeId,
      activeNodeId: nodeId,
      stages: [{
        id: stageId,
        title: "起始阶段",
        summary: draft.description,
        order: 0,
      }],
      nodes: [{
        id: nodeId,
        stageId,
        sceneId: scenes[0]?.id,
        title: "起始节点",
        type: "normal",
        pathRole: "main",
        status: "draft",
      }],
      edges: [],
    },
    manuscriptInbox: createEmptyStoryManuscriptInbox(),
    sourceRefs: [],
    createdAt: timestamp,
    updatedAt: timestamp,
  };
};

export const mergeStoryImportDraftIntoStory = (
  story: StoryAsset,
  draft: StoryImportDraft,
  {
    timestamp = Date.now(),
  }: {
    timestamp?: number;
  } = {},
): StoryAsset => {
  assertStoryImportDraftReady(draft);
  const importedLorebookEntries = [
    ...draft.lorebookEntries,
    ...draft.scenes.flatMap((scene) => scene.lorebookEntries),
  ].map((entry, index): StoryContextLorebookEntry => ({
    id: entry.id || createImportedStoryLocalId(story.id, "lore", story.lorebookEntries.length + index),
    title: entry.title || `世界书 ${story.lorebookEntries.length + index + 1}`,
    content: entry.content,
    keywords: entry.keywords,
    enabled: entry.enabled,
    alwaysOn: entry.alwaysOn,
  }));

  if (draft.mode === "lorebookPatch") {
    return {
      ...story,
      lorebookEntries: [
        ...story.lorebookEntries,
        ...importedLorebookEntries,
      ],
      updatedAt: timestamp,
    };
  }

  const importedCharacters = draft.characters.map((character, index): StoryContextCharacter => ({
    id: character.id || createImportedStoryLocalId(story.id, "character", story.characters.length + index),
    name: character.name || `角色 ${story.characters.length + index + 1}`,
    description: character.description,
    speakingStyle: character.speakingStyle,
    writingStyle: character.writingStyle,
    replyStylePrompt: character.replyStylePrompt,
    goals: character.goals,
    relationshipSummary: Array.isArray(character.relationships)
      ? JSON.stringify(character.relationships)
      : undefined,
    memory: character.memory
      ? {
          required: "",
          public: character.memory,
          known: "",
          privateSelf: "",
          directorSecret: "",
        }
      : undefined,
  }));
  const importedScenes = draft.scenes.map((scene, index): StoryContextScene => ({
    id: scene.id || createImportedStoryLocalId(story.id, "scene", story.scenes.length + index),
    title: scene.title || `场景 ${story.scenes.length + index + 1}`,
    scene: scene.scene,
    goal: scene.goal,
    plot: scene.plot,
    direction: scene.direction,
    transition: scene.transition,
    memory: scene.memory,
  }));

  return {
    ...story,
    title: draft.story.title.trim() || story.title,
    outline: draft.story.outline || story.outline,
    goal: draft.story.goal || story.goal,
    userPersonaName: draft.story.userPersonaName.trim() || story.userPersonaName,
    characters: [...story.characters, ...importedCharacters],
    lorebookEntries: [...story.lorebookEntries, ...importedLorebookEntries],
    scenes: [...story.scenes, ...importedScenes],
    updatedAt: timestamp,
  };
};

export const buildStoryContextPackageFromAsset = (
  story: StoryAsset,
  overrides: {
    activeNodeId?: string;
    activeScene?: StoryContextScene;
    characters?: StoryContextCharacter[];
    memory?: {
      manual?: string;
      sceneLayers?: Partial<StoryContextMemoryLayers>;
    };
    branch?: {
      pathNodeIds?: string[];
      pathEdgeIds?: string[];
    };
  } = {},
): StoryContextPackage => buildStoryContextPackage({
  story: {
    id: story.id,
    title: story.title,
    outline: story.outline,
    goal: story.goal,
    userPersonaName: story.userPersonaName,
  },
  graph: {
    entryNodeId: story.graph.entryNodeId,
    activeNodeId: overrides.activeNodeId ?? story.graph.activeNodeId,
    stages: story.graph.stages,
    nodes: story.graph.nodes,
    edges: story.graph.edges,
  },
  scenes: story.scenes,
  activeScene: overrides.activeScene,
  lorebookEntries: story.lorebookEntries,
  characters: overrides.characters ?? story.characters,
  memory: overrides.memory,
  branch: overrides.branch,
});

export const upsertStoryAsset = (
  state: StoryState,
  story: StoryAsset,
): StoryState => {
  const exists = state.stories.some((item) => item.id === story.id);
  const stories = exists
    ? state.stories.map((item) => item.id === story.id ? story : item)
    : [...state.stories, story];

  return {
    version: 1,
    activeStoryId: stories.some((item) => item.id === state.activeStoryId)
      ? state.activeStoryId
      : story.id,
    stories,
  };
};

export const submitStoryManuscriptToState = (
  state: StoryState,
  input: StoryManuscriptSubmissionInput,
  {
    timestamp = Date.now(),
  }: {
    timestamp?: number;
  } = {},
) => {
  const story = state.stories.find((item) => item.id === input.storyId);
  if (!story) {
    throw new Error("找不到要收稿的故事。");
  }
  if (!story.graph.nodes.some((node) => node.id === input.nodeId)) {
    throw new Error("找不到稿件绑定的故事节点。");
  }

  const { draft, inbox } = submitStoryManuscriptDraft(story.manuscriptInbox, {
    ...input,
    createdAt: input.createdAt ?? timestamp,
  });
  const nextStory: StoryAsset = {
    ...story,
    manuscriptInbox: inbox,
    updatedAt: timestamp,
  };

  return {
    draft,
    story: nextStory,
    state: upsertStoryAsset(state, nextStory),
  };
};

const normalizeStoryAsset = (
  value: unknown,
): StoryAsset | null => {
  if (!isRecord(value)) {
    return null;
  }

  const id = trimText(value.id);
  const workspaceId = trimText(value.workspaceId);
  const title = trimText(value.title);
  if (!id || !workspaceId || !title) {
    return null;
  }
  if (
    !Array.isArray(value.characters) ||
    !Array.isArray(value.lorebookEntries) ||
    !Array.isArray(value.scenes) ||
    !isRecord(value.graph) ||
    !Array.isArray(value.graph.stages) ||
    !Array.isArray(value.graph.nodes) ||
    !Array.isArray(value.graph.edges)
  ) {
    return null;
  }

  return {
    id,
    workspaceId,
    title,
    outline: trimText(value.outline),
    goal: trimText(value.goal),
    userPersonaName: trimText(value.userPersonaName) || "我",
    characters: value.characters as StoryContextCharacter[],
    lorebookEntries: value.lorebookEntries as StoryContextLorebookEntry[],
    scenes: value.scenes as StoryContextScene[],
    graph: {
      entryNodeId: trimText(value.graph.entryNodeId),
      activeNodeId: trimText(value.graph.activeNodeId),
      stages: value.graph.stages as StoryContextStage[],
      nodes: value.graph.nodes as StoryContextNode[],
      edges: value.graph.edges as StoryContextEdge[],
    },
    manuscriptInbox: isRecord(value.manuscriptInbox) && value.manuscriptInbox.version === 1
      ? value.manuscriptInbox as StoryManuscriptInbox
      : createEmptyStoryManuscriptInbox(),
    sourceRefs: Array.isArray(value.sourceRefs)
      ? value.sourceRefs.flatMap((ref) => {
          if (!isRecord(ref)) {
            return [];
          }
          const channel = trimText(ref.channel);
          const refId = trimText(ref.id);
          if (!channel || !refId) {
            return [];
          }
          const label = trimText(ref.label);
          return [{
            channel,
            id: refId,
            label: label || undefined,
          }];
        })
      : [],
    createdAt: typeof value.createdAt === "number" ? value.createdAt : Date.now(),
    updatedAt: typeof value.updatedAt === "number" ? value.updatedAt : Date.now(),
  };
};

export const normalizeStoryState = (
  workspaceId: string,
  value: unknown,
): StoryState | null => {
  if (!isRecord(value) || value.version !== 1 || !Array.isArray(value.stories)) {
    return null;
  }

  const stories = value.stories
    .flatMap((story) => {
      const normalized = normalizeStoryAsset(story);
      return normalized?.workspaceId === workspaceId ? [normalized] : [];
    });

  if (stories.length === 0) {
    return createEmptyStoryState();
  }

  const activeStoryId = stories.some((story) => story.id === value.activeStoryId)
    ? trimText(value.activeStoryId)
    : stories[0]?.id ?? "";

  return {
    version: 1,
    activeStoryId,
    stories,
  };
};
