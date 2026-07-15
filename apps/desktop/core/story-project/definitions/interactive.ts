import { field } from "./fields.js";
import { defineDocumentModels, defineObjectModels, entityDocument } from "./model.js";

export const INTERACTIVE_OBJECTS = defineObjectModels([
  {
    id: "graph-edge",
    label: "剧情连接",
    fields: [
      field.id("id", "连接 ID", {
        required: true,
        immutable: true,
      }),
      field.reference("fromNodeId", "起点", {
        required: true,
        targetObjectDefinitions: ["graph-node"],
      }),
      field.reference("toNodeId", "终点", {
        required: true,
        targetObjectDefinitions: ["graph-node"],
      }),
      field.text("label", "选项文本", {
        required: true,
      }),
      field.textarea("reason", "连接原因", {
        required: false,
      }),
      field.boolean("isDefault", "默认路径", {
        required: false,
        default: false,
      }),
      field.integer("priority", "优先级", {
        required: true,
      }),
    ],
  },
  {
    id: "graph-node",
    label: "剧情节点",
    fields: [
      field.id("id", "节点 ID", {
        required: true,
        immutable: true,
      }),
      field.reference("sceneId", "场景", {
        required: false,
        targetKinds: ["story-scene"],
      }),
      field.text("title", "节点标题", {
        required: true,
      }),
      field.text("type", "节点类型", {
        required: true,
      }),
      field.text("pathRole", "路径作用", {
        required: true,
      }),
      field.text("status", "状态", {
        required: false,
      }),
    ],
  },
  {
    id: "scene-status",
    label: "场景状态",
    fields: [
      field.text("location", "地点", {
        required: false,
      }),
      field.text("timeLabel", "时间", {
        required: false,
      }),
      field.text("weather", "天气", {
        required: false,
      }),
      field.textarea("atmosphere", "氛围", {
        required: false,
      }),
      field.text("scenePhase", "场景阶段", {
        required: false,
      }),
      field.textarea("immediateThreat", "即时威胁", {
        required: false,
      }),
    ],
  },
]);

export const INTERACTIVE_DOCUMENTS = defineDocumentModels([
  entityDocument({
    kind: "story-scene",
    label: "互动场景",
    contentType: "json",
    cardinality: "many",
    fields: [
      field.text("title", "场景标题", {
        required: true,
      }),
      field.textarea("scene", "场景描述", {
        required: true,
      }),
      field.textarea("goal", "场景目标", {
        required: true,
      }),
      field.textarea("plot", "剧情内容", {
        required: true,
      }),
      field.textarea("direction", "推进方向", {
        required: true,
      }),
      field.textarea("transition", "转场", {
        required: true,
      }),
      field.textarea("memory", "场景记忆", {
        required: true,
      }),
      field.object("status", "场景状态", {
        required: false,
        definition: "scene-status",
      }),
    ],
  }),
  entityDocument({
    kind: "story-graph",
    label: "互动剧情图",
    contentType: "json",
    cardinality: "one",
    fields: [
      field.collection("nodes", "节点", {
        required: true,
        itemDefinition: "graph-node",
        default: [],
      }),
      field.collection("edges", "连接", {
        required: true,
        itemDefinition: "graph-edge",
        default: [],
      }),
    ],
    ruleIds: ["graph.nodes", "graph.edges", "reference.missing"],
  }),
]);
