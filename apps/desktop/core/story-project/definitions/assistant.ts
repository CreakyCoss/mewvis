import { field } from "./fields.js";
import { defineDocumentModels, defineObjectModels, entityDocument } from "./model.js";

export const ASSISTANT_OBJECTS = defineObjectModels([
  {
    id: "analysis-source",
    label: "分析来源",
    fields: [
      field.text("title", "来源标题", {
        required: true,
      }),
      field.text("platform", "来源平台", {
        required: true,
      }),
      field.path("path", "来源路径", {
        required: false,
      }),
      field.integer("wordCount", "字数", {
        required: true,
        minimum: 0,
      }),
      field.integer("chapterCount", "章节数", {
        required: true,
        minimum: 0,
      }),
    ],
  },
  {
    id: "analysis-stage",
    label: "结构分析阶段",
    fields: [
      field.text("name", "阶段名称", {
        required: true,
      }),
      field.text("range", "范围", {
        required: true,
      }),
      field.textarea("function", "结构功能", {
        required: true,
      }),
      field.textarea("emotion", "情绪作用", {
        required: true,
      }),
      field.stringList("evidence", "证据", {
        required: true,
        default: [],
      }),
    ],
  },
  {
    id: "character-insight",
    label: "人物分析",
    fields: [
      field.text("name", "人物", {
        required: true,
      }),
      field.text("role", "角色功能", {
        required: true,
      }),
      field.textarea("function", "叙事作用", {
        required: true,
      }),
      field.textarea("arc", "人物弧", {
        required: true,
      }),
      field.stringList("evidence", "证据", {
        required: true,
        default: [],
      }),
    ],
  },
  {
    id: "review-finding",
    label: "审查问题",
    fields: [
      field.id("id", "问题 ID", {
        required: true,
        immutable: true,
      }),
      field.select("severity", "严重级别", {
        required: true,
        options: [
          {
            value: "S1",
            label: "S1 严重",
          },
          {
            value: "S2",
            label: "S2 重要",
          },
          {
            value: "S3",
            label: "S3 局部",
          },
          {
            value: "S4",
            label: "S4 建议",
          },
        ],
      }),
      field.select("category", "问题类别", {
        required: true,
        options: [
          {
            value: "structure",
            label: "结构",
          },
          {
            value: "character",
            label: "人物",
          },
          {
            value: "prose",
            label: "文字",
          },
          {
            value: "consistency",
            label: "一致性",
          },
          {
            value: "platform",
            label: "平台",
          },
          {
            value: "factual",
            label: "事实",
          },
          {
            value: "format",
            label: "格式",
          },
          {
            value: "causal",
            label: "因果",
          },
          {
            value: "rule-boundary",
            label: "规则边界",
          },
        ],
      }),
      field.path("scopePath", "问题位置", {
        required: true,
      }),
      field.textarea("evidence", "证据", {
        required: true,
      }),
      field.textarea("issue", "问题说明", {
        required: true,
      }),
      field.textarea("fix", "修复建议", {
        required: true,
      }),
      field.select("status", "处理状态", {
        required: true,
        options: [
          {
            value: "open",
            label: "待处理",
          },
          {
            value: "accepted",
            label: "已接受",
          },
          {
            value: "resolved",
            label: "已解决",
          },
          {
            value: "dismissed",
            label: "已忽略",
          },
        ],
      }),
    ],
  },
]);

