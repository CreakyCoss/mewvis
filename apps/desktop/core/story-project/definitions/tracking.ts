import { field } from "./fields.js";
import { defineDocumentModels, defineObjectModels, entityDocument } from "./model.js";

export const TRACKING_OBJECTS = defineObjectModels([
  {
    id: "foreshadow",
    label: "伏笔",
    fields: [
      field.id("id", "伏笔 ID", {
        required: true,
        immutable: true,
      }),
      field.textarea("content", "伏笔内容", {
        description: "要埋设的事实、意象、信息差或未兑现承诺",
        required: true,
      }),
      field.select("status", "生命周期状态", {
        required: true,
        options: [
          {
            value: "planned",
            label: "已计划",
          },
          {
            value: "planted",
            label: "已埋设",
          },
          {
            value: "advanced",
            label: "已推进",
          },
          {
            value: "resolved",
            label: "已回收",
          },
          {
            value: "expired",
            label: "已失效",
          },
          {
            value: "abandoned",
            label: "已放弃",
          },
        ],
      }),
      field.select("importance", "重要程度", {
        required: true,
        options: [
          {
            value: "high",
            label: "高",
          },
          {
            value: "medium",
            label: "中",
          },
          {
            value: "low",
            label: "低",
          },
        ],
      }),
      field.reference("plannedPlantChapterId", "计划埋设章节", {
        required: false,
        targetKinds: ["story-chapter-plan"],
      }),
      field.reference("plantedChapterId", "实际埋设章节", {
        required: false,
        targetKinds: ["story-chapter"],
      }),
      field.reference("expectedResolveChapterId", "预计回收章节", {
        required: false,
        targetKinds: ["story-chapter-plan"],
      }),
      field.reference("resolvedChapterId", "实际回收章节", {
        required: false,
        targetKinds: ["story-chapter"],
      }),
      field.referenceList("relatedEntityIds", "关联对象", {
        required: true,
        targetKinds: ["story-character", "story-world-entry", "story-chapter-plan", "story-chapter"],
        default: [],
      }),
      field.textarea("resolution", "回收结果", {
        description: "伏笔如何兑现、改变了什么认知或剧情状态",
        required: true,
        default: "",
      }),
    ],
  },
  {
    id: "timeline-entry",
    label: "时间线事件",
    fields: [
      field.id("id", "事件 ID", {
        required: true,
        immutable: true,
      }),
      field.reference("chapterId", "发生章节", {
        required: true,
        targetKinds: ["story-chapter"],
      }),
      field.text("storyTime", "故事内时间", {
        required: true,
      }),
      field.textarea("event", "事件", {
        required: true,
      }),
      field.referenceList("participantIds", "参与角色", {
        required: true,
        targetKinds: ["story-character"],
        default: [],
      }),
      field.referenceList("worldRefIds", "相关设定", {
        required: true,
        targetKinds: ["story-world-entry"],
        default: [],
      }),
      field.text("plotLine", "所属剧情线", {
        required: true,
      }),
    ],
  },
]);

export const TRACKING_DOCUMENTS = defineDocumentModels([
  entityDocument({
    kind: "story-character-state",
    label: "角色状态",
    contentType: "json",
    cardinality: "many",
    fields: [
      field.reference("characterId", "角色", {
        required: true,
        targetKinds: ["story-character"],
      }),
      field.reference("asOfChapterId", "截至章节", {
        required: false,
        targetKinds: ["story-chapter"],
      }),
      field.textarea("identity", "当前身份", {
        required: true,
      }),
      field.text("location", "当前位置", {
        required: true,
      }),
      field.textarea("physicalState", "身体状态", {
        required: true,
      }),
      field.stringList("abilities", "当前能力", {
        required: true,
        default: [],
      }),
      field.stringList("relationshipStates", "关系状态", {
        required: true,
        default: [],
      }),
      field.stringList("knowledge", "已知信息", {
        required: true,
        default: [],
      }),
      field.textarea("publicImage", "公开形象", {
        required: true,
      }),
      field.stringList("openThreads", "未解决事项", {
        required: true,
        default: [],
      }),
      field.collection("recentChanges", "近期变化", {
        required: true,
        itemDefinition: "recent-character-change",
        default: [],
      }),
    ],
    ruleIds: ["reference.missing"],
  }),
  entityDocument({
    kind: "story-foreshadows",
    label: "伏笔追踪",
    description: "统一维护伏笔的计划、埋设、推进、回收和放弃状态",
    contentType: "json",
    cardinality: "one",
    fields: [
      field.collection("foreshadows", "伏笔", {
        required: true,
        itemDefinition: "foreshadow",
        default: [],
      }),
    ],
    ruleIds: ["foreshadow.resolution", "reference.missing"],
  }),
  entityDocument({
    kind: "story-timeline",
    label: "时间线",
    contentType: "json",
    cardinality: "many",
    fields: [
      field.textarea("calendar", "历法说明", {
        required: true,
      }),
      field.text("openingTime", "故事开场时间", {
        required: true,
      }),
      field.text("currentTime", "当前时间", {
        required: true,
      }),
      field.collection("entries", "时间线事件", {
        required: true,
        itemDefinition: "timeline-entry",
        default: [],
      }),
    ],
    ruleIds: ["reference.missing"],
  }),
  entityDocument({
    kind: "story-progress",
    label: "创作进度",
    contentType: "json",
    cardinality: "one",
    fields: [
      field.reference("lastCompletedChapterId", "最后完成章节", {
        required: false,
        targetKinds: ["story-chapter"],
      }),
      field.integer("totalWrittenWords", "累计字数", {
        required: true,
        minimum: 0,
        default: 0,
      }),
      field.reference("currentVolumeId", "当前分卷", {
        required: false,
        targetKinds: ["story-volume"],
      }),
      field.reference("nextChapterPlanId", "下一章细纲", {
        required: false,
        targetKinds: ["story-chapter-plan"],
      }),
      field.referenceList("recentChapterIds", "最近章节", {
        required: true,
        targetKinds: ["story-chapter"],
        default: [],
      }),
      field.stringList("notes", "进度备注", {
        required: true,
        default: [],
      }),
    ],
    ruleIds: ["reference.missing"],
  }),
]);
