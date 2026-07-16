import { defineDocumentModels, defineObjectModels, entityDocument } from "../model/document.js";
import { field } from "../model/fields.js";

export const PEOPLE_OBJECTS = defineObjectModels([
  {
    id: "character-memory",
    label: "角色记忆分层",
    fields: [
      field.textarea("required", "必要记忆", {
        description: "任何场景都必须保持一致的核心事实",
        required: true,
        default: "",
      }),
      field.textarea("public", "公开信息", {
        required: true,
        default: "",
      }),
      field.textarea("known", "角色已知信息", {
        required: true,
        default: "",
      }),
      field.textarea("privateSelf", "角色私密认知", {
        required: true,
        default: "",
      }),
      field.textarea("directorSecret", "创作者秘密", {
        description: "角色本人未必知道、仅供创作控制的信息",
        required: true,
        default: "",
      }),
    ],
  },
  {
    id: "relationship",
    label: "角色关系",
    fields: [
      field.id("id", "关系 ID", {
        required: true,
        immutable: true,
      }),
      field.reference("fromCharacterId", "起始角色", {
        required: true,
        targetKinds: ["story-character"],
      }),
      field.reference("toCharacterId", "目标角色", {
        required: true,
        targetKinds: ["story-character"],
      }),
      field.text("type", "关系类型", {
        required: true,
      }),
      field.textarea("emotionalDirection", "情感方向", {
        required: true,
      }),
      field.textarea("currentState", "当前状态", {
        required: true,
      }),
      field.textarea("conflict", "关系冲突", {
        required: true,
      }),
      field.reference("startedAtChapterId", "关系起始章节", {
        required: false,
        targetKinds: ["story-chapter"],
      }),
      field.collection("evolution", "关系演变", {
        required: true,
        itemDefinition: "relationship-evolution",
        default: [],
      }),
    ],
  },
  {
    id: "relationship-evolution",
    label: "关系变化记录",
    fields: [
      field.reference("chapterId", "发生章节", {
        required: true,
        targetKinds: ["story-chapter"],
      }),
      field.textarea("summary", "变化摘要", {
        required: true,
      }),
    ],
  },
  {
    id: "recent-character-change",
    label: "角色近期变化",
    fields: [
      field.reference("chapterId", "章节", {
        required: true,
        targetKinds: ["story-chapter"],
      }),
      field.textarea("summary", "变化摘要", {
        required: true,
      }),
    ],
  },
]);

export const PEOPLE_DOCUMENTS = defineDocumentModels([
  entityDocument({
    kind: "story-character",
    label: "角色档案",
    contentType: "json",
    cardinality: "many",
    fields: [
      field.text("name", "姓名", {
        required: true,
      }),
      field.select("role", "角色定位", {
        required: true,
        options: [
          {
            value: "protagonist",
            label: "主角",
          },
          {
            value: "deuteragonist",
            label: "第二主角",
          },
          {
            value: "antagonist",
            label: "对手",
          },
          {
            value: "supporting",
            label: "配角",
          },
          {
            value: "minor",
            label: "次要角色",
          },
        ],
      }),
      field.text("avatar", "头像标识", {
        required: true,
        default: "blank-avatar",
      }),
      field.text("age", "年龄", {
        required: true,
        default: "",
      }),
      field.textarea("description", "角色简介", {
        required: true,
        default: "",
      }),
      field.stringList("traits", "性格特征", {
        required: true,
        default: [],
      }),
      field.textarea("speakingStyle", "说话风格", {
        required: true,
        default: "",
      }),
      field.textarea("writingStyle", "书写风格", {
        required: true,
        default: "",
      }),
      field.textarea("replyStylePrompt", "回复风格提示", {
        required: true,
        default: "",
      }),
      field.textarea("goals", "角色目标", {
        required: true,
        default: "",
      }),
      field.textarea("motivation", "核心动机", {
        required: true,
        default: "",
      }),
      field.textarea("flaw", "缺陷", {
        required: true,
        default: "",
      }),
      field.textarea("coreAbility", "核心能力", {
        required: true,
        default: "",
      }),
      field.textarea("relationshipSummary", "关系摘要", {
        required: true,
        default: "",
      }),
      field.textarea("publicRelationshipSummary", "公开关系摘要", {
        required: true,
        default: "",
      }),
      field.textarea("arcSummary", "人物弧", {
        required: true,
        default: "",
      }),
      field.object("memory", "记忆分层", {
        required: true,
        definition: "character-memory",
      }),
    ],
  }),
  entityDocument({
    kind: "story-relationships",
    label: "角色关系网",
    contentType: "json",
    cardinality: "one",
    fields: [
      field.collection("relationships", "关系", {
        required: true,
        itemDefinition: "relationship",
        default: [],
      }),
    ],
    ruleIds: ["identity.duplicate", "reference.missing"],
  }),
  entityDocument({
    kind: "story-world-entry",
    label: "世界设定",
    description: "背景、力量体系、地理、社会、势力、物品和规则等可召回设定",
    contentType: "json",
    cardinality: "many",
    fields: [
      field.select("category", "设定类别", {
        required: true,
        options: [
          {
            value: "background",
            label: "时代与故事背景",
          },
          {
            value: "power-system",
            label: "力量体系",
          },
          {
            value: "geography",
            label: "地理",
          },
          {
            value: "society",
            label: "社会结构",
          },
          {
            value: "faction",
            label: "势力组织",
          },
          {
            value: "object",
            label: "关键物品",
          },
          {
            value: "rule",
            label: "世界规则",
          },
          {
            value: "other",
            label: "其他",
          },
        ],
      }),
      field.text("title", "设定名称", {
        required: true,
      }),
      field.textarea("summary", "设定摘要", {
        required: true,
        default: "",
      }),
      field.content("content", "详细内容", {
        required: true,
        default: "",
      }),
      field.stringList("rules", "明确规则", {
        required: true,
        default: [],
      }),
      field.stringList("constraints", "限制条件", {
        required: true,
        default: [],
      }),
      field.stringList("keywords", "召回关键词", {
        required: true,
        default: [],
      }),
      field.referenceList("relatedEntityIds", "关联对象", {
        required: true,
        targetKinds: ["story-character", "story-world-entry"],
        default: [],
      }),
      field.boolean("enabled", "启用", {
        required: true,
        default: true,
      }),
      field.boolean("alwaysOn", "始终召回", {
        required: true,
        default: false,
      }),
    ],
  }),
]);
