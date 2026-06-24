import type { TavernRoom } from "../../../types";
import {
  escapePromptXmlText,
  limitPromptText,
} from "../shared/text";

const limitEscapedPromptText = (text: string, maxChars?: number) =>
  escapePromptXmlText(maxChars ? limitPromptText(text, maxChars) : text);

export const formatTavernStoryGraphContext = (
  room: TavernRoom,
  {
    maxEdges,
    maxSummaryChars,
  }: {
    maxEdges?: number;
    maxSummaryChars?: number;
  } = {},
) => {
  const graph = room.storyGraph;
  if (!graph?.nodes?.length) {
    return "";
  }
  const activeNode = graph.nodes.find((node) => node.id === graph.activeNodeId) ??
    graph.nodes.find((node) => node.id === graph.entryNodeId) ??
    graph.nodes[0];
  if (!activeNode) {
    return "";
  }

  const stage = graph.stages.find((item) => item.id === activeNode.stageId);
  const scene = activeNode.sceneId
    ? room.scenes?.find((item) => item.id === activeNode.sceneId)
    : null;
  const incoming = graph.edges
    .filter((edge) => edge.toNodeId === activeNode.id)
    .slice(0, maxEdges ?? 6);
  const outgoing = graph.edges
    .filter((edge) => edge.fromNodeId === activeNode.id)
    .slice(0, maxEdges ?? 6);
  const getNodeTitle = (nodeId: string) =>
    escapePromptXmlText(graph.nodes.find((node) => node.id === nodeId)?.title ?? nodeId);

  return [
    `current_node: ${escapePromptXmlText(activeNode.title)}`,
    `stage: ${escapePromptXmlText(stage?.title ?? "未分组")}`,
    `node_type: ${escapePromptXmlText(activeNode.type)}`,
    `path_role: ${escapePromptXmlText(activeNode.pathRole)}`,
    scene ? `scene: ${escapePromptXmlText(activeNode.title)}` : "scene: 未绑定",
    scene?.scene
      ? `scene_description: ${limitEscapedPromptText(scene.scene, maxSummaryChars)}`
      : "",
    scene?.sceneGoal
      ? `scene_goal: ${limitEscapedPromptText(scene.sceneGoal, maxSummaryChars)}`
      : "",
    incoming.length > 0
      ? [
          "incoming_edges:",
          ...incoming.map((edge, index) =>
            `${index + 1}. ${getNodeTitle(edge.fromNodeId)} -> ${escapePromptXmlText(edge.label)}`
          ),
        ].join("\n")
      : "incoming_edges: 无",
    outgoing.length > 0
      ? [
          "available_exits:",
          ...outgoing.map((edge, index) =>
            `${index + 1}. ${escapePromptXmlText(edge.label)} -> ${getNodeTitle(edge.toNodeId)}${edge.isDefault ? "（默认）" : ""}`
          ),
        ].join("\n")
      : "available_exits: 无",
  ].filter(Boolean).join("\n");
};
