import {
  ArrowRight,
  GitBranch,
  Map as MapIcon,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import { useState } from "react";
import { resolveAgentAvatar } from "@/assets/agent-avatars";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { cn } from "@/lib/utils";
import {
  createTavernScene,
  projectTavernSceneOntoRoom,
} from "../../../../../storage";
import type {
  TavernCharacter,
  TavernRoom,
  TavernScene,
  TavernStoryEdge,
  TavernStoryNode,
  TavernStoryStage,
} from "../../../../../types";
import {
  EditorField,
  EditorFormDialogContent,
  EditorFormFooter,
  EditorFormHeader,
  EditorFormLayout,
  EditorSection,
  EditorStatusPill,
  editorDangerActionButtonClassName,
  editorHeaderActionButtonClassName,
  editorPrimaryActionButtonClassName,
  editorQuietActionButtonClassName,
} from "../../primitives";
import type { PendingDangerAction } from "../../types";
import {
  editorControlClassName,
  emptyValueText,
  formatCount,
  getRoomCharacterById,
} from "../../utils";
import type { ModuleSave } from "../types";

type StoryGraphSectionProps = {
  data: TavernRoom;
  characterById: Map<string, TavernCharacter>;
  onSave: ModuleSave;
  onRequestDangerAction: (action: PendingDangerAction) => void;
  onEditScene?: (sceneId: string) => void;
};

const createLocalId = (prefix: string) =>
  `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

const now = () => Date.now();

const getNodeTone = (node: TavernStoryNode) => {
  if (node.type === "failure") {
    return "border-red-400/35 bg-red-500/[0.07]";
  }
  if (node.type === "ending") {
    return "border-amber-400/35 bg-amber-500/[0.08]";
  }
  if (node.pathRole === "branch") {
    return "border-sky-400/35 bg-sky-500/[0.07]";
  }
  return "border-primary/35 bg-primary/[0.06]";
};

const nodeWidth = 170;
const nodeHeight = 72;
const nodeColumnGap = 340;
const nodeLaneGap = 20;
const graphPaddingX = 48;
const graphPaddingY = 24;

type StoryGraphLayoutNode = {
  node: TavernStoryNode;
  x: number;
  y: number;
  depth: number;
};

type StoryGraphLayout = {
  width: number;
  height: number;
  nodes: StoryGraphLayoutNode[];
  nodeById: Map<string, StoryGraphLayoutNode>;
};

const sortByOrder = <T extends { order?: number; createdAt?: number; title?: string }>(items: T[]) =>
  [...items].sort((left, right) =>
    (left.order ?? 0) - (right.order ?? 0) ||
    (left.createdAt ?? 0) - (right.createdAt ?? 0) ||
    (left.title ?? "").localeCompare(right.title ?? "")
  );

const getStoryNodeStatusLabel = (node: TavernStoryNode) => {
  if (node.status === "ready") {
    return "就绪";
  }
  if (node.status === "played") {
    return "已演绎";
  }
  return "草稿";
};

const getStoryNodeTypeLabel = (node: TavernStoryNode) => {
  if (node.type === "failure") {
    return "失败";
  }
  if (node.type === "ending") {
    return "终局";
  }
  return "普通";
};

const getStoryPathRoleLabel = (node: TavernStoryNode) => {
  if (node.type === "failure") {
    return "失败线";
  }
  if (node.type === "ending") {
    return "结局线";
  }
  if (node.pathRole === "main") {
    return "主线";
  }
  return "支线";
};

const getEdgeVisualTone = (
  edge: TavernStoryEdge,
  targetNode: TavernStoryNode | undefined,
) => {
  if (targetNode?.type === "failure") {
    return {
      stroke: "stroke-red-400",
      text: "text-red-700 dark:text-red-300",
      markerId: "story-edge-arrow-red",
    };
  }
  if (targetNode?.type === "ending") {
    return {
      stroke: "stroke-amber-400",
      text: "text-amber-700 dark:text-amber-300",
      markerId: "story-edge-arrow-amber",
    };
  }
  if (!edge.isDefault || targetNode?.pathRole === "branch") {
    return {
      stroke: "stroke-sky-400",
      text: "text-sky-700 dark:text-sky-300",
      markerId: "story-edge-arrow-sky",
    };
  }
  return {
    stroke: "stroke-primary",
    text: "text-primary",
    markerId: "story-edge-arrow-primary",
  };
};

const buildDefaultRoute = (graph: TavernRoom["storyGraph"]) => {
  const nodesById = new Map(graph.nodes.map((node) => [node.id, node]));
  const route: TavernStoryNode[] = [];
  const visitedNodeIds = new Set<string>();
  let currentNodeId: string | undefined = nodesById.get(graph.entryNodeId)?.id ?? graph.nodes[0]?.id;

  while (currentNodeId && !visitedNodeIds.has(currentNodeId) && route.length <= graph.nodes.length) {
    const currentNode = nodesById.get(currentNodeId);
    if (!currentNode) {
      break;
    }

    route.push(currentNode);
    visitedNodeIds.add(currentNode.id);

    const nextEdge = graph.edges
      .filter((edge) => edge.fromNodeId === currentNodeId)
      .sort((left, right) =>
        Number(right.isDefault) - Number(left.isDefault) ||
        left.priority - right.priority ||
        left.createdAt - right.createdAt
      )[0];

    currentNodeId = nextEdge?.toNodeId;
  }

  return route;
};

const buildRouteToNode = (
  graph: TavernRoom["storyGraph"],
  nodeId: string | undefined,
) => {
  if (!nodeId) {
    return [];
  }

  const nodesById = new Map(graph.nodes.map((node) => [node.id, node]));
  const route: TavernStoryNode[] = [];
  const visitedNodeIds = new Set<string>();
  let currentNodeId: string | undefined = nodeId;

  while (currentNodeId && !visitedNodeIds.has(currentNodeId)) {
    const node = nodesById.get(currentNodeId);
    if (!node) {
      break;
    }

    route.unshift(node);
    visitedNodeIds.add(node.id);

    const incomingEdge = graph.edges
      .filter((edge) => edge.toNodeId === currentNodeId)
      .sort((left, right) =>
        Number(right.isDefault) - Number(left.isDefault) ||
        left.priority - right.priority ||
        left.createdAt - right.createdAt
      )[0];
    currentNodeId = incomingEdge?.fromNodeId;
  }

  return route;
};

const getStageNodeCount = (
  stage: TavernStoryStage,
  graph: TavernRoom["storyGraph"],
) => {
  return buildRouteToNode(graph, stage.routeNodeId).length;
};

const formatStageRouteTitle = (
  stage: TavernStoryStage,
  graph: TavernRoom["storyGraph"],
) => {
  const routeNodes = buildRouteToNode(graph, stage.routeNodeId);
  if (routeNodes.length === 0) {
    return "未绑定路线";
  }
  return routeNodes.map((node) => node.title || emptyValueText).join(" → ");
};

const buildRouteEdgeIds = (
  graph: TavernRoom["storyGraph"],
  routeNodes: TavernStoryNode[],
) => {
  const edgeIds = new Set<string>();
  routeNodes.slice(0, -1).forEach((node, index) => {
    const nextNode = routeNodes[index + 1];
    const edge = graph.edges.find((item) =>
      item.fromNodeId === node.id && item.toNodeId === nextNode?.id
    );
    if (edge) {
      edgeIds.add(edge.id);
    }
  });
  return edgeIds;
};

const canNodeUseMainPathRole = (
  graph: TavernRoom["storyGraph"],
  node: TavernStoryNode,
) => {
  if (node.id === graph.entryNodeId) {
    return true;
  }

  const parentEdge = graph.edges
    .filter((edge) => edge.toNodeId === node.id)
    .sort((left, right) =>
      Number(right.isDefault) - Number(left.isDefault) ||
      left.priority - right.priority ||
      left.createdAt - right.createdAt
    )[0];
  const parentNode = parentEdge
    ? graph.nodes.find((item) => item.id === parentEdge.fromNodeId)
    : null;
  if (!parentNode || parentNode.pathRole !== "main") {
    return false;
  }

  return graph.edges
    .filter((edge) => edge.fromNodeId === parentNode.id && edge.toNodeId !== node.id)
    .every((edge) => graph.nodes.find((item) => item.id === edge.toNodeId)?.pathRole !== "main");
};

const buildStoryGraphLayout = (graph: TavernRoom["storyGraph"]): StoryGraphLayout => {
  const edgesByPriority = [...graph.edges].sort((left, right) =>
    left.priority - right.priority ||
    left.createdAt - right.createdAt
  );
  const depthByNodeId = new Map<string, number>();
  const entryNode = graph.nodes.find((node) => node.id === graph.entryNodeId) ?? graph.nodes[0];
  if (entryNode) {
    depthByNodeId.set(entryNode.id, 0);
  }

  for (let index = 0; index < graph.nodes.length; index += 1) {
    let changed = false;
    edgesByPriority.forEach((edge) => {
      const fromDepth = depthByNodeId.get(edge.fromNodeId);
      if (fromDepth === undefined) {
        return;
      }

      const nextDepth = fromDepth + 1;
      const currentDepth = depthByNodeId.get(edge.toNodeId);
      if (currentDepth === undefined || nextDepth < currentDepth) {
        depthByNodeId.set(edge.toNodeId, nextDepth);
        changed = true;
      }
    });

    if (!changed) {
      break;
    }
  }

  graph.nodes.forEach((node, index) => {
    const fallbackDepth = Math.max(
      0,
      Math.round(((node.position?.x ?? graphPaddingX + index * nodeColumnGap) - graphPaddingX) / nodeColumnGap),
    );

    if (!depthByNodeId.has(node.id)) {
      depthByNodeId.set(node.id, fallbackDepth);
    }
  });

  let maxDepth = 0;
  const layoutNodes: StoryGraphLayoutNode[] = [];
  const laneCountByDepth = new Map<number, number>();
  let maxLaneCount = 1;

  sortByOrder(graph.nodes)
    .sort((left, right) =>
      (depthByNodeId.get(left.id) ?? 0) - (depthByNodeId.get(right.id) ?? 0) ||
      (left.position?.y ?? 0) - (right.position?.y ?? 0) ||
      (left.createdAt ?? 0) - (right.createdAt ?? 0)
    )
    .forEach((node) => {
      const depth = depthByNodeId.get(node.id) ?? 0;
      const lane = laneCountByDepth.get(depth) ?? 0;
      laneCountByDepth.set(depth, lane + 1);
      maxLaneCount = Math.max(maxLaneCount, lane + 1);
      maxDepth = Math.max(maxDepth, depth);

      layoutNodes.push({
        node,
        depth,
        x: graphPaddingX + depth * nodeColumnGap,
        y: graphPaddingY + lane * (nodeHeight + nodeLaneGap),
      });
  });

  const width = Math.max(760, graphPaddingX * 2 + (maxDepth + 1) * nodeColumnGap + nodeWidth);
  const height = Math.max(
    360,
    graphPaddingY * 2 + maxLaneCount * nodeHeight + (maxLaneCount - 1) * nodeLaneGap,
  );
  const nodeById = new Map(layoutNodes.map((item) => [item.node.id, item]));

  return {
    width,
    height,
    nodes: layoutNodes,
    nodeById,
  };
};

export const StoryGraphSection = ({
  data,
  characterById,
  onSave,
  onRequestDangerAction,
  onEditScene,
}: StoryGraphSectionProps) => {
  const graph = data.storyGraph;
  const roomCharacterById = getRoomCharacterById(data, characterById);
  const activeNode = graph.nodes.find((node) => node.id === graph.activeNodeId) ??
    graph.nodes[0] ??
    null;
  const activeNodeScene = activeNode?.sceneId
    ? (data.scenes ?? []).find((scene) => scene.id === activeNode.sceneId) ?? null
    : null;
  const [editingNodeId, setEditingNodeId] = useState<string | null>(null);
  const [selectedStageId, setSelectedStageId] = useState<string | null>(
    graph.stages[0]?.id ?? null,
  );
  const editingNode = editingNodeId
    ? graph.nodes.find((node) => node.id === editingNodeId) ?? null
    : null;
  const selectedStage = graph.stages.find((stage) => stage.id === selectedStageId) ??
    graph.stages[0] ??
    null;

  const createSceneForStoryNode = (
    title: string,
    createdAt: number,
  ) => {
    const characterConfigs = Object.fromEntries(
      data.characterIds.map((characterId) => [
        characterId,
        {
          characterId,
          memory: data.characterConfigs?.[characterId]?.memory,
        },
      ]),
    );

    return createTavernScene({
      title: title.trim() || `节点场景 ${((data.scenes ?? []).length) + 1}`,
      order: (data.scenes ?? []).length,
      scenePresetId: data.scenePresetId,
      scene: "新的剧情节点等待配置。",
      sceneGoal: "",
      plot: "",
      storyDirection: "",
      transition: "",
      memory: "",
      characterConfigs,
      characterMemories: {},
      assetDrafts: [],
      characterIds: data.characterIds,
      activeCharacterId: data.activeCharacterId,
      createdAt,
      updatedAt: createdAt,
    });
  };

  const saveGraph = (patch: Partial<TavernRoom["storyGraph"]>) => {
    const updatedAt = now();
    const nextGraph = {
      ...graph,
      ...patch,
    };
    const nextActiveSceneId = nextGraph.nodes.find((node) => node.id === nextGraph.activeNodeId)?.sceneId ??
      data.activeSceneId;

    onSave(projectTavernSceneOntoRoom({
      ...data,
      storyGraph: nextGraph,
      activeSceneId: nextActiveSceneId,
      updatedAt,
    }));
  };

  const updateStage = (stageId: string, patch: Partial<TavernStoryStage>) => {
    saveGraph({
      stages: graph.stages.map((stage) =>
        stage.id === stageId ? { ...stage, ...patch } : stage
      ),
    });
  };

  const createStage = () => {
    const stage: TavernStoryStage = {
      id: createLocalId("stage"),
      title: `阶段 ${graph.stages.length + 1}`,
      order: graph.stages.length,
    };
    setSelectedStageId(stage.id);
    saveGraph({ stages: [...graph.stages, stage] });
  };

  const createInitialNode = () => {
    const createdAt = now();
    const defaultStage: TavernStoryStage = graph.stages[0] ?? {
      id: createLocalId("stage"),
      title: "第一阶段",
      order: 0,
    };
    const scene = createSceneForStoryNode("入口节点", createdAt);
    const node: TavernStoryNode = {
      id: createLocalId("node"),
      stageId: defaultStage.id,
      sceneId: scene.id,
      title: "入口节点",
      type: "normal",
      pathRole: "main",
      position: {
        x: 120,
        y: 160,
      },
      status: "ready",
      createdAt,
      updatedAt: createdAt,
    };
    const nextGraph = {
      ...graph,
      stages: graph.stages.length > 0
        ? graph.stages.map((stage, index) => index === 0 && !stage.routeNodeId
          ? { ...stage, routeNodeId: node.id }
          : stage)
        : [{ ...defaultStage, routeNodeId: node.id }],
      nodes: [...graph.nodes, node],
      entryNodeId: graph.entryNodeId || node.id,
      activeNodeId: node.id,
    };

    onSave(projectTavernSceneOntoRoom({
      ...data,
      scenes: [...(data.scenes ?? []), scene],
      activeSceneId: scene.id,
      storyGraph: nextGraph,
      updatedAt: createdAt,
    }));
  };

  const createNextNode = (sourceNode: TavernStoryNode | null) => {
    if (!sourceNode) {
      if (graph.nodes.length === 0) {
        createInitialNode();
      }
      return;
    }
    if (sourceNode.type !== "normal") {
      return;
    }

    const createdAt = now();
    const outgoingCount = graph.edges.filter((edge) => edge.fromNodeId === sourceNode.id).length;
    const isDefaultPath = outgoingCount === 0;
    const nodeTitle = isDefaultPath
      ? `节点 ${graph.nodes.length + 1}`
      : `分支 ${outgoingCount + 1}`;
    const scene = createSceneForStoryNode(nodeTitle, createdAt);
    const node: TavernStoryNode = {
      id: createLocalId("node"),
      stageId: sourceNode.stageId || graph.stages[0]?.id || "",
      sceneId: scene.id,
      title: nodeTitle,
      type: "normal",
      pathRole: isDefaultPath && sourceNode.pathRole === "main" ? "main" : "branch",
      position: {
        x: (sourceNode.position?.x ?? 120) + nodeColumnGap,
        y: (sourceNode.position?.y ?? 160) + outgoingCount * (nodeHeight + nodeLaneGap),
      },
      status: "ready",
      createdAt,
      updatedAt: createdAt,
    };
    const edge: TavernStoryEdge = {
      id: createLocalId("edge"),
      fromNodeId: sourceNode.id,
      toNodeId: node.id,
      label: isDefaultPath ? "继续" : `分支 ${outgoingCount + 1}`,
      isDefault: isDefaultPath,
      priority: outgoingCount,
      createdAt,
      updatedAt: createdAt,
    };

    const nextGraph = {
      ...graph,
      nodes: [...graph.nodes, node],
      edges: [...graph.edges, edge],
      activeNodeId: node.id,
    };

    onSave(projectTavernSceneOntoRoom({
      ...data,
      scenes: [...(data.scenes ?? []), scene],
      activeSceneId: scene.id,
      storyGraph: nextGraph,
      updatedAt: createdAt,
    }));
  };

  const updateStageRoute = (stageId: string, routeNodeId: string) => {
    updateStage(stageId, {
      routeNodeId: routeNodeId || undefined,
    });
  };

  const updateNode = (nodeId: string, patch: Partial<TavernStoryNode>) => {
    const updatedAt = now();
    const nextNodes = graph.nodes.map((node) => {
      if (node.id !== nodeId) {
        return node;
      }

      const requestedPathRole = patch.pathRole === "main" && !canNodeUseMainPathRole(graph, node)
        ? "branch"
        : patch.pathRole;

      return {
        ...node,
        ...patch,
        ...(requestedPathRole ? { pathRole: requestedPathRole } : {}),
        status: patch.status ?? (node.sceneId ? "ready" : "draft"),
        updatedAt,
      };
    });

    saveGraph({
      nodes: nextNodes,
      edges: patch.type && patch.type !== "normal"
        ? graph.edges.filter((edge) => edge.fromNodeId !== nodeId)
        : graph.edges,
    });
  };

  const createMissingSceneForNode = (node: TavernStoryNode) => {
    if (data.locked || node.sceneId) {
      return;
    }

    const createdAt = now();
    const scene = createSceneForStoryNode(node.title, createdAt);
    const nextGraph = {
      ...graph,
      activeNodeId: node.id,
      nodes: graph.nodes.map((item) =>
        item.id === node.id
          ? {
              ...item,
              title: item.title.trim() ? item.title : scene.title,
              sceneId: scene.id,
              status: "ready" as const,
              updatedAt: createdAt,
            }
          : item
      ),
    };

    onSave(projectTavernSceneOntoRoom({
      ...data,
      scenes: [...(data.scenes ?? []), scene],
      activeSceneId: scene.id,
      storyGraph: nextGraph,
      updatedAt: createdAt,
    }));
    onEditScene?.(scene.id);
  };

  const openSceneEditorForNode = (node: TavernStoryNode) => {
    if (node.sceneId) {
      onEditScene?.(node.sceneId);
      return;
    }

    createMissingSceneForNode(node);
  };

  const deleteNode = (nodeId: string) => {
    if (graph.nodes.length <= 1 || nodeId === graph.entryNodeId) {
      return;
    }
    const deletedNode = graph.nodes.find((node) => node.id === nodeId);
    const nextNodes = graph.nodes.filter((node) => node.id !== nodeId);
    const nextActiveNodeId = graph.activeNodeId === nodeId
      ? nextNodes[0]?.id ?? graph.entryNodeId
      : graph.activeNodeId;
    const nextScenes = deletedNode?.sceneId
      ? (data.scenes ?? []).filter((scene) => scene.id !== deletedNode.sceneId)
      : (data.scenes ?? []);
    const nextGraph = {
      ...graph,
      nodes: nextNodes,
      edges: graph.edges.filter((edge) => edge.fromNodeId !== nodeId && edge.toNodeId !== nodeId),
      stages: graph.stages.map((stage) => stage.routeNodeId === nodeId
        ? { ...stage, routeNodeId: undefined }
        : stage),
      activeNodeId: nextActiveNodeId,
    };
    const nextActiveSceneId = nextGraph.nodes.find((node) => node.id === nextActiveNodeId)?.sceneId ??
      nextScenes[0]?.id ??
      "";

    onSave(projectTavernSceneOntoRoom({
      ...data,
      scenes: nextScenes,
      activeSceneId: nextActiveSceneId,
      storyGraph: nextGraph,
      updatedAt: now(),
    }));
  };

  const updateEdge = (edgeId: string, patch: Partial<TavernStoryEdge>) => {
    const updatedAt = now();
    const originalEdge = graph.edges.find((item) => item.id === edgeId);
    if (!originalEdge) {
      return;
    }
    if (patch.fromNodeId) {
      const nextSourceNode = graph.nodes.find((node) => node.id === patch.fromNodeId);
      if (nextSourceNode?.type !== "normal") {
        return;
      }
    }

    const patchedEdge = {
      ...originalEdge,
      ...patch,
      updatedAt,
    };
    let edges = graph.edges.map((item) =>
      item.id === edgeId ? patchedEdge : item
    );

    if (patch.isDefault) {
      edges = edges.map((item) =>
        item.fromNodeId === patchedEdge.fromNodeId
          ? { ...item, isDefault: item.id === edgeId, updatedAt: item.id === edgeId ? updatedAt : item.updatedAt }
          : item
      );
    }

    if (patch.fromNodeId && patch.fromNodeId !== originalEdge.fromNodeId) {
      const hasOtherDefaultForNewSource = edges.some((item) =>
        item.id !== edgeId &&
        item.fromNodeId === patchedEdge.fromNodeId &&
        item.isDefault
      );
      edges = edges.map((item) =>
        item.id === edgeId
          ? {
              ...item,
              isDefault: hasOtherDefaultForNewSource ? false : true,
              updatedAt,
            }
          : item
      );

      const oldSourceEdges = edges
        .filter((item) => item.fromNodeId === originalEdge.fromNodeId)
        .sort((left, right) => left.priority - right.priority || left.createdAt - right.createdAt);
      if (oldSourceEdges.length > 0 && oldSourceEdges.every((item) => !item.isDefault)) {
        const nextDefaultEdgeId = oldSourceEdges[0]?.id;
        edges = edges.map((item) =>
          item.id === nextDefaultEdgeId ? { ...item, isDefault: true, updatedAt } : item
        );
      }
    }

    saveGraph({ edges });
  };

  const deleteEdge = (edgeId: string) => {
    saveGraph({ edges: graph.edges.filter((edge) => edge.id !== edgeId) });
  };

  const outgoingEdges = activeNode
    ? graph.edges.filter((edge) => edge.fromNodeId === activeNode.id)
    : [];
  const incomingEdges = activeNode
    ? graph.edges.filter((edge) => edge.toNodeId === activeNode.id)
    : [];
  const graphLayout = buildStoryGraphLayout(graph);
  const defaultRouteNodes = buildDefaultRoute(graph);
  const selectedStageRouteNodes = selectedStage
    ? buildRouteToNode(graph, selectedStage.routeNodeId)
    : [];
  const selectedStageRouteNodeIds = new Set(selectedStageRouteNodes.map((node) => node.id));
  const selectedStageRouteEdgeIds = buildRouteEdgeIds(graph, selectedStageRouteNodes);
  const hasSelectedStageRoute = selectedStageRouteNodes.length > 0;
  const getSceneCharacters = (scene: TavernScene | null | undefined) =>
    (scene?.characterIds ?? [])
      .map((characterId) => roomCharacterById.get(characterId))
      .filter((character): character is TavernCharacter => Boolean(character));
  const renderSceneAvatarStack = (
    scene: TavernScene | null | undefined,
    maxVisible = 4,
  ) => {
    const sceneCharacters = getSceneCharacters(scene);
    const visibleCharacters = sceneCharacters.slice(0, maxVisible);
    const hiddenCount = Math.max(0, sceneCharacters.length - visibleCharacters.length);

    return (
      <div className="flex items-center gap-1.5">
        <div className="flex -space-x-1.5">
          {visibleCharacters.map((character) => (
            <img
              key={character.id}
              src={resolveAgentAvatar(character.avatar).src}
              alt=""
              className="size-6 rounded-full border bg-muted"
            />
          ))}
          {hiddenCount > 0 && (
            <span className="flex size-6 items-center justify-center rounded-full border bg-background text-[10px] font-medium text-muted-foreground">
              +{hiddenCount}
            </span>
          )}
          {sceneCharacters.length === 0 && (
            <span className="flex size-6 items-center justify-center rounded-full border bg-background text-[10px] text-muted-foreground">
              0
            </span>
          )}
        </div>
        <span className="text-xs text-muted-foreground">
          {formatCount(sceneCharacters.length, "角色")}
        </span>
      </div>
    );
  };
  const renderEdgeEditor = (
    edge: TavernStoryEdge,
    direction: "outgoing" | "incoming",
  ) => {
    const isOutgoing = direction === "outgoing";
    const selectValue = isOutgoing ? edge.toNodeId : edge.fromNodeId;
    const blockedNodeId = isOutgoing ? edge.fromNodeId : edge.toNodeId;

    return (
      <div key={edge.id} className="rounded-md border bg-muted/15 p-2">
        <NativeSelect
          value={selectValue}
          className="h-8 bg-background/80 text-xs"
          disabled={data.locked}
          onChange={(event) => updateEdge(edge.id, isOutgoing
            ? { toNodeId: event.target.value }
            : { fromNodeId: event.target.value })}
        >
          {graph.nodes
            .filter((node) => node.id !== blockedNodeId)
            .filter((node) => isOutgoing || node.type === "normal")
            .map((node) => (
              <NativeSelectOption key={node.id} value={node.id}>
                {node.title}
              </NativeSelectOption>
            ))}
        </NativeSelect>
        {isOutgoing ? (
          <Input
            value={edge.reason ?? ""}
            placeholder="出口原因"
            className="mt-2 h-8 bg-background/80 text-xs"
            disabled={data.locked}
            onChange={(event) => updateEdge(edge.id, { reason: event.target.value })}
          />
        ) : (
          <div className="mt-2 rounded-md bg-background/80 px-2 py-1.5 text-xs text-muted-foreground">
            <span className="font-medium">入口原因：</span>
            {edge.reason?.trim() || emptyValueText}
          </div>
        )}
        <div className="mt-2 flex justify-between gap-2">
          <Button
            type="button"
            size="xs"
            variant="outline"
            className={edge.isDefault
              ? editorPrimaryActionButtonClassName
              : editorQuietActionButtonClassName}
            disabled={data.locked}
            onClick={() => updateEdge(edge.id, { isDefault: true })}
          >
            默认
          </Button>
          <Button
            type="button"
            size="icon-xs"
            variant="ghost"
            className={editorDangerActionButtonClassName}
            disabled={data.locked}
            title="删除分支"
            aria-label="删除分支"
            onClick={() => deleteEdge(edge.id)}
          >
            <Trash2 className="size-3" />
          </Button>
        </div>
      </div>
    );
  };
  const canEditingNodeChooseMain = editingNode
    ? editingNode.pathRole === "main" || canNodeUseMainPathRole(graph, editingNode)
    : false;

  return (
    <div className="space-y-4">
      <EditorSection
        icon={MapIcon}
        title="剧情结构"
        description="阶段用于组织节点；选中节点后新增节点。"
        meta={`${formatCount(graph.nodes.length, "节点")} · ${formatCount(graph.edges.length, "分支")}`}
        action={(
          <Button
            type="button"
            size="sm"
            variant="outline"
            className={editorHeaderActionButtonClassName}
            disabled={data.locked || (graph.nodes.length > 0 && (!activeNode || activeNode.type !== "normal"))}
            onClick={() => {
              if (graph.nodes.length === 0) {
                createInitialNode();
                return;
              }
              createNextNode(activeNode);
            }}
          >
            <Plus className="size-3.5" />
            {graph.nodes.length === 0 ? "新增入口节点" : "新增节点"}
          </Button>
        )}
      >
        <div className="grid gap-3 xl:grid-cols-[18rem_minmax(0,1fr)_22rem]">
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <div className="text-xs font-medium text-muted-foreground">阶段列表</div>
              <Button
                type="button"
                size="xs"
                variant="outline"
                className={editorHeaderActionButtonClassName}
                disabled={data.locked}
                onClick={createStage}
              >
                <Plus className="size-3" />
                阶段
              </Button>
            </div>
            {graph.stages.map((stage) => {
              const isSelectedStage = selectedStage?.id === stage.id;
              const stageNodeCount = getStageNodeCount(stage, graph);
              return (
              <div
                key={stage.id}
                role="button"
                tabIndex={0}
                className={cn(
                  "rounded-md border bg-background/70 p-2 transition-colors",
                  isSelectedStage && "border-primary/50 bg-primary/[0.05] shadow-sm",
                )}
                onClick={() => setSelectedStageId(stage.id)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    setSelectedStageId(stage.id);
                  }
                }}
              >
                <div className="flex items-center justify-between gap-2">
	                  <Input
	                    value={stage.title}
	                    className="h-8 bg-background/80 text-sm"
	                    disabled={data.locked}
	                    onChange={(event) => updateStage(stage.id, { title: event.target.value })}
	                  />
	                  <EditorStatusPill tone={isSelectedStage ? "active" : "muted"}>
                      {stageNodeCount}
                    </EditorStatusPill>
	                </div>
	                <NativeSelect
	                  value={stage.routeNodeId ?? ""}
	                  className="mt-2 h-8 bg-background/80 text-xs"
	                  disabled={data.locked}
	                  onChange={(event) => updateStageRoute(stage.id, event.target.value)}
	                >
	                  <NativeSelectOption value="">未绑定路线</NativeSelectOption>
	                  {graph.nodes.map((node) => (
	                    <NativeSelectOption key={node.id} value={node.id}>
	                      {node.title || emptyValueText}
	                    </NativeSelectOption>
	                  ))}
	                </NativeSelect>
	                <div className="mt-2 rounded-md bg-muted/25 px-2 py-1.5 text-[11px] text-muted-foreground">
	                  <div className="truncate">{formatStageRouteTitle(stage, graph)}</div>
	                  <div className="mt-0.5">
                      {isSelectedStage ? "已选中 · " : ""}
                      {formatCount(stageNodeCount, "节点")}
                    </div>
	                </div>
              </div>
              );
            })}
          </div>

          <div className="min-h-[24rem] overflow-hidden rounded-lg border bg-muted/10">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-background/55 px-3 py-2">
              <div className="flex items-center gap-2 text-sm font-medium">
                <GitBranch className="size-4 text-primary" />
                多分支结构图
              </div>
              <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
                <span className="rounded-md border bg-background/80 px-2 py-1">
                  入口：{graph.nodes.find((node) => node.id === graph.entryNodeId)?.title || emptyValueText}
                </span>
                <span className="rounded-md border bg-background/80 px-2 py-1">
                  默认路线 {defaultRouteNodes.length}
                </span>
                <span className="rounded-md border bg-background/80 px-2 py-1">
                  阶段：{selectedStage?.title || emptyValueText}
                  {hasSelectedStageRoute ? ` · 高亮 ${selectedStageRouteNodes.length}` : " · 未绑定路线"}
                </span>
              </div>
            </div>

            <div className="overflow-auto">
              <div
                className="relative"
                style={{
                  width: graphLayout.width,
                  height: graphLayout.height,
                }}
              >
                <svg
                  className="pointer-events-none absolute inset-0 z-10"
                  width={graphLayout.width}
                  height={graphLayout.height}
                  viewBox={`0 0 ${graphLayout.width} ${graphLayout.height}`}
                  aria-hidden="true"
                >
                  <defs>
                    <marker id="story-edge-arrow-primary" markerWidth="10" markerHeight="10" refX="9" refY="5" orient="auto">
                      <path d="M 0 0 L 10 5 L 0 10 z" className="fill-primary" />
                    </marker>
                    <marker id="story-edge-arrow-sky" markerWidth="10" markerHeight="10" refX="9" refY="5" orient="auto">
                      <path d="M 0 0 L 10 5 L 0 10 z" className="fill-sky-400" />
                    </marker>
                    <marker id="story-edge-arrow-red" markerWidth="10" markerHeight="10" refX="9" refY="5" orient="auto">
                      <path d="M 0 0 L 10 5 L 0 10 z" className="fill-red-400" />
                    </marker>
                    <marker id="story-edge-arrow-amber" markerWidth="10" markerHeight="10" refX="9" refY="5" orient="auto">
                      <path d="M 0 0 L 10 5 L 0 10 z" className="fill-amber-400" />
                    </marker>
                  </defs>
                  {graph.edges.map((edge) => {
                    const fromLayout = graphLayout.nodeById.get(edge.fromNodeId);
                    const toLayout = graphLayout.nodeById.get(edge.toNodeId);
                    if (!fromLayout || !toLayout) {
                      return null;
                    }

                    const startX = fromLayout.x + nodeWidth;
                    const startY = fromLayout.y + nodeHeight / 2;
                    const endX = toLayout.x;
                    const endY = toLayout.y + nodeHeight / 2;
                    const bend = Math.max(72, Math.abs(endX - startX) / 2);
                    const path = endX > startX
                      ? `M ${startX} ${startY} C ${startX + bend} ${startY}, ${endX - bend} ${endY}, ${endX} ${endY}`
                      : `M ${startX} ${startY} C ${startX + 72} ${startY}, ${endX - 72} ${endY}, ${endX} ${endY}`;
                    const edgeTone = getEdgeVisualTone(edge, toLayout.node);
                    const isRouteEdge = selectedStageRouteEdgeIds.has(edge.id);

                    return (
                      <path
                        key={edge.id}
                        d={path}
                        className={cn(
                          "fill-none transition-opacity",
                          isRouteEdge ? "stroke-[4] drop-shadow-sm" : "stroke-[2.5]",
                          edgeTone.stroke,
                          hasSelectedStageRoute && !isRouteEdge && "opacity-25",
                        )}
                        strokeDasharray={edge.isDefault ? undefined : "6 6"}
                        markerEnd={`url(#${edgeTone.markerId})`}
                      />
                    );
                  })}
                </svg>

                {graph.edges.map((edge) => {
                  const fromLayout = graphLayout.nodeById.get(edge.fromNodeId);
                  const toLayout = graphLayout.nodeById.get(edge.toNodeId);
                  if (!fromLayout || !toLayout) {
                    return null;
                  }

                  const edgeTone = getEdgeVisualTone(edge, toLayout.node);
                  const isRouteEdge = selectedStageRouteEdgeIds.has(edge.id);
                  const edgeDisplayText = edge.reason?.trim() || edge.label?.trim() || "继续";
                  const labelLeft = Math.max(
                    16,
                    Math.min(
                      graphLayout.width - 216,
                      (fromLayout.x + nodeWidth + toLayout.x) / 2 - 96,
                    ),
                  );
                  const labelTop = Math.max(
                    12,
                    Math.min(
                      graphLayout.height - 34,
                      (fromLayout.y + toLayout.y) / 2 + nodeHeight / 2 - 14,
                    ),
                  );

                  return (
                    <button
                      key={edge.id}
                      type="button"
                      className={cn(
                        "absolute z-20 max-w-48 truncate rounded-full border bg-background/95 px-2.5 py-1 text-[11px] font-medium shadow-xs transition-colors hover:bg-background",
                        edgeTone.text,
                        isRouteEdge && "border-primary/50 bg-primary/10 shadow-sm",
                        hasSelectedStageRoute && !isRouteEdge && "opacity-45",
                      )}
                      style={{
                        left: labelLeft,
                        top: labelTop,
                      }}
	                      title={edgeDisplayText}
                      onClick={() => saveGraph({ activeNodeId: edge.toNodeId })}
                    >
                      {edgeDisplayText}
                    </button>
                  );
                })}

	                {graphLayout.nodes.map((layoutNode, index) => {
	                  const node = layoutNode.node;
	                  const isActive = activeNode?.id === node.id;
                    const isRouteNode = selectedStageRouteNodeIds.has(node.id);

	                  return (
                    <button
                      key={node.id}
                      type="button"
                      className={cn(
                        "absolute z-30 flex flex-col overflow-hidden rounded-md border px-2 py-2 text-left shadow-sm transition-colors hover:bg-background",
                        getNodeTone(node),
                        isRouteNode && "ring-2 ring-primary/30",
                        isActive && "ring-2 ring-primary/45",
                        hasSelectedStageRoute && !isRouteNode && "opacity-60",
                      )}
                      style={{
                        left: layoutNode.x,
                        top: layoutNode.y,
                        width: nodeWidth,
                        height: nodeHeight,
                      }}
                      onClick={() => saveGraph({ activeNodeId: node.id })}
                    >
                      <div className="flex h-full min-w-0 flex-col justify-center gap-1">
                        <div className="flex min-w-0 items-center gap-2">
                          <span className="flex size-5 shrink-0 items-center justify-center rounded-sm border bg-background/70 text-[11px] font-medium text-muted-foreground">
                            {index + 1}
                          </span>
                          <div className="min-w-0 flex-1 truncate text-sm font-medium leading-5">
                            {node.title || emptyValueText}
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-1 pl-7">
                          <span className="shrink-0 rounded-sm bg-background/80 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                            {getStoryPathRoleLabel(node)}
                          </span>
                          {node.type !== "normal" && (
                          <span className="shrink-0 rounded-sm bg-background/80 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                            {getStoryNodeTypeLabel(node)}
                          </span>
                          )}
                        </div>
                      </div>
	                    </button>
                  );
                })}
              </div>
            </div>

            <div className="border-t bg-background/55 px-3 py-2">
              <div className="flex min-w-0 flex-wrap items-center gap-2 text-xs">
                <span className="font-medium text-muted-foreground">推荐路线</span>
                {defaultRouteNodes.map((node, index) => (
                  <span key={node.id} className="contents">
                    {index > 0 && <ArrowRight className="size-3 text-muted-foreground" />}
                    <button
                      type="button"
                      className={cn(
                        "max-w-36 truncate rounded-md border bg-background/80 px-2 py-1 text-xs transition-colors hover:border-primary/40",
                        activeNode?.id === node.id && "border-primary/50 text-primary",
                      )}
                      onClick={() => saveGraph({ activeNodeId: node.id })}
                    >
                      {node.title || emptyValueText}
                    </button>
                  </span>
                ))}
                {defaultRouteNodes.length === 0 && (
                  <span className="text-muted-foreground">{emptyValueText}</span>
                )}
              </div>
            </div>
          </div>

          <aside className="min-h-[24rem] rounded-lg border bg-background/70 p-3">
            {activeNode ? (
              <div className="flex h-full min-h-0 flex-col">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-xs font-medium text-muted-foreground">节点详情</div>
                    <h3 className="mt-2 truncate text-xl font-semibold leading-7">
                      {activeNode.title || emptyValueText}
                    </h3>
                  </div>
                  <EditorStatusPill tone={activeNode.status === "ready" ? "active" : "muted"}>
                    {getStoryNodeStatusLabel(activeNode)}
                  </EditorStatusPill>
                </div>

                <div className="mt-3 flex flex-wrap gap-1.5">
                  <span className="rounded-md bg-muted px-2 py-1 text-xs text-muted-foreground">
                    {activeNode.id === graph.entryNodeId ? "默认入口" : "普通节点"}
                  </span>
                  <span className="rounded-md bg-muted px-2 py-1 text-xs text-muted-foreground">
                    {getStoryNodeTypeLabel(activeNode)}
                  </span>
                  <span className="rounded-md bg-muted px-2 py-1 text-xs text-muted-foreground">
                    {getStoryPathRoleLabel(activeNode)}
                  </span>
                </div>

	                <div className="mt-4 space-y-2">
	                  <div className="rounded-md border bg-muted/15 p-3">
	                    <div className="text-xs font-medium text-muted-foreground">场景描述</div>
	                    <div className="mt-1 line-clamp-4 text-sm leading-6">
	                      {activeNodeScene?.scene?.trim() || emptyValueText}
	                    </div>
	                  </div>
	                  <div className="rounded-md border bg-muted/15 p-3">
	                    <div className="text-xs font-medium text-muted-foreground">场景目标</div>
	                    <div className="mt-1 line-clamp-3 text-sm leading-6">
	                      {activeNodeScene?.sceneGoal?.trim() || emptyValueText}
	                    </div>
	                  </div>
	                  <div className="rounded-md border bg-muted/15 p-3">
	                    <div className="text-xs font-medium text-muted-foreground">场景角色</div>
	                    <div className="mt-2">
	                      {renderSceneAvatarStack(activeNodeScene)}
	                    </div>
	                  </div>
	                  <div className="grid grid-cols-2 gap-2">
                    <div className="rounded-md border bg-muted/15 p-3">
                      <div className="text-xs font-medium text-muted-foreground">出口分支</div>
                      <div className="mt-1 text-lg font-semibold">{outgoingEdges.length}</div>
                    </div>
                    <div className="rounded-md border bg-muted/15 p-3">
                      <div className="text-xs font-medium text-muted-foreground">入口分支</div>
                      <div className="mt-1 text-lg font-semibold">{incomingEdges.length}</div>
                    </div>
                  </div>
	                </div>

                <div className="mt-auto grid gap-2 pt-4">
                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className={editorPrimaryActionButtonClassName}
                      disabled={data.locked}
                      onClick={() => openSceneEditorForNode(activeNode)}
                    >
                      <Pencil className="size-3.5" />
                      编辑场景
                    </Button>
                    <Button
                      type="button"
	                      size="sm"
	                      variant="outline"
	                      className={editorQuietActionButtonClassName}
	                      disabled={data.locked || activeNode.type !== "normal"}
                      onClick={() => createNextNode(activeNode)}
                    >
                      <Plus className="size-3.5" />
                      新增节点
                    </Button>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className={editorQuietActionButtonClassName}
                    disabled={data.locked}
                    onClick={() => setEditingNodeId(activeNode.id)}
                  >
                    <Pencil className="size-3.5" />
                    编辑节点
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex h-full min-h-64 flex-col items-center justify-center rounded-md border border-dashed bg-muted/15 px-4 text-center">
                <MapIcon className="size-7 text-muted-foreground" />
                <div className="mt-3 text-sm font-medium">还没有选中节点</div>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  新建入口节点，或在结构图中点击一个节点查看详情。
                </p>
              </div>
            )}
          </aside>
        </div>
      </EditorSection>

      <Dialog
        open={Boolean(editingNode)}
        onOpenChange={(open) => {
          if (!open) {
            setEditingNodeId(null);
          }
        }}
      >
        {editingNode && (
          <EditorFormDialogContent className="sm:max-w-6xl">
            <EditorFormHeader
              icon={Pencil}
              title="编辑节点"
              description="编辑节点内容，以及入口/出口分支关系。"
            />
            <EditorFormLayout>
              <div className="space-y-4">
                <div className="grid gap-3 md:grid-cols-3">
                  <EditorField label="节点标题" htmlFor="story-node-dialog-title">
                    <Input
                      id="story-node-dialog-title"
                      value={editingNode.title}
                      className={editorControlClassName}
                      disabled={data.locked}
                      onChange={(event) => updateNode(editingNode.id, { title: event.target.value })}
                    />
                  </EditorField>
                  <EditorField label="节点类型" htmlFor="story-node-dialog-type">
                    <NativeSelect
                      id="story-node-dialog-type"
                      value={editingNode.type}
                      className={editorControlClassName}
                      disabled={data.locked}
                      onChange={(event) => updateNode(editingNode.id, {
                        type: event.target.value as TavernStoryNode["type"],
                      })}
                    >
                      <NativeSelectOption value="normal">普通</NativeSelectOption>
                      <NativeSelectOption value="failure">失败</NativeSelectOption>
                      <NativeSelectOption value="ending">结局</NativeSelectOption>
                    </NativeSelect>
                  </EditorField>
                  <EditorField label="路径角色" htmlFor="story-node-dialog-path-role">
                    <NativeSelect
                      id="story-node-dialog-path-role"
                      value={editingNode.pathRole}
                      className={editorControlClassName}
                      disabled={data.locked}
                      onChange={(event) => {
                        const pathRole = event.target.value as TavernStoryNode["pathRole"];
                        if (pathRole === "main" && !canNodeUseMainPathRole(graph, editingNode)) {
                          return;
                        }
                        updateNode(editingNode.id, { pathRole });
                      }}
                    >
                      <NativeSelectOption value="main" disabled={!canEditingNodeChooseMain}>
                        主线
                      </NativeSelectOption>
                      <NativeSelectOption value="branch">支线</NativeSelectOption>
                    </NativeSelect>
                  </EditorField>
                </div>

                <div className="grid gap-3 xl:grid-cols-2">
                  <section className="rounded-md border bg-background/70 p-3">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 text-sm font-medium">
                        <ArrowRight className="size-4 text-primary" />
                        出口分支
                      </div>
                      <Button
                        type="button"
                        size="xs"
                        variant="outline"
                        className={editorQuietActionButtonClassName}
                        disabled={data.locked || editingNode.type !== "normal"}
                        onClick={() => createNextNode(editingNode)}
                      >
                        <Plus className="size-3" />
                        新增节点
                      </Button>
                    </div>
                    <div className="space-y-2">
                      {graph.edges
                        .filter((edge) => edge.fromNodeId === editingNode.id)
                        .map((edge) => renderEdgeEditor(edge, "outgoing"))}
                      {graph.edges.every((edge) => edge.fromNodeId !== editingNode.id) && (
                        <div className="rounded-md border bg-muted/15 px-3 py-4 text-center text-xs text-muted-foreground">
                          暂无出口分支。
                        </div>
                      )}
                    </div>
                  </section>

                  <section className="rounded-md border bg-background/70 p-3">
                    <div className="mb-2 flex items-center gap-2 text-sm font-medium">
                      <GitBranch className="size-4 text-primary" />
                      入口分支
                    </div>
                    <div className="space-y-2">
                      {graph.edges
                        .filter((edge) => edge.toNodeId === editingNode.id)
                        .map((edge) => renderEdgeEditor(edge, "incoming"))}
                      {graph.edges.every((edge) => edge.toNodeId !== editingNode.id) && (
                        <div className="rounded-md border bg-muted/15 px-3 py-4 text-center text-xs text-muted-foreground">
                          暂无入口分支。
                        </div>
                      )}
                    </div>
                  </section>
                </div>
              </div>
            </EditorFormLayout>
            <EditorFormFooter status="修改会立即保存到剧情结构。">
              <Button
                type="button"
                variant="outline"
                className={editorDangerActionButtonClassName}
                disabled={data.locked || editingNode.id === graph.entryNodeId || graph.nodes.length <= 1}
                onClick={() => onRequestDangerAction({
	                  title: "删除剧情节点",
	                  description: `删除节点「${editingNode.title}」？绑定场景、相关入口和出口分支也会一起移除。`,
                  confirmLabel: "删除节点",
                  onConfirm: () => {
                    deleteNode(editingNode.id);
                    setEditingNodeId(null);
                  },
                })}
              >
                <Trash2 className="size-3.5" />
                删除节点
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => setEditingNodeId(null)}
              >
                关闭
              </Button>
            </EditorFormFooter>
          </EditorFormDialogContent>
        )}
      </Dialog>
    </div>
  );
};
