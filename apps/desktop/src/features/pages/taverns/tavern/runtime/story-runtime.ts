import {
  now,
} from "../ids";
import type {
  TavernStoryEdge,
  TavernStoryGraph,
  TavernStoryRun,
} from "../types";

const stableIdHash = (value: string) => {
  let hash = 5381;
  for (let index = 0; index < value.length; index += 1) {
    hash = ((hash << 5) + hash) ^ value.charCodeAt(index);
  }
  return (hash >>> 0).toString(36);
};

export const createRouteScopedSceneInstanceId = (
  roomId: string,
  pathNodeIds: string[],
) => `scene-instance-${stableIdHash([roomId, ...pathNodeIds].join(">"))}`;

const sortStoryEdgesForRoute = (edges: TavernStoryEdge[]) =>
  [...edges].sort((left, right) =>
    Number(right.isDefault) - Number(left.isDefault) ||
    left.priority - right.priority ||
    left.createdAt - right.createdAt
  );

export const buildStoryRunsFromGraph = (
  graph: TavernStoryGraph,
  createdAt = now(),
): TavernStoryRun[] => {
  const nodeById = new Map(graph.nodes.map((node) => [node.id, node]));
  const edgesBySourceNodeId = new Map<string, TavernStoryEdge[]>();
  graph.edges.forEach((edge) => {
    const sourceEdges = edgesBySourceNodeId.get(edge.fromNodeId) ?? [];
    sourceEdges.push(edge);
    edgesBySourceNodeId.set(edge.fromNodeId, sourceEdges);
  });

  const entryNode = nodeById.get(graph.entryNodeId) ?? graph.nodes[0];
  if (!entryNode) {
    return [];
  }

  const runs: TavernStoryRun[] = [];
  const walk = (
    nodeId: string,
    pathNodeIds: string[],
    pathEdgeIds: string[],
    visitedNodeIds: Set<string>,
  ) => {
    if (visitedNodeIds.has(nodeId)) {
      return;
    }

    const node = nodeById.get(nodeId);
    if (!node) {
      return;
    }

    const nextPathNodeIds = [...pathNodeIds, nodeId];
    const nextVisitedNodeIds = new Set(visitedNodeIds);
    nextVisitedNodeIds.add(nodeId);
    const outgoingEdges = sortStoryEdgesForRoute(edgesBySourceNodeId.get(nodeId) ?? [])
      .filter((edge) => nodeById.has(edge.toNodeId));

    if (outgoingEdges.length === 0 || node.type === "ending" || node.type === "failure") {
      const title = nextPathNodeIds
        .map((item) => nodeById.get(item)?.title.trim())
        .filter((item): item is string => Boolean(item))
        .join(" / ");
      runs.push({
        id: `run-${stableIdHash([graph.entryNodeId, ...nextPathNodeIds].join(">"))}`,
        title: title || "默认路线",
        pathNodeIds: nextPathNodeIds,
        pathEdgeIds,
        activeNodeId: nextPathNodeIds[0] ?? nodeId,
        createdAt,
        updatedAt: createdAt,
      });
      return;
    }

    outgoingEdges.forEach((edge) => {
      walk(
        edge.toNodeId,
        nextPathNodeIds,
        [...pathEdgeIds, edge.id],
        nextVisitedNodeIds,
      );
    });
  };

  walk(entryNode.id, [], [], new Set());
  return runs.length > 0
    ? runs
    : [{
        id: `run-${stableIdHash(entryNode.id)}`,
        title: entryNode.title.trim() || "默认路线",
        pathNodeIds: [entryNode.id],
        pathEdgeIds: [],
        activeNodeId: entryNode.id,
        createdAt,
        updatedAt: createdAt,
      }];
};

export const resolveActiveRun = (
  runs: TavernStoryRun[],
  activeRunId: string | undefined,
) => runs.find((run) => run.id === activeRunId) ?? runs[0] ?? null;

export const resolveRunNodePrefix = (
  run: TavernStoryRun | null,
  nodeId: string | undefined,
) => {
  if (!run || !nodeId) {
    return [];
  }

  const nodeIndex = run.pathNodeIds.indexOf(nodeId);
  return nodeIndex >= 0 ? run.pathNodeIds.slice(0, nodeIndex + 1) : [];
};
