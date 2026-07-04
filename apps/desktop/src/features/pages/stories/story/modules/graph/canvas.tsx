import { BookOpen, Map as MapIcon, MoreVertical, Pencil, Plus, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { StoryJson, StoryEdgeJson, StoryNodeJson, StorySceneJson, StoryStageJson } from "../../model/types";
import { cn } from "@/lib/utils";
import { createStoryScene, createStoryStage, formatCount } from "../../../components/story-form-utils";
import {
  EmptyBlock,
  StorySection,
  editorHeaderActionButtonClassName,
  editorPrimaryActionButtonClassName,
  editorQuietActionButtonClassName,
  emptyValueText,
} from "../../../components/story-primitives";
import type { StoryModuleSave } from "../types";
import { StoryGraphNodeEditDialog } from "./edit";

type StoryGraphModuleProps = {
  story: StoryJson;
  onSave: StoryModuleSave;
  onOpenScenes?: () => void;
};

type StoryGraph = StoryJson["graph"];

type StoryGraphLayoutNode = {
  depth: number;
  node: StoryNodeJson;
  width: number;
  x: number;
  y: number;
};

type StoryGraphLayout = {
  height: number;
  nodeById: Map<string, StoryGraphLayoutNode>;
  nodes: StoryGraphLayoutNode[];
  width: number;
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

const nodeMinWidth = 100;
const nodeMaxWidth = 176;
const nodeHeight = 58;
const nodeColumnGap = 210;
const nodeLaneGap = 18;
const graphPaddingX = 48;
const graphPaddingY = 24;
const graphMinHeight = 280;

const entryStoryBadgeClassName = "border-emerald-400/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300";
const storyDetailMetaClassName = "text-[11px] font-medium leading-4 text-muted-foreground";
const storyDetailTitleClassName = "truncate text-[13px] font-semibold leading-5 text-foreground";
const storyDetailBadgeClassName = "rounded-sm border px-1 py-0.5 text-[9px] font-medium leading-3.5";
const storyDetailCardClassName = "rounded-md border bg-muted/15 p-2.5";
const storyDetailBodyClassName = "mt-1 text-xs leading-5 text-foreground/85";

const createLocalId = (prefix: string) => `${prefix}-${crypto.randomUUID()}`;

const now = () => Date.now();

const getNodeTone = (node: StoryNodeJson) => {
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

const isNormalNode = (node: StoryNodeJson | null | undefined) =>
  !node || node.type === "normal" || node.type.trim() === "";

const getStoryNodeTypeLabel = (node: StoryNodeJson) => {
  if (node.type === "failure") {
    return "失败";
  }
  if (node.type === "ending") {
    return "终局";
  }
  return "普通";
};

const getStoryPathRoleLabel = (node: StoryNodeJson) => {
  if (node.pathRole === "main") {
    return "主线";
  }
  return "支线";
};

const getStoryPathRoleBadgeClassName = (node: StoryNodeJson) =>
  node.pathRole === "main"
    ? "border-primary/25 bg-primary/10 text-primary"
    : "border-sky-400/25 bg-sky-500/10 text-sky-700 dark:text-sky-300";

const getStoryNodeTypeBadgeClassName = (node: StoryNodeJson) => {
  if (node.type === "failure") {
    return "border-red-400/25 bg-red-500/10 text-red-700 dark:text-red-300";
  }
  if (node.type === "ending") {
    return "border-amber-400/30 bg-amber-500/10 text-amber-700 dark:text-amber-300";
  }
  return "border-muted bg-muted text-muted-foreground";
};

const getStoryTextVisualWidth = (text: string, unitWidth: number) =>
  Array.from(text).reduce(
    (width, character) => width + (/^[\x00-\x7F]$/.test(character) ? unitWidth * 0.58 : unitWidth),
    0,
  );

const getStoryNodeCardWidth = (graph: StoryGraph, node: StoryNodeJson) => {
  const title = node.title.trim() || emptyValueText;
  const titleWidth = 64 + getStoryTextVisualWidth(title, 13);
  const badgeLabels = [
    node.id === graph.entryNodeId ? "入口" : "",
    getStoryPathRoleLabel(node),
    node.type !== "normal" ? getStoryNodeTypeLabel(node) : "",
  ].filter(Boolean);
  const badgeWidth =
    36 +
    badgeLabels.reduce(
      (width, label, index) => width + getStoryTextVisualWidth(label, 9) + 10 + (index > 0 ? 4 : 0),
      0,
    );

  return Math.min(nodeMaxWidth, Math.max(nodeMinWidth, Math.ceil(titleWidth), Math.ceil(badgeWidth)));
};

const getEdgeVisualTone = (edge: StoryEdgeJson, targetNode: StoryNodeJson | undefined) => {
  if (targetNode?.type === "failure") {
    return {
      markerId: "story-edge-arrow-red",
      stroke: "stroke-red-400",
      text: "text-red-700 dark:text-red-300",
    };
  }
  if (targetNode?.type === "ending") {
    return {
      markerId: "story-edge-arrow-amber",
      stroke: "stroke-amber-400",
      text: "text-amber-700 dark:text-amber-300",
    };
  }
  if (!edge.isDefault || targetNode?.pathRole === "branch") {
    return {
      markerId: "story-edge-arrow-sky",
      stroke: "stroke-sky-400",
      text: "text-sky-700 dark:text-sky-300",
    };
  }
  return {
    markerId: "story-edge-arrow-primary",
    stroke: "stroke-primary",
    text: "text-primary",
  };
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

const isBetterStoryRouteCandidate = (candidate: StoryGraphRouteCandidate, current: StoryGraphRouteCandidate | null) => {
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

const sortEdgesForRoute = (edges: StoryEdgeJson[]) =>
  [...edges].sort(
    (left, right) =>
      Number(right.isDefault) - Number(left.isDefault) ||
      left.priority - right.priority ||
      left.label.localeCompare(right.label),
  );

const buildSelectedStoryRouteEdgeIds = (graph: StoryGraph, startNodeId: string | undefined) => {
  if (!startNodeId) {
    return new Set<string>();
  }

  const nodeById = new Map(graph.nodes.map((node) => [node.id, node]));
  const edgesBySourceNodeId = new Map<string, StoryEdgeJson[]>();
  const edgesByTargetNodeId = new Map<string, StoryEdgeJson[]>();
  sortEdgesForRoute(graph.edges).forEach((edge) => {
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
      const candidate = walkPreviousRoute(edge.fromNodeId, nextVisitedNodeIds, [edge.id, ...edgeIds]);
      if (isBetterPreviousStoryRouteCandidate(candidate, bestCandidate)) {
        bestCandidate = candidate;
      }
    });

    return bestCandidate ?? { edgeIds, reachesEntry: false };
  };

  const walkRoute = (nodeId: string, visitedNodeIds: Set<string>, edgeIds: string[]): StoryGraphRouteCandidate => {
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
      const candidate = walkRoute(edge.toNodeId, nextVisitedNodeIds, [...edgeIds, edge.id]);
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

const canNodeUseMainPathRole = (graph: StoryGraph, node: StoryNodeJson) => {
  if (node.id === graph.entryNodeId) {
    return true;
  }

  const parentEdge = sortEdgesForRoute(graph.edges.filter((edge) => edge.toNodeId === node.id))[0];
  const parentNode = parentEdge ? graph.nodes.find((item) => item.id === parentEdge.fromNodeId) : null;
  if (!parentNode || parentNode.pathRole !== "main") {
    return false;
  }

  return graph.edges
    .filter((edge) => edge.fromNodeId === parentNode.id && edge.toNodeId !== node.id)
    .every((edge) => graph.nodes.find((item) => item.id === edge.toNodeId)?.pathRole !== "main");
};

const buildStoryGraphLayout = (graph: StoryGraph): StoryGraphLayout => {
  const edgesByPriority = [...graph.edges].sort(
    (left, right) => left.priority - right.priority || left.label.localeCompare(right.label),
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
    if (!depthByNodeId.has(node.id)) {
      depthByNodeId.set(node.id, index);
    }
  });

  const nodeIndexById = new Map(graph.nodes.map((node, index) => [node.id, index]));
  const stageOrderById = new Map(graph.stages.map((stage, index) => [stage.id, stage.order ?? index]));
  const layoutNodes: StoryGraphLayoutNode[] = [];
  const laneCountByDepth = new Map<number, number>();
  let maxLaneCount = 1;
  let maxNodeRight = graphPaddingX + nodeMinWidth;

  [...graph.nodes]
    .sort(
      (left, right) =>
        (depthByNodeId.get(left.id) ?? 0) - (depthByNodeId.get(right.id) ?? 0) ||
        (stageOrderById.get(left.stageId) ?? 0) - (stageOrderById.get(right.stageId) ?? 0) ||
        (nodeIndexById.get(left.id) ?? 0) - (nodeIndexById.get(right.id) ?? 0),
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
        depth,
        node,
        width,
        x,
        y,
      });
    });

  const width = Math.max(760, maxNodeRight + graphPaddingX);
  const height = Math.max(
    graphMinHeight,
    graphPaddingY * 2 + maxLaneCount * nodeHeight + (maxLaneCount - 1) * nodeLaneGap,
  );
  const nodeById = new Map(layoutNodes.map((item) => [item.node.id, item]));

  return {
    height,
    nodeById,
    nodes: layoutNodes,
    width,
  };
};

const getNodeScene = (story: StoryJson, node: StoryNodeJson | null | undefined) =>
  node?.sceneId ? (story.scenes.find((scene) => scene.id === node.sceneId) ?? null) : null;

const getStageForNode = (stages: StoryStageJson[], node: StoryNodeJson | null | undefined) =>
  node ? (stages.find((stage) => stage.id === node.stageId) ?? null) : null;

const createSceneForStoryNode = (story: StoryJson, title: string): StorySceneJson => ({
  ...createStoryScene(story.scenes.length),
  title: title.trim() || `节点场景 ${story.scenes.length + 1}`,
  scene: "新的剧情节点等待配置。",
});

const ensureStoryStage = (story: StoryJson) => {
  const fallbackStage = story.graph.stages[0] ?? createStoryStage(0);
  return {
    stage: fallbackStage,
    stages: story.graph.stages.length > 0 ? story.graph.stages : [fallbackStage],
  };
};

export const StoryGraphModule = ({ story, onSave, onOpenScenes }: StoryGraphModuleProps) => {
  const graph = story.graph;
  const activeNode =
    graph.nodes.find((node) => node.id === graph.activeNodeId) ??
    graph.nodes.find((node) => node.id === graph.entryNodeId) ??
    graph.nodes[0] ??
    null;
  const activeNodeScene = getNodeScene(story, activeNode);
  const activeNodeStage = getStageForNode(graph.stages, activeNode);
  const [editingNodeId, setEditingNodeId] = useState<string | null>(null);
  const [pendingDeleteNode, setPendingDeleteNode] = useState<StoryNodeJson | null>(null);
  const editingNode = editingNodeId ? (graph.nodes.find((node) => node.id === editingNodeId) ?? null) : null;

  const saveStory = (nextStory: StoryJson) => {
    onSave({
      ...nextStory,
      updatedAt: now(),
    });
  };

  const saveGraph = (patch: Partial<StoryGraph>) => {
    const nextGraph = {
      ...graph,
      ...patch,
    };
    saveStory({
      ...story,
      graph: nextGraph,
    });
  };

  const createInitialNode = () => {
    const { stage, stages } = ensureStoryStage(story);
    const scene = createSceneForStoryNode(story, "入口节点");
    const node: StoryNodeJson = {
      id: createLocalId("story-node"),
      stageId: stage.id,
      sceneId: scene.id,
      title: "入口节点",
      type: "normal",
      pathRole: "main",
      status: "ready",
    };

    saveStory({
      ...story,
      scenes: [...story.scenes, scene],
      graph: {
        ...graph,
        stages,
        nodes: [...graph.nodes, node],
        entryNodeId: graph.entryNodeId || node.id,
        activeNodeId: node.id,
      },
    });
  };

  const createNextNode = (sourceNode: StoryNodeJson | null) => {
    if (!sourceNode) {
      if (graph.nodes.length === 0) {
        createInitialNode();
      }
      return;
    }
    if (!isNormalNode(sourceNode)) {
      return;
    }

    const { stages } = ensureStoryStage(story);
    const outgoingCount = graph.edges.filter((edge) => edge.fromNodeId === sourceNode.id).length;
    const isDefaultPath = outgoingCount === 0;
    const nodeTitle = isDefaultPath ? `节点 ${graph.nodes.length + 1}` : `分支 ${outgoingCount + 1}`;
    const scene = createSceneForStoryNode(story, nodeTitle);
    const node: StoryNodeJson = {
      id: createLocalId("story-node"),
      stageId: sourceNode.stageId || stages[0]?.id || "",
      sceneId: scene.id,
      title: nodeTitle,
      type: "normal",
      pathRole: isDefaultPath && sourceNode.pathRole === "main" ? "main" : "branch",
      status: "ready",
    };
    const edge: StoryEdgeJson = {
      id: createLocalId("story-edge"),
      fromNodeId: sourceNode.id,
      toNodeId: node.id,
      label: isDefaultPath ? "继续" : `分支 ${outgoingCount + 1}`,
      reason: "",
      isDefault: isDefaultPath,
      priority: outgoingCount,
    };

    saveStory({
      ...story,
      scenes: [...story.scenes, scene],
      graph: {
        ...graph,
        stages,
        nodes: [...graph.nodes, node],
        edges: [...graph.edges, edge],
        activeNodeId: node.id,
      },
    });
  };

  const updateNode = (nodeId: string, patch: Partial<StoryNodeJson>) => {
    const nextNodes = graph.nodes.map((node) => {
      if (node.id !== nodeId) {
        return node;
      }

      const requestedPathRole =
        patch.pathRole === "main" && !canNodeUseMainPathRole(graph, node) ? "branch" : patch.pathRole;
      const nextSceneId = patch.sceneId ?? node.sceneId;

      return {
        ...node,
        ...patch,
        ...(requestedPathRole ? { pathRole: requestedPathRole } : {}),
        status: patch.status ?? (nextSceneId ? "ready" : "draft"),
      };
    });

    saveGraph({
      nodes: nextNodes,
      edges:
        patch.type && patch.type !== "normal" ? graph.edges.filter((edge) => edge.fromNodeId !== nodeId) : graph.edges,
    });
  };

  const createMissingSceneForNode = (node: StoryNodeJson) => {
    if (node.sceneId) {
      return;
    }

    const scene = createSceneForStoryNode(story, node.title);
    saveStory({
      ...story,
      scenes: [...story.scenes, scene],
      graph: {
        ...graph,
        activeNodeId: node.id,
        nodes: graph.nodes.map((item) =>
          item.id === node.id
            ? {
                ...item,
                title: item.title.trim() ? item.title : scene.title,
                sceneId: scene.id,
                status: "ready",
              }
            : item,
        ),
      },
    });
  };

  const openSceneEditorForNode = (node: StoryNodeJson) => {
    if (!node.sceneId) {
      createMissingSceneForNode(node);
    }
    onOpenScenes?.();
  };

  const deleteNode = (nodeId: string) => {
    if (graph.nodes.length <= 1 || nodeId === graph.entryNodeId) {
      return;
    }

    const deletedNode = graph.nodes.find((node) => node.id === nodeId);
    const nextNodes = graph.nodes.filter((node) => node.id !== nodeId);
    const nextActiveNodeId =
      graph.activeNodeId === nodeId ? (nextNodes[0]?.id ?? graph.entryNodeId) : graph.activeNodeId;
    const shouldRemoveScene = deletedNode?.sceneId
      ? !nextNodes.some((node) => node.sceneId === deletedNode.sceneId)
      : false;
    const nextScenes =
      shouldRemoveScene && deletedNode?.sceneId
        ? story.scenes.filter((scene) => scene.id !== deletedNode.sceneId)
        : story.scenes;

    saveStory({
      ...story,
      scenes: nextScenes,
      graph: {
        ...graph,
        nodes: nextNodes,
        edges: graph.edges.filter((edge) => edge.fromNodeId !== nodeId && edge.toNodeId !== nodeId),
        activeNodeId: nextActiveNodeId,
      },
    });
  };

  const requestDeleteNode = (node: StoryNodeJson) => {
    if (node.id === graph.entryNodeId || graph.nodes.length <= 1) {
      return;
    }

    setPendingDeleteNode(node);
  };

  const confirmDeleteNode = () => {
    if (!pendingDeleteNode) {
      return;
    }

    deleteNode(pendingDeleteNode.id);
    if (editingNodeId === pendingDeleteNode.id) {
      setEditingNodeId(null);
    }
    setPendingDeleteNode(null);
  };

  const updateEdge = (edgeId: string, patch: Partial<StoryEdgeJson>) => {
    const originalEdge = graph.edges.find((item) => item.id === edgeId);
    if (!originalEdge) {
      return;
    }
    if (patch.fromNodeId) {
      const nextSourceNode = graph.nodes.find((node) => node.id === patch.fromNodeId);
      if (!isNormalNode(nextSourceNode)) {
        return;
      }
    }

    const patchedEdge = {
      ...originalEdge,
      ...patch,
    };
    let edges = graph.edges.map((item) => (item.id === edgeId ? patchedEdge : item));

    if (patch.isDefault) {
      edges = edges.map((item) =>
        item.fromNodeId === patchedEdge.fromNodeId ? { ...item, isDefault: item.id === edgeId } : item,
      );
    }

    if (patch.fromNodeId && patch.fromNodeId !== originalEdge.fromNodeId) {
      const hasOtherDefaultForNewSource = edges.some(
        (item) => item.id !== edgeId && item.fromNodeId === patchedEdge.fromNodeId && item.isDefault,
      );
      edges = edges.map((item) =>
        item.id === edgeId
          ? {
              ...item,
              isDefault: hasOtherDefaultForNewSource ? false : true,
            }
          : item,
      );

      const oldSourceEdges = edges
        .filter((item) => item.fromNodeId === originalEdge.fromNodeId)
        .sort((left, right) => left.priority - right.priority || left.label.localeCompare(right.label));
      if (oldSourceEdges.length > 0 && oldSourceEdges.every((item) => !item.isDefault)) {
        const nextDefaultEdgeId = oldSourceEdges[0]?.id;
        edges = edges.map((item) => (item.id === nextDefaultEdgeId ? { ...item, isDefault: true } : item));
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

  const outgoingEdges = activeNode ? graph.edges.filter((edge) => edge.fromNodeId === activeNode.id) : [];
  const incomingEdges = activeNode ? graph.edges.filter((edge) => edge.toNodeId === activeNode.id) : [];
  const incomingReasonText =
    activeNode?.id === graph.entryNodeId || incomingEdges.length === 0
      ? "默认进入"
      : incomingEdges
          .map((edge) => edge.reason?.trim() || edge.label?.trim())
          .filter((text): text is string => Boolean(text))
          .join(" / ") || "默认进入";
  const graphLayout = useMemo(() => buildStoryGraphLayout(graph), [graph]);
  const selectedRouteEdgeIds = useMemo(
    () => buildSelectedStoryRouteEdgeIds(graph, activeNode?.id),
    [activeNode?.id, graph],
  );
  const canEditingNodeChooseMain = editingNode
    ? editingNode.pathRole === "main" || canNodeUseMainPathRole(graph, editingNode)
    : false;

  return (
    <>
      <StorySection
        icon={MapIcon}
        title="故事结构"
        description="选中节点后新增节点；同一节点多次新增即形成分支。"
        meta={`${formatCount(graph.nodes.length, "节点")} · ${formatCount(graph.edges.length, "分支")}`}
        action={
          graph.nodes.length === 0 ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className={editorHeaderActionButtonClassName}
              onClick={createInitialNode}
            >
              <Plus className="size-3.5" />
              新增入口节点
            </Button>
          ) : null
        }
      >
        {graph.nodes.length === 0 ? (
          <EmptyBlock text="暂无剧情节点" />
        ) : (
          <div className="grid gap-3 2xl:grid-cols-[minmax(0,1fr)_18rem]">
            <div className="flex min-h-[18rem] overflow-hidden rounded-lg border bg-muted/10">
              <div className="min-h-0 flex-1 overflow-auto">
                <div
                  className="relative"
                  style={{
                    height: graphLayout.height,
                    width: graphLayout.width,
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
                      <marker
                        id="story-edge-arrow-primary"
                        markerWidth="8"
                        markerHeight="8"
                        refX="7.25"
                        refY="4"
                        orient="auto"
                        markerUnits="userSpaceOnUse"
                      >
                        <path d="M 0 0 L 8 4 L 0 8 z" className="fill-primary" />
                      </marker>
                      <marker
                        id="story-edge-arrow-sky"
                        markerWidth="8"
                        markerHeight="8"
                        refX="7.25"
                        refY="4"
                        orient="auto"
                        markerUnits="userSpaceOnUse"
                      >
                        <path d="M 0 0 L 8 4 L 0 8 z" className="fill-sky-400" />
                      </marker>
                      <marker
                        id="story-edge-arrow-red"
                        markerWidth="8"
                        markerHeight="8"
                        refX="7.25"
                        refY="4"
                        orient="auto"
                        markerUnits="userSpaceOnUse"
                      >
                        <path d="M 0 0 L 8 4 L 0 8 z" className="fill-red-400" />
                      </marker>
                      <marker
                        id="story-edge-arrow-amber"
                        markerWidth="8"
                        markerHeight="8"
                        refX="7.25"
                        refY="4"
                        orient="auto"
                        markerUnits="userSpaceOnUse"
                      >
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
                      const path =
                        endX > startX
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
                      Math.min(graphLayout.width - 128, (fromLayout.x + fromLayout.width + toLayout.x) / 2 - 56),
                    );
                    const labelTop = Math.max(8, Math.min(graphLayout.height - 24, lineMidY - 28));

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
                          height: nodeHeight,
                          left: layoutNode.x,
                          top: layoutNode.y,
                          width: layoutNode.width,
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
                              <DropdownMenuContent align="end" className="flex w-auto min-w-0 gap-1 p-1">
                                <DropdownMenuItem
                                  className="flex size-7 items-center justify-center rounded-md p-0"
                                  title="编辑节点"
                                  aria-label="编辑节点"
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
                                  disabled={node.id === graph.entryNodeId || graph.nodes.length <= 1}
                                  onSelect={() => requestDeleteNode(node)}
                                >
                                  <Trash2 className="size-3.5" />
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                          <div className="flex flex-wrap gap-1 pl-5">
                            {node.id === graph.entryNodeId ? (
                              <span
                                className={cn(
                                  "shrink-0 rounded-sm border px-1 py-0.5 text-[9px] font-medium",
                                  entryStoryBadgeClassName,
                                )}
                              >
                                入口
                              </span>
                            ) : null}
                            <span
                              className={cn(
                                "shrink-0 rounded-sm border px-1 py-0.5 text-[9px] font-medium",
                                getStoryPathRoleBadgeClassName(node),
                              )}
                            >
                              {getStoryPathRoleLabel(node)}
                            </span>
                            {node.type !== "normal" ? (
                              <span
                                className={cn(
                                  "shrink-0 rounded-sm border px-1 py-0.5 text-[9px] font-medium",
                                  getStoryNodeTypeBadgeClassName(node),
                                )}
                              >
                                {getStoryNodeTypeLabel(node)}
                              </span>
                            ) : null}
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
                      {activeNode.id === graph.entryNodeId ? (
                        <span className={cn(storyDetailBadgeClassName, entryStoryBadgeClassName)}>入口</span>
                      ) : null}
                      {outgoingEdges.length > 1 ? (
                        <span className={cn(storyDetailBadgeClassName, "border-primary/25 bg-primary/10 text-primary")}>
                          分支点
                        </span>
                      ) : (
                        <span className={cn(storyDetailBadgeClassName, getStoryPathRoleBadgeClassName(activeNode))}>
                          {getStoryPathRoleLabel(activeNode)}
                        </span>
                      )}
                      {activeNode.type !== "normal" ? (
                        <span className={cn(storyDetailBadgeClassName, getStoryNodeTypeBadgeClassName(activeNode))}>
                          {getStoryNodeTypeLabel(activeNode)}
                        </span>
                      ) : null}
                    </div>
                  </div>

                  <div className="mt-3 space-y-2">
                    <div className={storyDetailCardClassName}>
                      <div className={storyDetailMetaClassName}>所属阶段</div>
                      <div className={cn("line-clamp-2", storyDetailBodyClassName)}>
                        {activeNodeStage?.title?.trim() || emptyValueText}
                      </div>
                    </div>
                    <div className={storyDetailCardClassName}>
                      <div className={storyDetailMetaClassName}>场景描述</div>
                      <div className={cn("line-clamp-4", storyDetailBodyClassName)}>
                        {activeNodeScene?.scene?.trim() || emptyValueText}
                      </div>
                    </div>
                    <div className={storyDetailCardClassName}>
                      <div className={storyDetailMetaClassName}>场景目标</div>
                      <div className={cn("line-clamp-3", storyDetailBodyClassName)}>
                        {activeNodeScene?.goal?.trim() || emptyValueText}
                      </div>
                    </div>
                    <div className={storyDetailCardClassName}>
                      <div className={storyDetailMetaClassName}>进入条件</div>
                      <div className={cn("line-clamp-2", storyDetailBodyClassName)}>{incomingReasonText}</div>
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
                        <div className={storyDetailMetaClassName}>故事角色</div>
                        <div className="mt-1 text-base font-semibold leading-6 text-foreground">
                          {story.characters.length}
                          <span className="ml-1 text-xs font-medium text-muted-foreground">位</span>
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
                        onClick={() => openSceneEditorForNode(activeNode)}
                      >
                        <BookOpen className="size-3.5" />
                        场景
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className={editorQuietActionButtonClassName}
                        disabled={!isNormalNode(activeNode)}
                        onClick={() => createNextNode(activeNode)}
                      >
                        <Plus className="size-3.5" />
                        新增
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
        )}
      </StorySection>

      <StoryGraphNodeEditDialog
        canChooseMainPath={canEditingNodeChooseMain}
        node={editingNode}
        open={Boolean(editingNode)}
        story={story}
        onCreateNextNode={createNextNode}
        onDeleteEdge={deleteEdge}
        onOpenChange={(open) => {
          if (!open) {
            setEditingNodeId(null);
          }
        }}
        onUpdateEdge={updateEdge}
        onUpdateNode={updateNode}
      />
      <AlertDialog open={Boolean(pendingDeleteNode)} onOpenChange={(open) => !open && setPendingDeleteNode(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除节点？</AlertDialogTitle>
            <AlertDialogDescription>
              删除节点「{pendingDeleteNode?.title || pendingDeleteNode?.id || "当前节点"}」？关联分支也会一起移除。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={confirmDeleteNode}>
              删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};
