import { field } from "./fields.js";
import { defineDocumentModels, defineObjectModels, documentModel, entityDocument } from "./model.js";

export const CORE_OBJECTS = defineObjectModels([
  {
    id: "manifest-file-entry",
    label: "清单文件项",
    fields: [
      field.text("kind", "文档类型", {
        required: true,
        readOnly: true,
      }),
      field.id("id", "对象 ID", {
        required: true,
        readOnly: true,
      }),
      field.path("path", "文件路径", {
        required: true,
        readOnly: true,
      }),
    ],
  },
  {
    id: "arc-stage",
    label: "全书阶段",
    fields: [
      field.id("id", "阶段 ID", {
        required: true,
        immutable: true,
      }),
      field.text("name", "阶段名称", {
        required: true,
      }),
      field.select("phase", "阶段类型", {
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
      field.integer("startChapter", "起始章节", {
        required: true,
        minimum: 1,
      }),
      field.integer("endChapter", "结束章节", {
        required: true,
        minimum: 1,
      }),
      field.textarea("purpose", "阶段目的", {
        required: true,
      }),
      field.textarea("emotionalTone", "情绪基调", {
        required: true,
      }),
      field.textarea("expectedReaderState", "期望读者状态", {
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
    ],
  },
  {
    id: "turning-point",
    label: "关键转折",
    fields: [
      field.reference("chapterId", "章节", {
        required: true,
        targetKinds: ["story-chapter-plan", "story-chapter"],
      }),
      field.textarea("function", "结构功能", {
        required: true,
      }),
      field.textarea("emotionalEffect", "情绪效果", {
        required: true,
      }),
    ],
  },
  {
    id: "style-profile",
    label: "文风画像",
    fields: [
      field.text("pointOfView", "视角", {
        required: true,
      }),
      field.textarea("tone", "语气", {
        required: true,
      }),
      field.textarea("sentenceRhythm", "句式节奏", {
        required: true,
      }),
      field.textarea("dialogue", "对话特征", {
        required: true,
      }),
      field.stringList("proseRules", "表达规则", {
        required: true,
        default: [],
      }),
      field.stringList("anchorExcerpts", "短证据锚点", {
        required: true,
        default: [],
      }),
    ],
  },
]);

export const CORE_DOCUMENTS = defineDocumentModels([
  documentModel({
    kind: "story-manifest",
    label: "故事清单",
    description: "索引所有正式故事文件并维护 revision",
    contentType: "json",
    cardinality: "one",
    fields: [
      field.integer("schemaVersion", "结构版本", {
        required: true,
        readOnly: true,
        const: 1,
      }),
      field.text("kind", "文档类型", {
        required: true,
        readOnly: true,
        const: "story-manifest",
      }),
      field.id("storyId", "故事 ID", {
        required: true,
        immutable: true,
      }),
      field.text("title", "故事标题", {
        required: true,
        generatedFrom: "story-book:/title",
      }),
      field.integer("revision", "数据版本", {
        required: true,
        generated: true,
        readOnly: true,
        minimum: 0,
      }),
      field.timestamp("createdAt", "创建时间", {
        required: true,
        generated: true,
        readOnly: true,
      }),
      field.timestamp("updatedAt", "更新时间", {
        required: true,
        generated: true,
        readOnly: true,
      }),
      field.collection("files", "文件索引", {
        required: true,
        generated: true,
        readOnly: true,
        itemDefinition: "manifest-file-entry",
      }),
    ],
    ruleIds: ["manifest.files", "manifest.title"],
  }),
  entityDocument({
    kind: "story-book",
    label: "作品核心",
    description: "书名、故事前提、目标、核心冲突与终局阻碍",
    contentType: "json",
    cardinality: "one",
    fields: [
      field.text("title", "书名", {
        required: true,
        default: "",
      }),
      field.textarea("premise", "故事前提", {
        required: true,
        default: "",
      }),
      field.textarea("goal", "全书目标", {
        required: true,
        default: "",
      }),
      field.textarea("logline", "一句话梗概", {
        required: true,
        default: "",
      }),
      field.textarea("centralConflict", "核心冲突", {
        required: true,
        default: "",
      }),
      field.textarea("finalObstacle", "终极阻碍", {
        required: true,
        default: "",
      }),
      field.reference("protagonistId", "主角", {
        required: false,
        targetKinds: ["story-character"],
      }),
      field.timestamp("createdAt", "创建时间", {
        required: true,
        generated: true,
        readOnly: true,
      }),
    ],
    ruleIds: ["book.title", "book.logline", "opening.protagonist"],
  }),
  entityDocument({
    kind: "story-positioning",
    label: "作品定位",
    contentType: "json",
    cardinality: "one",
    fields: [
      field.select("lengthType", "篇幅类型", {
        required: true,
        options: [
          {
            value: "long",
            label: "长篇",
          },
          {
            value: "short",
            label: "短篇",
          },
        ],
      }),
      field.text("primaryGenre", "主类型", {
        required: true,
        default: "",
      }),
      field.stringList("secondaryGenres", "副类型", {
        required: true,
        default: [],
      }),
      field.text("targetPlatform", "目标平台", {
        required: true,
        default: "",
      }),
      field.textarea("targetAudience", "目标读者", {
        required: true,
        default: "",
      }),
      field.integer("targetWords", "目标字数", {
        required: true,
        minimum: 0,
        default: 0,
      }),
      field.textarea("emotionalPromise", "情绪承诺", {
        required: true,
        default: "",
      }),
      field.textarea("surfaceHook", "表层卖点", {
        required: true,
        default: "",
      }),
      field.textarea("deepPayoff", "深层满足", {
        required: true,
        default: "",
      }),
      field.textarea("longTermHook", "长期钩子", {
        required: true,
        default: "",
      }),
      field.textarea("differentiation", "差异化", {
        required: true,
        default: "",
      }),
      field.stringList("benchmarkTitles", "对标作品", {
        required: true,
        default: [],
      }),
    ],
  }),
  entityDocument({
    kind: "story-style",
    label: "文风约束",
    contentType: "json",
    cardinality: "one",
    fields: [
      field.textarea("tone", "整体语气", {
        required: true,
        default: "",
      }),
      field.text("pointOfView", "叙事视角", {
        required: true,
        default: "",
      }),
      field.text("tense", "叙事时态", {
        required: true,
        default: "",
      }),
      field.textarea("sentenceRhythm", "句式节奏", {
        required: true,
        default: "",
      }),
      field.textarea("dialogueGuidance", "对话指导", {
        required: true,
        default: "",
      }),
      field.textarea("punctuationGuidance", "标点指导", {
        required: true,
        default: "",
      }),
      field.stringList("forbiddenPatterns", "禁止表达", {
        required: true,
        default: [],
      }),
    ],
    ruleIds: ["style.tone"],
  }),
]);