export const ASSISTANT_DOCUMENTS = defineDocumentModels([
  entityDocument({
    kind: "story-analysis",
    label: "故事分析",
    contentType: "json",
    cardinality: "many",
    fields: [
      field.select("analysisType", "分析篇幅", {
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
      field.select("target", "分析目标", {
        required: true,
        options: [
          {
            value: "current-story",
            label: "当前故事",
          },
          {
            value: "benchmark",
            label: "对标作品",
          },
          {
            value: "import-source",
            label: "导入来源",
          },
        ],
      }),
      field.select("status", "分析状态", {
        required: true,
        options: [
          {
            value: "draft",
            label: "草稿",
          },
          {
            value: "partial",
            label: "部分完成",
          },
          {
            value: "complete",
            label: "已完成",
          },
        ],
      }),
      field.object("source", "分析来源", {
        required: true,
        definition: "analysis-source",
      }),
      field.textarea("summary", "分析摘要", {
        required: true,
      }),
      field.textarea("storyCore", "故事核", {
        required: true,
      }),
      field.collection("structureStages", "结构阶段", {
        required: true,
        itemDefinition: "analysis-stage",
        default: [],
      }),
      field.stringList("turningPoints", "关键转折", {
        required: true,
        default: [],
      }),
      field.collection("emotionalArc", "情绪弧", {
        required: true,
        itemDefinition: "emotional-arc-point",
        default: [],
      }),
      field.collection("plotModules", "剧情模块", {
        required: true,
        itemDefinition: "plot-module",
        default: [],
      }),
      field.object("styleProfile", "文风画像", {
        required: true,
        definition: "style-profile",
      }),
      field.collection("characterInsights", "人物分析", {
        required: true,
        itemDefinition: "character-insight",
        default: [],
      }),
      field.stringList("worldInsights", "世界观分析", {
        required: true,
        default: [],
      }),
      field.stringList("reusableTechniques", "可复用技巧", {
        required: true,
        default: [],
      }),
      field.stringList("gaps", "证据缺口", {
        required: true,
        default: [],
      }),
      field.timestamp("createdAt", "创建时间", {
        required: true,
        generated: true,
        readOnly: true,
      }),
    ],
  }),
  entityDocument({
    kind: "story-review",
    label: "审稿记录",
    contentType: "json",
    cardinality: "many",
    fields: [
      field.select("reviewType", "记录类型", {
        required: true,
        options: [
          {
            value: "review",
            label: "故事审查",
          },
          {
            value: "deslop",
            label: "去 AI 味",
          },
        ],
      }),
      field.select("mode", "审查模式", {
        required: true,
        options: [
          {
            value: "full",
            label: "完整",
          },
          {
            value: "lean",
            label: "精简",
          },
          {
            value: "solo",
            label: "单章",
          },
          {
            value: "detect",
            label: "仅检测",
          },
          {
            value: "rewrite",
            label: "检测并改写",
          },
        ],
      }),
      field.text("rubric", "审查标准", {
        required: true,
      }),
      field.stringList("scopePaths", "审查范围", {
        required: true,
        default: [],
      }),
      field.textarea("summary", "审查摘要", {
        required: true,
      }),
      field.select("verdict", "结论", {
        required: true,
        options: [
          {
            value: "approve",
            label: "通过",
          },
          {
            value: "concerns",
            label: "存在问题",
          },
          {
            value: "reject",
            label: "需要重写",
          },
          {
            value: "not-applicable",
            label: "不适用",
          },
        ],
      }),
      field.collection("findings", "问题列表", {
        required: true,
        itemDefinition: "review-finding",
        default: [],
      }),
      field.timestamp("createdAt", "创建时间", {
        required: true,
        generated: true,
        readOnly: true,
      }),
    ],
  }),
  entityDocument({
    kind: "story-import",
    label: "导入记录",
    contentType: "json",
    cardinality: "many",
    fields: [
      field.text("sourceTitle", "来源标题", {
        required: true,
      }),
      field.path("sourcePath", "来源路径", {
        required: false,
      }),
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
      field.select("status", "导入状态", {
        required: true,
        options: [
          {
            value: "detected",
            label: "已检测",
          },
          {
            value: "analyzing",
            label: "分析中",
          },
          {
            value: "ready",
            label: "可提交",
          },
          {
            value: "committed",
            label: "已落库",
          },
          {
            value: "partial",
            label: "部分完成",
          },
          {
            value: "failed",
            label: "失败",
          },
        ],
      }),
      field.integer("wordCount", "字数", {
        required: true,
        minimum: 0,
      }),
      field.integer("chapterCount", "章节数", {
        required: true,
        minimum: 0,
      }),
      field.integer("lastCompleteChapterNumber", "最后完整章号", {
        required: true,
        minimum: 0,
      }),
      field.reference("analysisId", "分析记录", {
        required: false,
        targetKinds: ["story-analysis"],
      }),
      field.referenceList("generatedFileIds", "生成对象", {
        required: true,
        targetKinds: [
          "story-book",
          "story-character",
          "story-world-entry",
          "story-volume",
          "story-chapter-plan",
          "story-chapter",
          "story-analysis",
          "story-review",
          "story-import",
        ],
        targetObjectDefinitions: ["relationship", "foreshadow", "timeline-entry"],
        default: [],
      }),
      field.stringList("warnings", "警告与缺口", {
        required: true,
        default: [],
      }),
      field.timestamp("createdAt", "创建时间", {
        required: true,
        generated: true,
        readOnly: true,
      }),
    ],
  }),
]);
