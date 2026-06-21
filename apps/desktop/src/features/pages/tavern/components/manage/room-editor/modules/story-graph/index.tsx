import {
  ArrowRight,
  GitBranch,
  Map as MapIcon,
  MoreVertical,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import { useState } from "react";
import { resolveAgentAvatar } from "@/assets/agent-avatars";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
} from "../../../../../types";
import {
  EditorField,
  EditorFormDialogContent,
  EditorFormFooter,
  EditorFormHeader,
  EditorFormLayout,
  EditorSection,
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

const nodeMinWidth = 100;
const nodeMaxWidth = 176;
const nodeHeight = 58;
const nodeColumnGap = 210;
const nodeLaneGap = 18;
const graphPaddingX = 48;
const graphPaddingY = 24;
const graphMinHeight = 280;

type StoryGraphLayoutNode = {
  node: TavernStoryNode;
  x: number;
  y: number;
  width: number;
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
  if (node.pathRole === "main") {
    return "主线";
  }
  return "支线";
};

const getStoryPathRoleBadgeClassName = (node: TavernStoryNode) => (
  node.pathRole === "main"
    ? "border-primary/25 bg-primary/10 text-primary"
    : "border-sky-400/25 bg-sky-500/10 text-sky-700 dark:text-sky-300"
);

const getStoryNodeTypeBadgeClassName = (node: TavernStoryNode) => {
  if (node.type === "failure") {
    return "border-red-400/25 bg-red-500/10 text-red-700 dark:text-red-300";
  }
  if (node.type === "ending") {
    return "border-amber-400/30 bg-amber-500/10 text-amber-700 dark:text-amber-300";
  }
  return "border-muted bg-muted text-muted-foreground";
};

const entryStoryBadgeClassName = "border-emerald-400/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300";
const storyDetailMetaClassName = "text-[11px] font-medium leading-4 text-muted-foreground";
const storyDetailTitleClassName = "truncate text-[13px] font-semibold leading-5 text-foreground";
const storyDetailBadgeClassName = "rounded-sm border px-1 py-0.5 text-[9px] font-medium leading-3.5";
const storyDetailCardClassName = "rounded-md border bg-muted/15 p-2.5";
const storyDetailBodyClassName = "mt-1 text-xs leading-5 text-foreground/85";

const getStoryTextVisualWidth = (text: string, unitWidth: number) => {
  return Array.from(text).reduce(
    (width, character) => width + (/^[\x00-\x7F]$/.test(character) ? unitWidth * 0.58 : unitWidth),
    0,
  );
};

const getStoryNodeCardWidth = (
  graph: TavernRoom["storyGraph"],
  node: TavernStoryNode,
) => {
  const title = node.title.trim() || emptyValueText;
  const titleWidth = 64 + getStoryTextVisualWidth(title, 13);
  const badgeLabels = [
    node.id === graph.entryNodeId ? "入口" : "",
    getStoryPathRoleLabel(node),
    node.type !== "normal" ? getStoryNodeTypeLabel(node) : "",
  ].filter(Boolean);
  const badgeWidth = 36 + badgeLabels.reduce(
    (width, label, index) => width + getStoryTextVisualWidth(label, 9) + 10 + (index > 0 ? 4 : 0),
    0,
  );

  return Math.min(
    nodeMaxWidth,
    Math.max(nodeMinWidth, Math.ceil(titleWidth), Math.ceil(badgeWidth)),
  );
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

type StoryGraphRouteKind = "ending" | "failure" | "open";

type StoryGraphRouteCandidate = {
  edgeIds: string[];
  kind: StoryGraphRouteKind;
};

type StoryGraphPreviousRouteCandidate = {
  edgeIds: string[];
  reachesEntry: boolean;
};

const getStoryGraphRouteKindRank = (kind: StoryGraphRouteKind) => {
  if (kind === "ending") {
    return 2;
  }
  if (kind === "failure") {
    return 1;
  }
  return 0;
};

const isBetterStoryRouteCandidate = (
  candidate: StoryGraphRouteCandidate,
  current: StoryGraphRouteCandidate | null,
) => {
  if (!current) {
    return true;
  }

  const candidateRank = getStoryGraphRouteKindRank(candidate.kind);
  const currentRank = getStoryGraphRouteKindRank(current.kind);
  if (candidateRank !== currentRank) {
    return candidateRank > currentRank;
  }

  return candidate.edgeIds.length > current.edgeIds.length;
};

const isBetterPreviousStoryRouteCandidate = (
  candidate: StoryGraphPreviousRouteCandidate,
  current: StoryGraphPreviousRouteCandidate | null,
) => {
  if (!current) {
    return true;
  }
  if (candidate.reachesEntry !== current.reachesEntry) {
    return candidate.reachesEntry;
  }

  return candidate.edgeIds.length > current.edgeIds.length;
};

const buildSelectedStoryRouteEdgeIds = (
  graph: TavernRoom["storyGraph"],
  startNodeId: string | undefined,
) => {
  if (!startNodeId) {
    return new Set<string>();
  }

  const nodeById = new Map(graph.nodes.map((node) => [node.id, node]));
  const edgesBySourceNodeId = new Map<string, TavernStoryEdge[]>();
  const edgesByTargetNodeId = new Map<string, TavernStoryEdge[]>();
  const sortedEdges = [...graph.edges].sort((left, right) =>
    Number(right.isDefault) - Number(left.isDefault) ||
    left.priority - right.priority ||
    left.createdAt - right.createdAt
  );
  sortedEdges.forEach((edge) => {
    const sourceEdges = edgesBySourceNodeId.get(edge.fromNodeId) ?? [];
    sourceEdges.push(edge);
    edgesBySourceNodeId.set(edge.fromNodeId, sourceEdges);

    const targetEdges = edgesByTargetNodeId.get(edge.toNodeId) ?? [];
    targetEdges.push(edge);
    edgesByTargetNodeId.set(edge.toNodeId, targetEdges);
  });

  const walkPreviousRoute = (
    nodeId: string,
    visitedNodeIds: Set<string>,
    edgeIds: string[],
  ): StoryGraphPreviousRouteCandidate => {
    if (visitedNodeIds.has(nodeId)) {
      return { edgeIds, reachesEntry: false };
    }
    if (nodeId === graph.entryNodeId) {
      return { edgeIds, reachesEntry: true };
    }

    const incomingEdges = edgesByTargetNodeId.get(nodeId) ?? [];
    if (incomingEdges.length === 0) {
      return { edgeIds, reachesEntry: false };
    }

    const nextVisitedNodeIds = new Set(visitedNodeIds);
    nextVisitedNodeIds.add(nodeId);

    let bestCandidate: StoryGraphPreviousRouteCandidate | null = null;
    incomingEdges.forEach((edge) => {
      const candidate = walkPreviousRoute(
        edge.fromNodeId,
        nextVisitedNodeIds,
        [edge.id, ...edgeIds],
      );
      if (isBetterPreviousStoryRouteCandidate(candidate, bestCandidate)) {
        bestCandidate = candidate;
      }
    });

    return bestCandidate ?? { edgeIds, reachesEntry: false };
  };

  const walkRoute = (
    nodeId: string,
    visitedNodeIds: Set<string>,
    edgeIds: string[],
  ): StoryGraphRouteCandidate => {
    if (visitedNodeIds.has(nodeId)) {
      return { edgeIds, kind: "open" };
    }

    const node = nodeById.get(nodeId);
    if (!node) {
      return { edgeIds, kind: "open" };
    }
    if (node.type === "ending") {
      return { edgeIds, kind: "ending" };
    }
    if (node.type === "failure") {
      return { edgeIds, kind: "failure" };
    }

    const outgoingEdges = edgesBySourceNodeId.get(nodeId) ?? [];
    if (outgoingEdges.length === 0) {
      return { edgeIds, kind: "open" };
    }

    const nextVisitedNodeIds = new Set(visitedNodeIds);
    nextVisitedNodeIds.add(nodeId);

    let bestCandidate: StoryGraphRouteCandidate | null = null;
    outgoingEdges.forEach((edge) => {
      const candidate = walkRoute(
        edge.toNodeId,
        nextVisitedNodeIds,
        [...edgeIds, edge.id],
      );
      if (isBetterStoryRouteCandidate(candidate, bestCandidate)) {
        bestCandidate = candidate;
      }
    });

    return bestCandidate ?? { edgeIds, kind: "open" };
  };

  return new Set([
    ...walkPreviousRoute(startNodeId, new Set(), []).edgeIds,
    ...walkRoute(startNodeId, new Set(), []).edgeIds,
  ]);
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

  const layoutNodes: StoryGraphLayoutNode[] = [];
  const laneCountByDepth = new Map<number, number>();
  let maxLaneCount = 1;
  let maxNodeRight = graphPaddingX + nodeMinWidth;

  sortByOrder(graph.nodes)
    .sort((left, right) =>
      (depthByNodeId.get(left.id) ?? 0) - (depthByNodeId.get(right.id) ?? 0) ||
      (left.position?.y ?? 0) - (right.position?.y ?? 0) ||
      (left.createdAt ?? 0) - (right.createdAt ?? 0)
    )
    .forEach((node) => {
      const depth = depthByNodeId.get(node.id) ?? 0;
      const lane = laneCountByDepth.get(depth) ?? 0;
      const width = getStoryNodeCardWidth(graph, node);
      const x = graphPaddingX + depth * nodeColumnGap;
      const y = graphPaddingY + lane * (nodeHeight + nodeLaneGap);
      laneCountByDepth.set(depth, lane + 1);
      maxLaneCount = Math.max(maxLaneCount, lane + 1);
      maxNodeRight = Math.max(maxNodeRight, x + width);

      layoutNodes.push({
        node,
        depth,
        x,
        y,
        width,
      });
  });

  const width = Math.max(760, maxNodeRight + graphPaddingX);
  const height = Math.max(
    graphMinHeight,
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
  const editingNode = editingNodeId
    ? graph.nodes.find((node) => node.id === editingNodeId) ?? null
    : null;

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

  const createInitialNode = () => {
    const createdAt = now();
    const scene = createSceneForStoryNode("入口节点", createdAt);
    const node: TavernStoryNode = {
      id: createLocalId("node"),
      stageId: graph.stages[0]?.id ?? "",
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

  const requestDeleteNode = (node: TavernStoryNode) => {
    if (data.locked || node.id === graph.entryNodeId || graph.nodes.length <= 1) {
      return;
    }

    onRequestDangerAction({
      title: "删除剧情节点",
      description: `删除节点「${node.title}」？绑定场景、相关入口和出口分支也会一起移除。`,
      confirmLabel: "删除节点",
      onConfirm: () => {
        deleteNode(node.id);
        if (editingNodeId === node.id) {
          setEditingNodeId(null);
        }
      },
    });
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

  const selectStoryNode = (nodeId: string) => {
    saveGraph({ activeNodeId: nodeId });
  };

  const outgoingEdges = activeNode
    ? graph.edges.filter((edge) => edge.fromNodeId === activeNode.id)
    : [];
  const incomingEdges = activeNode
    ? graph.edges.filter((edge) => edge.toNodeId === activeNode.id)
    : [];
  const incomingReasonText = activeNode?.id === graph.entryNodeId || incomingEdges.length === 0
    ? "默认进入"
    : incomingEdges
        .map((edge) => edge.reason?.trim() || edge.label?.trim())
        .filter((text): text is string => Boolean(text))
        .join(" / ") || "默认进入";
  const graphLayout = buildStoryGraphLayout(graph);
  const selectedRouteEdgeIds = buildSelectedStoryRouteEdgeIds(graph, activeNode?.id);
  const getSceneCharacters = (scene: TavernScene | null | undefined) =>
    (scene?.characterIds ?? [])
      .map((characterId) => roomCharacterById.get(characterId))
      .filter((character): character is TavernCharacter => Boolean(character));
  const renderSceneAvatarStack = (
    scene: TavernScene | null | undefined,
    maxVisible = 4,
    showCount = true,
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
        {showCount && (
          <span className="text-xs text-muted-foreground">
            {formatCount(sceneCharacters.length, "角色")}
          </span>
        )}
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
        description="选中节点后新增节点；同一节点多次新增即形成分支。"
        meta={`${formatCount(graph.nodes.length, "节点")} · ${formatCount(graph.edges.length, "分支")}`}
        action={graph.nodes.length === 0 ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className={editorHeaderActionButtonClassName}
            disabled={data.locked}
            onClick={createInitialNode}
          >
            <Plus className="size-3.5" />
            新增入口节点
          </Button>
        ) : null}
      >
        <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_18rem]">
          <div className="flex min-h-[18rem] overflow-hidden rounded-lg border bg-muted/10">
            <div className="min-h-0 flex-1 overflow-auto">
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
                    <marker id="story-edge-arrow-primary" markerWidth="8" markerHeight="8" refX="7.25" refY="4" orient="auto" markerUnits="userSpaceOnUse">
                      <path d="M 0 0 L 8 4 L 0 8 z" className="fill-primary" />
                    </marker>
                    <marker id="story-edge-arrow-sky" markerWidth="8" markerHeight="8" refX="7.25" refY="4" orient="auto" markerUnits="userSpaceOnUse">
                      <path d="M 0 0 L 8 4 L 0 8 z" className="fill-sky-400" />
                    </marker>
                    <marker id="story-edge-arrow-red" markerWidth="8" markerHeight="8" refX="7.25" refY="4" orient="auto" markerUnits="userSpaceOnUse">
                      <path d="M 0 0 L 8 4 L 0 8 z" className="fill-red-400" />
                    </marker>
                    <marker id="story-edge-arrow-amber" markerWidth="8" markerHeight="8" refX="7.25" refY="4" orient="auto" markerUnits="userSpaceOnUse">
                      <path d="M 0 0 L 8 4 L 0 8 z" className="fill-amber-400" />
                    </marker>
                  </defs>
                  {graph.edges.map((edge) => {
                    const fromLayout = graphLayout.nodeById.get(edge.fromNodeId);
                    const toLayout = graphLayout.nodeById.get(edge.toNodeId);
                    if (!fromLayout || !toLayout) {
                      return null;
                    }

                    const startX = fromLayout.x + fromLayout.width;
                    const startY = fromLayout.y + nodeHeight / 2;
                    const endX = toLayout.x;
                    const endY = toLayout.y + nodeHeight / 2;
                    const bend = Math.max(40, Math.abs(endX - startX) / 2);
                    const path = endX > startX
                      ? `M ${startX} ${startY} C ${startX + bend} ${startY}, ${endX - bend} ${endY}, ${endX} ${endY}`
                      : `M ${startX} ${startY} C ${startX + 48} ${startY}, ${endX - 48} ${endY}, ${endX} ${endY}`;
                    const edgeTone = getEdgeVisualTone(edge, toLayout.node);
                    const isSelectedRouteEdge = selectedRouteEdgeIds.has(edge.id);

                    return (
                      <path
                        key={edge.id}
                        d={path}
                        className={cn(
                          "fill-none transition-opacity",
                          isSelectedRouteEdge ? "stroke-[2.25]" : "stroke-[1.75]",
                          edgeTone.stroke,
                        )}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeDasharray={isSelectedRouteEdge ? undefined : "6 6"}
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
                  const isSelectedRouteEdge = selectedRouteEdgeIds.has(edge.id);
                  const edgeDisplayText = edge.reason?.trim() || edge.label?.trim() || "继续";
                  const lineMidY = (fromLayout.y + toLayout.y) / 2 + nodeHeight / 2;
                  const labelLeft = Math.max(
                    16,
                    Math.min(
                      graphLayout.width - 128,
                      (fromLayout.x + fromLayout.width + toLayout.x) / 2 - 56,
                    ),
                  );
                  const labelTop = Math.max(
                    8,
                    Math.min(
                      graphLayout.height - 24,
                      lineMidY - 28,
                    ),
                  );

                  return (
                    <button
                      key={edge.id}
                      type="button"
                      className={cn(
                        "absolute z-20 w-28 truncate px-1 text-center text-[11px] font-medium leading-5 transition-opacity hover:underline",
                        edgeTone.text,
                        isSelectedRouteEdge && "font-semibold",
                      )}
                      style={{
                        left: labelLeft,
                        top: labelTop,
                      }}
	                      title={edgeDisplayText}
                      onClick={() => selectStoryNode(edge.toNodeId)}
                    >
                      {edgeDisplayText}
                    </button>
                  );
                })}

	                {graphLayout.nodes.map((layoutNode, index) => {
                  const node = layoutNode.node;
                  const isActive = activeNode?.id === node.id;

	                  return (
                    <div
                      key={node.id}
                      role="button"
                      tabIndex={0}
                      className={cn(
                        "absolute z-30 flex cursor-pointer flex-col overflow-hidden rounded-md border px-2 py-1.5 text-left shadow-sm transition-colors hover:bg-background",
                        getNodeTone(node),
                        isActive && "ring-2 ring-primary/45",
                      )}
                      style={{
                        left: layoutNode.x,
                        top: layoutNode.y,
                        width: layoutNode.width,
                        height: nodeHeight,
                      }}
                      onClick={() => selectStoryNode(node.id)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          selectStoryNode(node.id);
                        }
                      }}
                    >
                      <div className="flex h-full min-w-0 flex-col justify-center gap-0.5">
                        <div className="flex min-w-0 items-center gap-1.5">
                          <span className="flex size-4 shrink-0 items-center justify-center rounded-sm border bg-background/70 text-[10px] font-medium text-muted-foreground">
                            {index + 1}
                          </span>
                          <div className="min-w-0 flex-1 truncate text-[13px] font-medium leading-5">
                            {node.title || emptyValueText}
                          </div>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <button
                                type="button"
                                className="flex h-4 w-3 shrink-0 items-center justify-center rounded-sm bg-white/45 text-muted-foreground ring-1 ring-border/30 transition-colors hover:bg-white/75 hover:text-foreground focus-visible:ring-2 focus-visible:ring-primary/25 focus-visible:outline-none data-[state=open]:bg-white/75 data-[state=open]:text-foreground"
                                title="节点操作"
                                aria-label={`${node.title || "节点"} 操作`}
                                onClick={(event) => event.stopPropagation()}
                                onPointerDown={(event) => event.stopPropagation()}
                              >
                                <MoreVertical className="size-2" />
                              </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent
                              align="end"
                              className="flex w-auto min-w-0 gap-1 p-1"
                            >
                              <DropdownMenuItem
                                className="flex size-7 items-center justify-center rounded-md p-0"
                                title="编辑节点"
                                aria-label="编辑节点"
                                disabled={data.locked}
                                onSelect={() => {
                                  selectStoryNode(node.id);
                                  setEditingNodeId(node.id);
                                }}
                              >
                                <Pencil className="size-3.5" />
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                variant="destructive"
                                className="flex size-7 items-center justify-center rounded-md p-0"
                                title="删除节点"
                                aria-label="删除节点"
                                disabled={data.locked || node.id === graph.entryNodeId || graph.nodes.length <= 1}
                                onSelect={() => requestDeleteNode(node)}
                              >
                                <Trash2 className="size-3.5" />
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                        <div className="flex flex-wrap gap-1 pl-5">
                          {node.id === graph.entryNodeId && (
                            <span className={cn(
                              "shrink-0 rounded-sm border px-1 py-0.5 text-[9px] font-medium",
                              entryStoryBadgeClassName,
                            )}>
                              入口
                            </span>
                          )}
                          <span className={cn(
                            "shrink-0 rounded-sm border px-1 py-0.5 text-[9px] font-medium",
                            getStoryPathRoleBadgeClassName(node),
                          )}>
                            {getStoryPathRoleLabel(node)}
                          </span>
                          {node.type !== "normal" && (
                            <span className={cn(
                              "shrink-0 rounded-sm border px-1 py-0.5 text-[9px] font-medium",
                              getStoryNodeTypeBadgeClassName(node),
                            )}>
                              {getStoryNodeTypeLabel(node)}
                            </span>
                          )}
                        </div>
                      </div>
	                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          <aside className="min-h-[18rem] rounded-lg border bg-background/70 p-3">
            {activeNode ? (
              <div className="flex h-full min-h-0 flex-col">
                <div className="min-w-0">
                  <div className={storyDetailMetaClassName}>节点详情</div>
                  <div className="mt-1.5 flex min-w-0 flex-wrap items-center gap-1.5">
                    <h3 className={cn("max-w-40", storyDetailTitleClassName)}>
                      {activeNode.title || emptyValueText}
                    </h3>
                    {activeNode.id === graph.entryNodeId && (
                      <span className={cn(
                        storyDetailBadgeClassName,
                        entryStoryBadgeClassName,
                      )}>
                        入口
                      </span>
                    )}
                    {outgoingEdges.length > 1 ? (
                      <span className={cn(
                        storyDetailBadgeClassName,
                        "border-primary/25 bg-primary/10 text-primary",
                      )}>
                        分支点
                      </span>
                    ) : (
                      <span className={cn(
                        storyDetailBadgeClassName,
                        getStoryPathRoleBadgeClassName(activeNode),
                      )}>
                        {getStoryPathRoleLabel(activeNode)}
                      </span>
                    )}
                    {activeNode.type !== "normal" && (
                      <span className={cn(
                        storyDetailBadgeClassName,
                        getStoryNodeTypeBadgeClassName(activeNode),
                      )}>
                        {getStoryNodeTypeLabel(activeNode)}
                      </span>
                    )}
                  </div>
                </div>

                <div className="mt-3 space-y-2">
                  <div className={storyDetailCardClassName}>
                    <div className={storyDetailMetaClassName}>场景描述</div>
                    <div className={cn("line-clamp-4", storyDetailBodyClassName)}>
                      {activeNodeScene?.scene?.trim() || emptyValueText}
                    </div>
                  </div>
                  <div className={storyDetailCardClassName}>
                    <div className={storyDetailMetaClassName}>场景目标</div>
                    <div className={cn("line-clamp-3", storyDetailBodyClassName)}>
                      {activeNodeScene?.sceneGoal?.trim() || emptyValueText}
                    </div>
                  </div>
                  <div className={storyDetailCardClassName}>
                    <div className={storyDetailMetaClassName}>进入条件</div>
                    <div className={cn("line-clamp-2", storyDetailBodyClassName)}>
                      {incomingReasonText}
                    </div>
                  </div>
                  <div className="grid grid-cols-[minmax(0,0.9fr)_minmax(0,1.25fr)] gap-2">
                    <div className={storyDetailCardClassName}>
                      <div className={storyDetailMetaClassName}>出口分支</div>
                      <div className="mt-1 text-base font-semibold leading-6 text-foreground">
                        {outgoingEdges.length}
                        <span className="ml-1 text-xs font-medium text-muted-foreground">条</span>
                      </div>
                    </div>
                    <div className={storyDetailCardClassName}>
                      <div className={storyDetailMetaClassName}>关联角色</div>
                      <div className="mt-2">
                        {renderSceneAvatarStack(activeNodeScene, 4, false)}
                      </div>
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
                </div>
              </div>
            ) : (
              <div className="flex h-full min-h-56 flex-col items-center justify-center rounded-md border border-dashed bg-muted/15 px-4 text-center">
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
