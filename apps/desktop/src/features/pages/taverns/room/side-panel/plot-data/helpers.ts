import type {
  TavernCondition,
  TavernEntityRef,
  TavernFactEvent,
  TavernSceneOutcomeDefinition,
  TavernStatusDefinition,
  TavernStatusEvent,
  TavernStatusRule,
  TavernStatusValue,
  TavernTaskState,
} from "@/features/pages/taverns/tavern/types";
import type { TavernInformationView } from "@/features/pages/taverns/tavern/core";

export const informationViewLabels: Record<TavernInformationView, string> = {
  public: "公开视角",
  reveal: "复盘视角",
  director: "导演视角",
};

export const informationViewDescriptions: Record<TavernInformationView, string> = {
  public: "只显示公开可观察事实。",
  reveal: "显示结局或手动复盘可揭示的事实。",
  director: "显示导演可见的全部事实。",
};

export const statusScopeLabels: Record<TavernStatusDefinition["scope"], string> = {
  global: "全局",
  scene: "场景",
  party: "队伍",
  character: "角色",
  relationship: "关系",
};

export const updatePolicyModeLabels: Record<TavernStatusDefinition["updatePolicy"]["mode"], string> = {
  manualOnly: "手动",
  eventDriven: "事件驱动",
  eventDrivenWithReview: "事件驱动/可审核",
  llmSuggestedWithReview: "LLM 建议/审核",
};

export const ruleTargetLabels: Record<NonNullable<TavernStatusRule["apply"]["target"]>, string> = {
  eventTarget: "事件目标",
  eventActor: "事件发起者",
  relationshipActorToTarget: "发起者对目标",
  relationshipTargetToActor: "目标对发起者",
};

export const statusEventStatusLabels: Record<TavernStatusEvent["status"], string> = {
  applied: "已应用",
  pending: "待确认",
  rejected: "已拒绝",
};

export const taskStatusLabels: Record<TavernTaskState["status"], string> = {
  inactive: "未激活",
  active: "进行中",
  completed: "已完成",
  failed: "已失败",
};

export const outcomeStatusLabels = {
  pending: "待确认",
  applied: "已触发",
  dismissed: "已忽略",
} as const;

export const outcomeEndSceneLabels: Record<TavernSceneOutcomeDefinition["endScene"], string> = {
  none: "不结束",
  suggest: "建议结束",
  auto: "自动结束",
};

export const taskScopeLabels = {
  personal: "个人",
  team: "团队",
  party: "队伍",
  scene: "场景",
  global: "全局",
} as const;

export const formatFactType = (type: string) => type.replace(/[_-]+/g, " ").trim();

export const isHiddenFactEvent = (event: TavernFactEvent) =>
  (event.visibility ?? "public") !== "public";

export const isIdentityFactEvent = (event: TavernFactEvent) =>
  /(?:role|identity|faction|camp|alignment|身份|阵营)/i.test(event.type);

export const formatStatusValue = (value: TavernStatusValue) => {
  if (Array.isArray(value)) {
    return value.length > 0 ? value.join("、") : "无";
  }
  if (typeof value === "boolean") {
    return value ? "是" : "否";
  }
  return value === null || value === "" ? "未记录" : String(value);
};

export const formatFactAudience = (
  event: TavernFactEvent,
  characterNameById: Map<string, string>,
) => {
  const audience = [
    event.visibleToUser ? "我" : "",
    ...(event.visibleToCharacterIds ?? []).map((characterId) =>
      characterNameById.get(characterId) ?? characterId
    ),
    ...(event.visibleToFactionIds ?? []).map((factionId) => `阵营：${factionId}`),
  ].filter(Boolean);

  if (audience.length > 0) {
    return audience.join("、");
  }

  return (event.visibility ?? "public") === "public" ? "公开" : "导演";
};

export const formatStatusRuleValue = (rule: TavernStatusRule) => {
  if (rule.apply.valueByIntensity) {
    return Object.entries(rule.apply.valueByIntensity)
      .map(([intensity, value]) => `${intensity}:${value}`)
      .join(" / ");
  }
  return formatStatusValue(rule.apply.value ?? null);
};

export const formatStatusTarget = (
  event: TavernStatusEvent,
  characterNameById: Map<string, string>,
) => {
  switch (event.target.type) {
    case "global":
      return "全局";
    case "scene":
      return "场景";
    case "party":
      return `队伍 ${event.target.partyId}`;
    case "character":
      return characterNameById.get(event.target.characterId) ?? event.target.characterId;
    case "relationship": {
      const subject = event.target.subject.type === "character"
        ? characterNameById.get(event.target.subject.characterId) ?? event.target.subject.characterId
        : "我";
      const object = event.target.object.type === "character"
        ? characterNameById.get(event.target.object.characterId) ?? event.target.object.characterId
        : "我";
      return `${subject} -> ${object}`;
    }
  }
};

export const formatEntityRef = (
  entity: TavernEntityRef | undefined,
  characterNameById: Map<string, string>,
) => {
  if (!entity) {
    return "未指定";
  }

  switch (entity.type) {
    case "user":
      return "我";
    case "character":
      return characterNameById.get(entity.characterId) ?? entity.characterId;
    case "team":
      return `团队 ${entity.teamId}`;
    case "faction":
      return `阵营 ${entity.factionId}`;
    case "party":
      return `队伍 ${entity.partyId}`;
    case "scene":
      return "场景";
    case "global":
      return "全局";
  }
};

export const formatConditionSummary = (
  condition: TavernCondition | undefined,
  characterNameById: Map<string, string>,
): string => {
  if (!condition) {
    return "无";
  }

  if ("all" in condition) {
    return condition.all.map((item) => formatConditionSummary(item, characterNameById)).join(" 且 ");
  }
  if ("any" in condition) {
    return condition.any.map((item) => formatConditionSummary(item, characterNameById)).join(" 或 ");
  }
  if ("not" in condition) {
    return `非（${formatConditionSummary(condition.not, characterNameById)}）`;
  }
  if ("status" in condition && "target" in condition) {
    const parts = [
      condition.gte !== undefined ? `>= ${condition.gte}` : "",
      condition.lte !== undefined ? `<= ${condition.lte}` : "",
      condition.equals !== undefined ? `= ${formatStatusValue(condition.equals)}` : "",
      condition.notEquals !== undefined ? `!= ${formatStatusValue(condition.notEquals)}` : "",
      condition.crossing ? `穿越 ${condition.crossing}` : "",
    ].filter(Boolean).join(" ");
    return `状态 ${condition.status} ${parts}`;
  }
  if ("factEvent" in condition) {
    const actor = condition.actor ? `，发起：${formatEntityRef(condition.actor, characterNameById)}` : "";
    const target = condition.target ? `，目标：${formatEntityRef(condition.target, characterNameById)}` : "";
    const count = condition.countGte ? `，至少 ${condition.countGte} 次` : "";
    return `事实 ${condition.factEvent}${actor}${target}${count}`;
  }
  if ("task" in condition && "status" in condition) {
    return `任务 ${condition.task} 为 ${taskStatusLabels[condition.status]}`;
  }
  if ("flag" in condition) {
    return `标记 ${condition.flag} = ${formatStatusValue(condition.equals)}`;
  }
  return "未知条件";
};
