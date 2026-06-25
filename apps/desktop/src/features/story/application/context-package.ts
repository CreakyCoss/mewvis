export type StoryContextLorebookEntry = {
  id: string;
  title: string;
  content: string;
  keywords: string[];
  enabled: boolean;
  alwaysOn: boolean;
};

export type StoryContextSceneStatus = {
  location?: string;
  timeLabel?: string;
  weather?: string;
  atmosphere?: string;
  scenePhase?: string;
  immediateThreat?: string;
};

export type StoryContextScene = {
  id: string;
  title: string;
  scene: string;
  goal: string;
  plot: string;
  direction: string;
  transition: string;
  memory: string;
  status?: StoryContextSceneStatus;
};

export type StoryContextMemoryLayers = {
  required: string;
  upstream: string;
  public: string;
  private: string;
  directorSecret: string;
};

export type StoryContextCharacterMemory = {
  required: string;
  public: string;
  known: string;
  privateSelf: string;
  directorSecret: string;
};

export type StoryContextCharacter = {
  id: string;
  name: string;
  description: string;
  speakingStyle: string;
  writingStyle?: string;
  replyStylePrompt?: string;
  goals?: string;
  relationshipSummary?: string;
  publicRelationshipSummary?: string;
  memory?: StoryContextCharacterMemory;
};

export type StoryContextStage = {
  id: string;
  title: string;
  summary?: string;
  order: number;
};

export type StoryContextNode = {
  id: string;
  stageId: string;
  sceneId?: string;
  title: string;
  type: string;
  pathRole: string;
  status?: string;
};

export type StoryContextEdge = {
  id: string;
  fromNodeId: string;
  toNodeId: string;
  label: string;
  reason?: string;
  isDefault?: boolean;
  priority: number;
};

export type StoryContextPackageInput = {
  story: {
    id: string;
    title: string;
    outline: string;
    goal: string;
    userPersonaName?: string;
  };
  graph: {
    entryNodeId: string;
    activeNodeId: string;
    stages: StoryContextStage[];
    nodes: StoryContextNode[];
    edges: StoryContextEdge[];
  };
  scenes: StoryContextScene[];
  activeScene?: StoryContextScene;
  lorebookEntries: StoryContextLorebookEntry[];
  characters: StoryContextCharacter[];
  memory?: {
    manual?: string;
    sceneLayers?: Partial<StoryContextMemoryLayers>;
  };
  branch?: {
    pathNodeIds?: string[];
    pathEdgeIds?: string[];
  };
};

export type StoryContextPackage = {
  version: 1;
  story: StoryContextPackageInput["story"];
  graph: StoryContextPackageInput["graph"] & {
    activeNode?: StoryContextNode;
    activeStage?: StoryContextStage;
    activeScene?: StoryContextScene;
  };
  scenes: StoryContextScene[];
  world: {
    lorebookEntries: StoryContextLorebookEntry[];
  };
  characters: StoryContextCharacter[];
  memory: {
    manual: string;
    sceneLayers: StoryContextMemoryLayers;
  };
  branch: {
    pathNodeIds: string[];
    pathEdgeIds: string[];
  };
};

export type StoryGraphContextSlice = {
  activeNode?: StoryContextNode;
  activeStage?: StoryContextStage;
  activeScene?: StoryContextScene;
  incomingEdges: StoryContextEdge[];
  outgoingEdges: StoryContextEdge[];
};

const trimText = (value: string | undefined) => value?.trim() ?? "";

const createEmptySceneLayers = (
  input: Partial<StoryContextMemoryLayers> = {},
): StoryContextMemoryLayers => ({
  required: trimText(input.required),
  upstream: trimText(input.upstream),
  public: trimText(input.public),
  private: trimText(input.private),
  directorSecret: trimText(input.directorSecret),
});

export const buildStoryContextPackage = (
  input: StoryContextPackageInput,
): StoryContextPackage => {
  const activeNode = input.graph.nodes.find((node) => node.id === input.graph.activeNodeId) ??
    input.graph.nodes.find((node) => node.id === input.graph.entryNodeId) ??
    input.graph.nodes[0];
  const activeStage = activeNode
    ? input.graph.stages.find((stage) => stage.id === activeNode.stageId)
    : undefined;
  const activeScene = (
    activeNode?.sceneId
      ? input.scenes.find((scene) => scene.id === activeNode.sceneId)
      : undefined
  ) ?? input.activeScene;

  return {
    version: 1,
    story: {
      id: input.story.id,
      title: trimText(input.story.title),
      outline: trimText(input.story.outline),
      goal: trimText(input.story.goal),
      userPersonaName: trimText(input.story.userPersonaName),
    },
    graph: {
      entryNodeId: input.graph.entryNodeId,
      activeNodeId: activeNode?.id ?? input.graph.activeNodeId,
      stages: input.graph.stages,
      nodes: input.graph.nodes,
      edges: input.graph.edges,
      activeNode,
      activeStage,
      activeScene,
    },
    scenes: input.scenes,
    world: {
      lorebookEntries: input.lorebookEntries,
    },
    characters: input.characters,
    memory: {
      manual: trimText(input.memory?.manual),
      sceneLayers: createEmptySceneLayers(input.memory?.sceneLayers),
    },
    branch: {
      pathNodeIds: input.branch?.pathNodeIds ?? [],
      pathEdgeIds: input.branch?.pathEdgeIds ?? [],
    },
  };
};

export const getStoryGraphContextSlice = (
  context: StoryContextPackage,
  {
    maxEdges,
  }: {
    maxEdges?: number;
  } = {},
): StoryGraphContextSlice => {
  const activeNode = context.graph.activeNode;
  if (!activeNode) {
    return {
      incomingEdges: [],
      outgoingEdges: [],
    };
  }

  const incomingEdges = context.graph.edges
    .filter((edge) => edge.toNodeId === activeNode.id)
    .slice(0, maxEdges ?? context.graph.edges.length);
  const outgoingEdges = context.graph.edges
    .filter((edge) => edge.fromNodeId === activeNode.id)
    .slice(0, maxEdges ?? context.graph.edges.length);

  return {
    activeNode,
    activeStage: context.graph.activeStage,
    activeScene: context.graph.activeScene,
    incomingEdges,
    outgoingEdges,
  };
};

const normalizeSearchText = (text: string) => text.toLowerCase();

export const selectStoryLorebookEntries = ({
  context,
  currentText,
  activeCharacterId,
}: {
  context: StoryContextPackage;
  currentText: string;
  activeCharacterId?: string;
}) => {
  const activeCharacter = activeCharacterId
    ? context.characters.find((character) => character.id === activeCharacterId)
    : undefined;
  const activeScene = context.graph.activeScene;
  const matchText = normalizeSearchText([
    currentText,
    context.story.title,
    context.story.outline,
    context.story.goal,
    activeScene?.scene ?? "",
    activeScene?.goal ?? "",
    activeScene?.plot ?? "",
    activeCharacter?.name ?? "",
    context.characters.map((character) => [
      character.name,
      character.description,
      character.goals ?? "",
      character.publicRelationshipSummary ?? character.relationshipSummary ?? "",
    ].join("\n")).join("\n\n"),
  ].join("\n\n"));

  return context.world.lorebookEntries
    .filter((entry) => entry.enabled)
    .filter((entry) => entry.alwaysOn || entry.keywords.some((keyword) =>
      matchText.includes(keyword.toLowerCase())
    ));
};
