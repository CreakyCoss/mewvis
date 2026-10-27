import { copy, type Model } from "./model";

const development: Model = {
  format: "gameplay-model-v1",
  id: "development",
  name: "多路径发展",
  description: "研究专精，还是先建立更强的产能？比较不同投入顺序。",
  fields: [
    {
      id: "materials",
      name: "材料库存",
      description: "当前拥有的材料数量",
      initial: 40,
      role: "stock",
    },
    {
      id: "production",
      name: "产能每周期",
      description: "每轮结算时获得的材料",
      initial: 2,
      role: "rate",
    },
    {
      id: "research",
      name: "科研进度",
      description: "当前研究进度指标",
      initial: 0,
      role: "progress",
    },
  ],
  capabilities: [
    {
      id: "factory",
      name: "生产设施",
      description: "通过投资建立生产基础",
      initial: false,
    },
    {
      id: "laboratory",
      name: "研究能力",
      description: "允许执行研究行动",
      initial: true,
    },
  ],
  actions: [
    {
      id: "build",
      name: "发展产能",
      description: "投入材料，提高后续每周期产出。",
      costs: [{ field: "materials", value: 12 }],
      requires: [],
      effects: [
        { type: "add", field: "production", value: 2 },
        { type: "grant", capability: "factory" },
      ],
    },
    {
      id: "study",
      name: "推进研究",
      description: "消耗材料，推进当前玩家的科研进度。",
      costs: [{ field: "materials", value: 8 }],
      requires: ["laboratory"],
      effects: [{ type: "add", field: "research", value: 15 }],
    },
    {
      id: "trade",
      name: "交换资源",
      description: "用一次行动获得材料，放慢当前研究节奏。",
      costs: [],
      requires: [],
      effects: [{ type: "add", field: "materials", value: 10 }],
    },
  ],
  goals: [
    {
      id: "science",
      name: "科研目标",
      description: "达到设定进度，率先完成目标。",
      field: "research",
      threshold: 90,
    },
  ],
  collections: [],
  flow: {
    actionsPerTurn: 2,
    maxRounds: 15,
    income: [{ type: "add", field: "materials", value: 1, from: "production" }],
  },
};
const combination: Model = {
  format: "gameplay-model-v1",
  id: "combination",
  name: "组合计分",
  description: "选择同类组合，还是投资倍率？用同一个运行器验证组合策略。",
  fields: [
    {
      id: "coins",
      name: "可用筹码",
      description: "可以用于调整倍率的资源",
      initial: 4,
      role: "stock",
    },
    {
      id: "multiplier",
      name: "计分倍率",
      description: "放大组合的最终得分",
      initial: 1,
      role: "rate",
    },
    {
      id: "score",
      name: "累计得分",
      description: "每次组合的得分累计",
      initial: 0,
      role: "progress",
    },
  ],
  capabilities: [
    {
      id: "scoring",
      name: "组合识别",
      description: "基础值之和，加上每对同类的 15 点奖励，再乘倍率。",
      initial: true,
    },
  ],
  actions: [
    {
      id: "play",
      name: "提交组合",
      description: "从候选集合选择 1–3 个对象进行计分，然后补充候选。",
      costs: [],
      requires: ["scoring"],
      effects: [
        {
          type: "combination",
          collection: "hand",
          field: "score",
          multiplier: "multiplier",
        },
      ],
    },
    {
      id: "upgrade",
      name: "提高倍率",
      description: "投入筹码，换取后续更高得分。",
      costs: [{ field: "coins", value: 2 }],
      requires: [],
      effects: [{ type: "add", field: "multiplier", value: 1 }],
    },
    {
      id: "earn",
      name: "积累筹码",
      description: "放弃本次计分机会，增加筹码。",
      costs: [],
      requires: [],
      effects: [{ type: "add", field: "coins", value: 2 }],
    },
  ],
  goals: [
    {
      id: "target-score",
      name: "目标得分",
      description: "累计达到 180 分。",
      field: "score",
      threshold: 180,
    },
  ],
  collections: [
    {
      id: "hand",
      name: "候选集合",
      handSize: 5,
      maxSelect: 3,
      cards: Array.from({ length: 15 }, (_, i) => ({
        id: `card-${i}`,
        name: `${["日", "月", "星"][i % 3]} ${Math.floor(i / 3) + 1}`,
        group: ["日", "月", "星"][i % 3],
        value: (Math.floor(i / 3) + 1) * 3,
      })),
    },
  ],
  flow: { actionsPerTurn: 2, maxRounds: 12, income: [] },
};
export const templates = [development, combination];
export const makeTemplate = (id = "development") =>
  copy(templates.find((m) => m.id === id) ?? development);
