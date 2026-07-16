import { defineDocumentModels, defineObjectModels, documentModel, entityDocument } from "../model/document.js";
import { field } from "../model/fields.js";

export const OUTLINE_OBJECTS = defineObjectModels([
  {
    id: "chapter-beat",
    label: "章节节拍",
    fields: [
      field.id("id", "节拍 ID", {
        required: true,
        immutable: true,
      }),
      field.textarea("summary", "事件摘要", {
        required: true,
      }),
      field.select("function", "叙事功能", {
        required: true,
        options: [
          {
            value: "setup",
            label: "铺垫",
          },
          {
            value: "progress",
            label: "推进",
          },
          {
            value: "information-reveal",
            label: "信息揭示",
          },
          {
            value: "characterization",
            label: "人物塑造",
          },
          {
            value: "relationship-change",
            label: "关系变化",
          },
          {
            value: "foreshadow",
            label: "伏笔埋设",
          },
          {
            value: "payoff",
            label: "伏笔回收",
          },
          {
            value: "reversal",
            label: "反转",
          },
          {
            value: "climax",
            label: "高潮",
          },
          {
            value: "transition",
            label: "过渡",
          },
          {
            value: "other",
            label: "其他",
          },
        ],
      }),
      field.select("density", "信息密度", {
        required: true,
        options: [
          {
            value: "dense",
            label: "高",
          },
          {
            value: "medium",
            label: "中",
          },
          {
            value: "sparse",
            label: "低",
          },
        ],
      }),
      field.integer("wordBudget", "字数预算", {
        required: true,
        minimum: 0,
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
    ],
  },
  {
    id: "chapter-ending",
    label: "章节结尾设计",
    fields: [
      field.textarea("resolvedState", "已解决状态", {
        required: true,
      }),
      field.textarea("unresolvedQuestion", "未解决问题", {
        required: true,
      }),
      field.textarea("nextDrive", "下一章驱动力", {
        required: true,
      }),
      field.text("hookType", "钩子类型", {
        required: true,
      }),
      field.select("hookStrength", "钩子强度", {
        required: true,
        options: [
          {
            value: "strong",
            label: "强",
          },
          {
            value: "medium",
            label: "中",
          },
          {
            value: "weak",
            label: "弱",
          },
          {
            value: "none",
            label: "无",
          },
        ],
      }),
    ],
  },
  {
    id: "chapter-plan-summary",
    label: "章节五段摘要",
    fields: [
      field.textarea("cause", "起因", {
        required: true,
      }),
      field.textarea("development", "发展", {
        required: true,
      }),
      field.textarea("turn", "转折", {
        required: true,
      }),
      field.textarea("climax", "高潮", {
        required: true,
      }),
      field.textarea("ending", "结尾", {
        required: true,
      }),
    ],
  },
  {
    id: "chapter-state-changes",
    label: "章节状态变化",
    fields: [
      field.referenceList("characterIds", "变化角色", {
        required: true,
        targetKinds: ["story-character"],
        default: [],
      }),
      field.referenceList("relationshipIds", "变化关系", {
        required: true,
        targetObjectDefinitions: ["relationship"],
        default: [],
      }),
      field.referenceList("foreshadowIds", "变化伏笔", {
        required: true,
        targetObjectDefinitions: ["foreshadow"],
        default: [],
      }),
      field.referenceList("timelineEntryIds", "时间线事件", {
        required: true,
        targetObjectDefinitions: ["timeline-entry"],
        default: [],
      }),
    ],
  },
  {
    id: "plot-lines",
    label: "剧情线",
    fields: [
      field.textarea("main", "主线", {
        required: true,
      }),
      field.textarea("secondary", "副线", {
        required: true,
      }),
      field.textarea("event", "事件线", {
        required: true,
      }),
      field.textarea("relationship", "关系线", {
        required: true,
      }),
      field.textarea("logic", "因果链", {
        required: true,
      }),
    ],
  },
  {
    id: "emotional-arc-point",
    label: "情绪节点",
    fields: [
      field.text("label", "节点名称", {
        required: true,
      }),
      field.number("intensity", "情绪强度", {
        required: true,
        minimum: 0,
        maximum: 10,
      }),
      field.reference("chapterRef", "章节引用", {
        required: false,
        targetKinds: ["story-chapter-plan", "story-chapter"],
      }),
      field.textarea("cause", "形成原因", {
        required: true,
      }),
    ],
  },
  {
    id: "plot-module",
    label: "剧情模块",
    fields: [
      field.id("id", "模块 ID", {
        required: true,
        immutable: true,
      }),
      field.text("name", "模块名称", {
        required: true,
      }),
      field.textarea("function", "叙事功能", {
        required: true,
      }),
      field.textarea("setup", "铺垫方式", {
        required: true,
      }),
      field.textarea("payoff", "兑现方式", {
        required: true,
      }),
      field.textarea("reusablePattern", "可复用模式", {
        required: true,
      }),
      field.stringList("evidence", "证据", {
        required: true,
        default: [],
      }),
    ],
  },
]);

export const OUTLINE_DOCUMENTS = defineDocumentModels([
  entityDocument({
    kind: "story-book-arc",
    label: "全书主线",
    contentFormat: "structured",
    cardinality: "one",
    fields: [
      field.integer("totalChapters", "总章节数", {
        required: true,
        minimum: 0,
        default: 0,
      }),
      field.integer("targetWords", "目标字数", {
        required: true,
        minimum: 0,
        default: 0,
      }),
      field.textarea("emotionalArc", "全书情绪弧", {
        required: true,
        default: "",
      }),
      field.collection("stages", "全书阶段", {
        required: true,
        itemDefinition: "arc-stage",
        default: [],
      }),
      field.referenceList("volumeIds", "分卷", {
        required: true,
        targetKinds: ["story-volume"],
        default: [],
      }),
      field.collection("keyTurningPoints", "关键转折", {
        required: true,
        itemDefinition: "turning-point",
        default: [],
      }),
    ],
    ruleIds: ["opening.stage", "reference.missing"],
  }),
  entityDocument({
    kind: "story-volume",
    label: "分卷",
    contentFormat: "structured",
    cardinality: "many",
    fields: [
      field.integer("number", "卷号", {
        required: true,
        minimum: 1,
      }),
      field.text("title", "卷名", {
        required: true,
      }),
      field.integer("startChapter", "起始章节", {
        required: true,
        minimum: 1,
      }),
      field.integer("endChapter", "结束章节", {
        required: true,
        minimum: 1,
      }),
      field.integer("targetWords", "目标字数", {
        required: true,
        minimum: 0,
      }),
      field.select("phase", "全书阶段", {
        required: true,
        options: [
          {
            value: "opening",
            label: "开篇",
          },
          {
            value: "development",
            label: "发展",
          },
          {
            value: "climax",
            label: "高潮",
          },
          {
            value: "ending",
            label: "结局",
          },
          {
            value: "mixed",
            label: "混合",
          },
          {
            value: "custom",
            label: "自定义",
          },
        ],
      }),
      field.textarea("purpose", "本卷目的", {
        required: true,
      }),
      field.textarea("coreConflict", "核心冲突", {
        required: true,
      }),
      field.textarea("coreEvent", "核心事件", {
        required: true,
      }),
      field.textarea("startState", "起始状态", {
        required: true,
      }),
      field.textarea("endState", "结束状态", {
        required: true,
      }),
      field.textarea("emotionalArc", "情绪弧", {
        required: true,
      }),
      field.stringList("allowedReveals", "允许揭示", {
        required: true,
        default: [],
      }),
      field.stringList("prohibitedReveals", "禁止揭示", {
        required: true,
        default: [],
      }),
      field.referenceList("chapterIds", "章节细纲", {
        required: true,
        targetKinds: ["story-chapter-plan"],
        default: [],
      }),
    ],
    ruleIds: ["range.invalid", "range.overlap", "volumes.number"],
  }),
  entityDocument({
    kind: "story-chapter-plan",
    label: "章节细纲",
    contentFormat: "structured",
    cardinality: "many",
    fields: [
      field.integer("number", "章节号", {
        required: true,
        minimum: 1,
      }),
      field.reference("volumeId", "所属分卷", {
        required: true,
        targetKinds: ["story-volume"],
      }),
      field.text("title", "章节标题", {
        required: true,
      }),
      field.select("phase", "阶段", {
        required: true,
        options: [
          {
            value: "opening",
            label: "开篇",
          },
          {
            value: "development",
            label: "发展",
          },
          {
            value: "climax",
            label: "高潮",
          },
          {
            value: "ending",
            label: "结局",
          },
          {
            value: "custom",
            label: "自定义",
          },
        ],
      }),
      field.text("phasePosition", "阶段位置", {
        required: true,
      }),
      field.select("chapterRole", "章节功能", {
        required: true,
        options: [
          {
            value: "high-pressure",
            label: "高压",
          },
          {
            value: "progress",
            label: "推进",
          },
          {
            value: "training",
            label: "成长训练",
          },
          {
            value: "relationship",
            label: "关系",
          },
          {
            value: "low-pressure",
            label: "低压",
          },
          {
            value: "information",
            label: "信息",
          },
          {
            value: "transition",
            label: "过渡",
          },
          {
            value: "custom",
            label: "自定义",
          },
        ],
      }),
      field.integer("targetWords", "目标字数", {
        required: true,
        minimum: 0,
      }),
      field.textarea("targetEmotion", "目标情绪", {
        required: true,
      }),
      field.textarea("coreEvent", "核心事件", {
        required: true,
      }),
      field.textarea("structureFormula", "结构公式", {
        required: true,
      }),
      field.textarea("openingHook", "开篇钩子", {
        required: true,
      }),
      field.textarea("payoff", "本章兑现", {
        required: true,
      }),
      field.stringList("releaseGuards", "禁止提前释放", {
        required: true,
        default: [],
      }),
      field.object("summary", "五段摘要", {
        required: true,
        definition: "chapter-plan-summary",
      }),
      field.object("plotLines", "剧情线", {
        required: true,
        definition: "plot-lines",
      }),
      field.referenceList("participantIds", "参与角色", {
        required: true,
        targetKinds: ["story-character"],
        default: [],
      }),
      field.referenceList("appearanceOrder", "出场顺序", {
        required: true,
        targetKinds: ["story-character"],
        default: [],
      }),
      field.referenceList("worldRefIds", "相关设定", {
        required: true,
        targetKinds: ["story-world-entry"],
        default: [],
      }),
      field.text("pointOfView", "本章视角", {
        required: true,
      }),
      field.textarea("informationGap", "信息差", {
        required: true,
      }),
      field.stringList("relationshipChanges", "关系变化", {
        required: true,
        default: [],
      }),
      field.collection("beats", "章节节拍", {
        required: true,
        itemDefinition: "chapter-beat",
        default: [],
      }),
      field.textarea("costAndPayoff", "代价与回报", {
        required: true,
      }),
      field.object("ending", "结尾设计", {
        required: true,
        definition: "chapter-ending",
      }),
      field.select("status", "细纲状态", {
        required: true,
        options: [
          {
            value: "draft",
            label: "草稿",
          },
          {
            value: "locked",
            label: "已锁定",
          },
          {
            value: "ready",
            label: "可写作",
          },
          {
            value: "written",
            label: "已成文",
          },
        ],
      }),
    ],
    ruleIds: ["chapters.number", "chapter.budget", "reference.missing"],
  }),
  entityDocument({
    kind: "story-chapter",
    label: "章节结果",
    description: "正文完成后的摘要、引用与状态变化；章节正文单独保存为 Markdown。",
    contentFormat: "structured",
    cardinality: "many",
    fields: [
      field.reference("planId", "章节细纲", {
        required: true,
        targetKinds: ["story-chapter-plan"],
      }),
      field.integer("number", "章节号", {
        required: true,
        minimum: 1,
      }),
      field.text("title", "章节标题", {
        required: true,
      }),
      field.select("status", "正文状态", {
        required: true,
        options: [
          {
            value: "draft",
            label: "草稿",
          },
          {
            value: "review",
            label: "审查中",
          },
          {
            value: "accepted",
            label: "已接受",
          },
          {
            value: "published",
            label: "已发布",
          },
        ],
      }),
      field.textarea("summary", "章节摘要", {
        required: true,
        default: "",
      }),
      field.integer("wordCount", "字数", {
        required: true,
        minimum: 0,
      }),
      field.referenceList("participantIds", "出场角色", {
        required: true,
        targetKinds: ["story-character"],
        default: [],
      }),
      field.referenceList("worldRefIds", "相关设定", {
        required: true,
        targetKinds: ["story-world-entry"],
        default: [],
      }),
      field.object("stateChanges", "状态变化", {
        required: true,
        definition: "chapter-state-changes",
      }),
    ],
    companionKinds: ["story-chapter-content"],
    ruleIds: ["reference.missing"],
  }),
  documentModel({
    kind: "story-chapter-content",
    label: "章节正文",
    description: "可直接阅读、编辑和发布的 Markdown 正文。",
    contentFormat: "markdown",
    cardinality: "many",
    fields: [
      field.text("kind", "文档类型", {
        required: true,
        readOnly: true,
        const: "story-chapter-content",
      }),
      field.id("id", "章节 ID", {
        required: true,
        immutable: true,
      }),
      field.content("content", "正文 Markdown", {
        required: true,
        default: "",
      }),
    ],
    companionKinds: ["story-chapter"],
    ruleIds: [],
  }),
]);
