import { createTavernId as createId, now } from "../../tavern/ids";
import type {
  TavernScene,
  TavernStoryEdge,
  TavernStoryGraph,
  TavernStoryNode,
} from "@/features/pages/taverns/room/model";

const normalizeTavernStoryNodeType = (value: unknown): TavernStoryNode["type"] => {
  if (value === "failure" || value === "ending") {
    return value;
  }
  return "normal";
};

const normalizeTavernStoryPathRole = (value: unknown): TavernStoryNode["pathRole"] =>
  value === "branch" ? "branch" : "main";

const createTavernStoryNode = (
  input: Partial<TavernStoryNode> & {
    title: string;
  },
): TavernStoryNode => {
  const updatedAt = typeof input.updatedAt === "number" ? input.updatedAt : now();

  return {
    id: input.id || createId("node"),
    sceneId: input.sceneId?.trim() || undefined,
    title: input.title.trim() || "未命名节点",
    type: normalizeTavernStoryNodeType(input.type),
    pathRole: normalizeTavernStoryPathRole(input.pathRole),
    position: {
      x: typeof input.position?.x === "number" ? input.position.x : 120,
      y: typeof input.position?.y === "number" ? input.position.y : 120,
    },
    status: input.status ?? (input.sceneId ? "ready" : "draft"),
    createdAt: typeof input.createdAt === "number" ? input.createdAt : updatedAt,
    updatedAt,
  };
};

const createTavernStoryEdge = (
  input: Partial<TavernStoryEdge> & {
    fromNodeId: string;
    toNodeId: string;
  },
): TavernStoryEdge => {
  const updatedAt = typeof input.updatedAt === "number" ? input.updatedAt : now();

  return {
    id: input.id || createId("edge"),
    fromNodeId: input.fromNodeId,
    toNodeId: input.toNodeId,
    label: input.label?.trim() || "继续",
    reason: input.reason?.trim() || undefined,
    isDefault: Boolean(input.isDefault),
    priority: typeof input.priority === "number" ? input.priority : 0,
    createdAt: typeof input.createdAt === "number" ? input.createdAt : updatedAt,
    updatedAt,
  };
};

export const createDefaultStoryGraph = (scenes: TavernScene[]): TavernStoryGraph => {
  const nodes = scenes.map((scene, index) =>
    createTavernStoryNode({
      sceneId: scene.id,
      title: scene.title || `节点 ${index + 1}`,
      type: index === scenes.length - 1 && scenes.length > 1 ? "ending" : "normal",
      pathRole: "main",
      position: {
        x: 120 + index * 240,
        y: 160,
      },
      status: "ready",
      createdAt: scene.createdAt,
      updatedAt: scene.updatedAt,
    }),
  );
  const entryNode =
    nodes[0] ??
    createTavernStoryNode({
      title: "入口节点",
      status: "draft",
    });
  const edges = nodes.slice(0, -1).map((node, index) =>
    createTavernStoryEdge({
      fromNodeId: node.id,
      toNodeId: nodes[index + 1].id,
      label: "继续",
      isDefault: true,
      priority: index,
      createdAt: node.createdAt,
      updatedAt: node.updatedAt,
    }),
  );

  return {
    version: 1,
    entryNodeId: entryNode.id,
    activeNodeId: entryNode.id,
    nodes: nodes.length > 0 ? nodes : [entryNode],
    edges,
  };
};

export const normalizeStoryGraph = (value: unknown, scenes: TavernScene[]): TavernStoryGraph => {
  if (!value || typeof value !== "object") {
    return createDefaultStoryGraph(scenes);
  }

  const candidate = value as Partial<TavernStoryGraph>;
  const sceneIds = new Set(scenes.map((scene) => scene.id));
  const nodes = Array.isArray(candidate.nodes)
    ? candidate.nodes
        .map((node) => {
          const rawNode = node as Partial<TavernStoryNode>;
          const title = typeof rawNode.title === "string" ? rawNode.title : "";
          if (!title.trim()) {
            return null;
          }

          return createTavernStoryNode({
            ...rawNode,
            sceneId: rawNode.sceneId && sceneIds.has(rawNode.sceneId) ? rawNode.sceneId : undefined,
            title,
          });
        })
        .filter((node): node is TavernStoryNode => Boolean(node))
    : [];
  const normalizedNodes = nodes.length > 0 ? nodes : createDefaultStoryGraph(scenes).nodes;
  const nodeIds = new Set(normalizedNodes.map((node) => node.id));
  const edges = Array.isArray(candidate.edges)
    ? candidate.edges
        .map((edge) => {
          const rawEdge = edge as Partial<TavernStoryEdge>;
          if (
            !rawEdge.fromNodeId ||
            !rawEdge.toNodeId ||
            !nodeIds.has(rawEdge.fromNodeId) ||
            !nodeIds.has(rawEdge.toNodeId) ||
            rawEdge.fromNodeId === rawEdge.toNodeId
          ) {
            return null;
          }

          return createTavernStoryEdge({
            ...rawEdge,
            fromNodeId: rawEdge.fromNodeId,
            toNodeId: rawEdge.toNodeId,
          });
        })
        .filter((edge): edge is TavernStoryEdge => Boolean(edge))
    : [];
  const entryNodeId =
    candidate.entryNodeId && nodeIds.has(candidate.entryNodeId)
      ? candidate.entryNodeId
      : (normalizedNodes[0]?.id ?? "");
  const activeNodeId =
    candidate.activeNodeId && nodeIds.has(candidate.activeNodeId) ? candidate.activeNodeId : entryNodeId;

  return {
    version: 1,
    entryNodeId,
    activeNodeId,
    nodes: normalizedNodes,
    edges,
  };
};
