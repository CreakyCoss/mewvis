import type { StoryJson } from "../story/model/types.js";
import { createEmptyStoryProject, withRebuiltManifest } from "@agent-runtime/engines/builtins/story/tool/project";
import {
  STORY_PROJECT_SCHEMA_VERSION,
  type StoryCharacterFile,
  type StoryGraphFile,
  type StoryProject,
  type StorySceneFile,
  type StoryWorldEntryFile,
} from "@agent-runtime/engines/builtins/story/tool/schema";

const emptyMemory = () => ({
  required: "",
  public: "",
  known: "",
  privateSelf: "",
  directorSecret: "",
});

const canonicalId = (value: string, prefix: string, index = 0) => {
  const normalized = value
    .trim()
    .replace(/[^A-Za-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return normalized || `${prefix}-${index + 1}`;
};

const uniqueId = (value: string, prefix: string, index: number, used: Set<string>) => {
  const base = canonicalId(value, prefix, index);
  let candidate = base;
  let suffix = 2;
  while (used.has(candidate)) {
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }
  used.add(candidate);
  return candidate;
};

const sortById = <T extends { id: string }>(items: T[]) =>
  [...items].sort((left, right) => left.id.localeCompare(right.id));

export const storyJsonToProject = (story: StoryJson, existingProject?: StoryProject | null): StoryProject => {
  const timestamp = story.updatedAt || Date.now();
  const base =
    existingProject ?? createEmptyStoryProject({ id: story.id, title: story.title, timestamp: story.createdAt });
  const usedCharacterIds = new Set<string>();
  const characterIdMap = new Map<string, string>();
  const existingCharactersById = new Map(base.characters.map((character) => [character.id, character]));
  const characters: StoryCharacterFile[] = story.characters.map((character, index) => {
    const id = uniqueId(character.id, "character", index, usedCharacterIds);
    characterIdMap.set(character.id, id);
    const existing = existingCharactersById.get(id);
    return {
      schemaVersion: STORY_PROJECT_SCHEMA_VERSION,
      kind: "story-character",
      id,
      name: character.name,
      role: existing?.role ?? (index === 0 ? "protagonist" : "supporting"),
      avatar: character.avatar || "blank-avatar",
      age: existing?.age ?? "",
      description: character.description,
      traits: existing?.traits ?? [],
      speakingStyle: character.speakingStyle,
      writingStyle: character.writingStyle ?? "",
      replyStylePrompt: character.replyStylePrompt ?? "",
      goals: character.goals ?? "",
      motivation: existing?.motivation ?? "",
      flaw: existing?.flaw ?? "",
      coreAbility: existing?.coreAbility ?? "",
      relationshipSummary: character.relationshipSummary ?? "",
      publicRelationshipSummary: character.publicRelationshipSummary ?? "",
      arcSummary: existing?.arcSummary ?? "",
      memory: { ...emptyMemory(), ...character.memory },
      updatedAt: timestamp,
    };
  });

  const usedWorldIds = new Set<string>();
  const worldEntries: StoryWorldEntryFile[] = story.lorebookEntries.map((entry, index) => ({
    schemaVersion: STORY_PROJECT_SCHEMA_VERSION,
    kind: "story-world-entry",
    id: uniqueId(entry.id, "world", index, usedWorldIds),
    category: "other",
    title: entry.title,
    summary: entry.content.slice(0, 240),
    content: entry.content,
    rules: [],
    constraints: [],
    keywords: entry.keywords,
    relatedEntityIds: [],
    enabled: entry.enabled,
    alwaysOn: entry.alwaysOn,
    updatedAt: timestamp,
  }));

  const usedSceneIds = new Set<string>();
  const sceneIdMap = new Map<string, string>();
  const scenes: StorySceneFile[] = story.scenes.map((scene, index) => {
    const id = uniqueId(scene.id, "scene", index, usedSceneIds);
    sceneIdMap.set(scene.id, id);
    return {
      schemaVersion: STORY_PROJECT_SCHEMA_VERSION,
      kind: "story-scene",
      id,
      title: scene.title,
      scene: scene.scene,
      goal: scene.goal,
      plot: scene.plot,
      direction: scene.direction,
      transition: scene.transition,
      memory: scene.memory,
      ...(scene.status ? { status: scene.status } : {}),
      updatedAt: timestamp,
    };
  });

  const usedNodeIds = new Set<string>();
  const nodeIdMap = new Map<string, string>();
  const graphNodes = story.graph.nodes.map((node, index) => {
    const id = uniqueId(node.id, "node", index, usedNodeIds);
    nodeIdMap.set(node.id, id);
    return {
      id,
      ...(node.sceneId ? { sceneId: sceneIdMap.get(node.sceneId) ?? canonicalId(node.sceneId, "scene") } : {}),
      title: node.title,
      type: node.type,
      pathRole: node.pathRole,
      ...(node.status ? { status: node.status } : {}),
    };
  });
  const graph: StoryGraphFile = {
    ...base.graph,
    nodes: graphNodes,
    edges: story.graph.edges.map((edge, index) => ({
      id: canonicalId(edge.id, "edge", index),
      fromNodeId: nodeIdMap.get(edge.fromNodeId) ?? canonicalId(edge.fromNodeId, "node"),
      toNodeId: nodeIdMap.get(edge.toNodeId) ?? canonicalId(edge.toNodeId, "node"),
      label: edge.label,
      ...(edge.reason ? { reason: edge.reason } : {}),
      ...(edge.isDefault !== undefined ? { isDefault: edge.isDefault } : {}),
      priority: edge.priority,
    })),
    updatedAt: timestamp,
  };

  const protagonistId =
    base.book.protagonistId && characters.some((character) => character.id === base.book.protagonistId)
      ? base.book.protagonistId
      : characters.find((character) => character.role === "protagonist")?.id;
  const next: StoryProject = {
    ...base,
    book: {
      ...base.book,
      id: canonicalId(story.id, "story"),
      title: story.title,
      premise: story.premise,
      goal: story.goal,
      playerName: story.playerName,
      ...(protagonistId ? { protagonistId } : { protagonistId: undefined }),
      createdAt: story.createdAt,
      updatedAt: timestamp,
    },
    characters,
    worldEntries,
    scenes,
    graph,
    relationships: {
      ...base.relationships,
      relationships: base.relationships.relationships.filter(
        (relationship) =>
          characters.some((character) => character.id === relationship.fromCharacterId) &&
          characters.some((character) => character.id === relationship.toCharacterId),
      ),
      updatedAt: timestamp,
    },
  };

  return withRebuiltManifest(next, {
    revision: existingProject ? existingProject.manifest.revision + 1 : 1,
    timestamp,
  });
};

export const storyProjectToStoryJson = (project: StoryProject): StoryJson => ({
  id: project.book.id,
  title: project.book.title,
  premise: project.book.premise,
  goal: project.book.goal,
  playerName: project.book.playerName,
  characters: sortById(project.characters).map((character) => ({
    id: character.id,
    name: character.name,
    avatar: character.avatar,
    description: character.description,
    speakingStyle: character.speakingStyle,
    writingStyle: character.writingStyle || undefined,
    replyStylePrompt: character.replyStylePrompt || undefined,
    goals: character.goals || undefined,
    relationshipSummary: character.relationshipSummary || undefined,
    publicRelationshipSummary: character.publicRelationshipSummary || undefined,
    memory: character.memory,
  })),
  lorebookEntries: sortById(project.worldEntries).map((entry) => ({
    id: entry.id,
    title: entry.title,
    content: entry.content,
    keywords: entry.keywords,
    enabled: entry.enabled,
    alwaysOn: entry.alwaysOn,
  })),
  scenes: sortById(project.scenes).map((scene) => ({
    id: scene.id,
    title: scene.title,
    scene: scene.scene,
    goal: scene.goal,
    plot: scene.plot,
    direction: scene.direction,
    transition: scene.transition,
    memory: scene.memory,
    ...(scene.status ? { status: scene.status } : {}),
  })),
  graph: {
    nodes: project.graph.nodes,
    edges: project.graph.edges,
  },
  createdAt: project.book.createdAt,
  updatedAt: project.manifest.updatedAt,
});
