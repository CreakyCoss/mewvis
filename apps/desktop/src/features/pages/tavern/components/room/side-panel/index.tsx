import { useImperativeHandle, useRef, useState } from "react";
import {
  Check,
  Eye,
  EyeOff,
  Save,
  ShieldCheck,
  Sparkles,
  Trash2,
  TriangleAlertIcon,
  UsersRound,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";
import {
  requireRuntimeModelInput,
  type RuntimeModelOption,
} from "@/features/pages/settings/llm/store";
import { cn } from "@/lib/utils";
import {
  createTavernAssetDraft,
  createTavernLorebookEntry,
  createTavernTimelineEvent,
  projectTavernSceneOntoRoom,
  syncTavernRoomActiveScene,
} from "../../../storage";
import {
  advanceTavernProgressFromFactEvents,
  assignTavernRoleFacts,
  createTavernProgressCheckpoint,
  filterTavernFactEventsForAudience,
  getTavernStatusSnapshotValue,
  isGeneratedTavernRoleAssignmentFactEvent,
  isTavernProgressVisibilityVisibleToUser,
  rebuildTavernProgressFromHistory,
  resolveTavernInformationView,
  resolveTavernPendingOutcomeEvent,
  resolveTavernPendingStatusEvent,
  tavernCharacterAgentRoleId,
  type TavernInformationView,
} from "../../../core";
import { runTavernAssetExtraction } from "../../../runtime/asset-extractor";
import {
  compactTavernAgentKnowledge,
} from "../../../runtime/bridge-session";
import { runTavernProgressTracking } from "../../../runtime/progress-tracker";
import type {
  TavernAssetDraft,
  TavernCharacter,
  TavernCondition,
  TavernEntityRef,
  TavernFactEvent,
  TavernProgressView,
  TavernReplyMode,
  TavernRoom,
  TavernSceneOutcomeDefinition,
  TavernStatusDefinition,
  TavernStatusEvent,
  TavernStatusTargetRef,
  TavernStatusRule,
  TavernStatusValue,
  TavernTaskDefinition,
  TavernTaskState,
} from "../../../types";
import { useTavernPageContext } from "../../context";
import { CharacterStatusRow } from "./characters";
import { PlotDataSection, type PlotDataSectionHandle } from "./plot-data";
import { SceneOverviewSection } from "./scene-overview";
import {
  EmptyPanelCard,
  TextBlock,
} from "./shared";
import type {
  ResolvedStatusMetric,
  SidePanelDangerAction,
  SidePanelProps,
  StatusProgressItem,
  TaskCardData,
  TaskValueDisplay,
} from "./types";
export type { SidePanelHandle } from "./types";

const TAVERN_RUNTIME_MODEL_UNAVAILABLE = "当前模型配置已不可用，请重新选择模型。";

const requireTavernRuntimeModelInput = (runtimeModel: RuntimeModelOption) =>
  requireRuntimeModelInput(runtimeModel, TAVERN_RUNTIME_MODEL_UNAVAILABLE);

const getErrorMessage = (error: unknown) => {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === "string") {
    return error;
  }

  return "未知错误";
};

const hasAssetDraftItems = (draft: TavernAssetDraft) =>
  draft.timelineEvents.some((event) => event.title.trim() && event.summary.trim()) ||
  draft.characterMemories.some((memory) => memory.characterId.trim() && memory.note.trim()) ||
  draft.lorebookEntries.some((entry) => entry.title.trim() && entry.content.trim());

const appendProgressCheckpointToRoom = (
  room: TavernRoom,
  reason: Parameters<typeof createTavernProgressCheckpoint>[0]["reason"],
  turnId?: string,
): TavernRoom => {
  const checkpoint = createTavernProgressCheckpoint({
    room,
    turnId,
    reason,
    createdAt: Date.now(),
  });
  return syncTavernRoomActiveScene({
    ...room,
    statusCheckpoints: [...room.statusCheckpoints, checkpoint].slice(-20),
  });
};

const replyModeDescriptions: Record<TavernReplyMode, string> = {
  active: "仅当前选中的角色发言",
  round: "所有入席角色依次发言",
  director: "由导演选择合适角色发言",
};

const informationViewLabels: Record<TavernInformationView, string> = {
  public: "公开视角",
  reveal: "复盘视角",
  director: "导演视角",
};

const informationViewDescriptions: Record<TavernInformationView, string> = {
  public: "只显示公开可观察事实。",
  reveal: "显示结局或手动复盘可揭示的事实。",
  director: "显示导演可见的全部事实。",
};

const emptyValueText = "未设置";

const formatFactType = (type: string) => type.replace(/[_-]+/g, " ").trim();

const isHiddenFactEvent = (event: TavernFactEvent) =>
  (event.visibility ?? "public") !== "public";

const isIdentityFactEvent = (event: TavernFactEvent) =>
  /(?:role|identity|faction|camp|alignment|身份|阵营)/i.test(event.type);

const formatFactAudience = (
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

const formatStatusValue = (value: TavernStatusValue) => {
  if (Array.isArray(value)) {
    return value.length > 0 ? value.join("、") : "无";
  }
  if (typeof value === "boolean") {
    return value ? "是" : "否";
  }
  return value === null || value === "" ? "未记录" : String(value);
};

const statusScopeLabels: Record<TavernStatusDefinition["scope"], string> = {
  global: "全局",
  scene: "场景",
  party: "队伍",
  character: "角色",
  relationship: "关系",
};

const updatePolicyModeLabels: Record<TavernStatusDefinition["updatePolicy"]["mode"], string> = {
  manualOnly: "手动",
  eventDriven: "事件驱动",
  eventDrivenWithReview: "事件驱动/可审核",
  llmSuggestedWithReview: "LLM 建议/审核",
};

const ruleTargetLabels: Record<NonNullable<TavernStatusRule["apply"]["target"]>, string> = {
  eventTarget: "事件目标",
  eventActor: "事件发起者",
  relationshipActorToTarget: "发起者对目标",
  relationshipTargetToActor: "目标对发起者",
};

const statusEventStatusLabels: Record<TavernStatusEvent["status"], string> = {
  applied: "已应用",
  pending: "待确认",
  rejected: "已拒绝",
};

const taskStatusLabels = {
  inactive: "未激活",
  active: "进行中",
  completed: "已完成",
  failed: "已失败",
} as const;

const outcomeStatusLabels = {
  pending: "待确认",
  applied: "已触发",
  dismissed: "已忽略",
} as const;

const outcomeEndSceneLabels: Record<TavernSceneOutcomeDefinition["endScene"], string> = {
  none: "不结束",
  suggest: "建议结束",
  auto: "自动结束",
};

const taskScopeLabels = {
  personal: "个人",
  team: "团队",
  party: "队伍",
  scene: "场景",
  global: "全局",
} as const;

const formatStatusRuleValue = (rule: TavernStatusRule) => {
  if (rule.apply.valueByIntensity) {
    return Object.entries(rule.apply.valueByIntensity)
      .map(([intensity, value]) => `${intensity}:${value}`)
      .join(" / ");
  }
  return formatStatusValue(rule.apply.value ?? null);
};

const formatStatusTarget = (
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

const formatEntityRef = (
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

const formatConditionSummary = (
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

const getProgressStatusItems = (
  views: TavernProgressView[],
  placement: TavernProgressView["placement"],
) =>
  views
    .filter((view) => view.placement === placement)
    .flatMap((view) =>
      view.items.flatMap((item) => item.type === "status" ? [item] : [])
    );

const numericStatusPercent = (
  value: TavernStatusValue,
  definition: TavernStatusDefinition,
) => {
  if (typeof value !== "number") {
    return 0;
  }
  const min = typeof definition.min === "number" ? definition.min : 0;
  const max = typeof definition.max === "number" ? definition.max : 100;
  if (max <= min) {
    return 0;
  }
  return Math.max(0, Math.min(100, ((value - min) / (max - min)) * 100));
};

const resolveStatusTarget = (
  definition: TavernStatusDefinition,
  activeRoom: TavernRoom,
  ownerCharacter?: TavernCharacter,
): TavernStatusTargetRef | null => {
  switch (definition.scope) {
    case "global":
      return { type: "global" };
    case "scene":
      return { type: "scene", sceneId: activeRoom.activeSceneId };
    case "party":
      return { type: "party", partyId: "main" };
    case "character":
      return ownerCharacter ? { type: "character", characterId: ownerCharacter.id } : null;
    case "relationship":
      return null;
  }
};

const createResolvedStatusMetric = ({
  activeRoom,
  definition,
  item,
  ownerCharacter,
}: {
  activeRoom: TavernRoom;
  definition: TavernStatusDefinition;
  item: StatusProgressItem;
  ownerCharacter?: TavernCharacter;
}): ResolvedStatusMetric | null => {
  const target = resolveStatusTarget(definition, activeRoom, ownerCharacter);
  if (!target) {
    return null;
  }
  const value = getTavernStatusSnapshotValue(
    activeRoom.statusSnapshot,
    target,
    definition.id,
  ) ?? definition.defaultValue;
  return {
    key: `${definition.id}:${ownerCharacter?.id ?? "room"}`,
    definition,
    item,
    value,
    percent: numericStatusPercent(value, definition),
  };
};

const createFallbackStatusItem = (statusId: string): StatusProgressItem => ({
  type: "status",
  statusId,
  display: "bar",
});

const conditionReferencesStatus = (
  condition: TavernCondition | undefined,
  statusId: string,
): boolean => {
  if (!condition) {
    return false;
  }
  if ("status" in condition && "target" in condition) {
    return condition.status === statusId;
  }
  if ("all" in condition) {
    return condition.all.some((item) => conditionReferencesStatus(item, statusId));
  }
  if ("any" in condition) {
    return condition.any.some((item) => conditionReferencesStatus(item, statusId));
  }
  if ("not" in condition) {
    return conditionReferencesStatus(condition.not, statusId);
  }
  return false;
};

const isDefaultSceneThreatMetric = (metric: ResolvedStatusMetric) =>
  metric.definition.id === "threat_level" &&
  metric.definition.scope === "scene" &&
  metric.definition.label === "威胁";

const roomHasActiveTaskForStatus = (
  room: TavernRoom,
  statusId: string,
) => room.taskDefinitions.some((task) => {
  if (!isTavernProgressVisibilityVisibleToUser(task.visibility)) {
    return false;
  }
  const status = room.taskSnapshot[task.id]?.status ?? task.lifecycle.initialStatus;
  if (status === "inactive") {
    return false;
  }
  return conditionReferencesStatus(task.lifecycle.startCondition, statusId) ||
    conditionReferencesStatus(task.lifecycle.completeCondition, statusId) ||
    conditionReferencesStatus(task.lifecycle.failCondition, statusId);
});

const shouldUseSituationMetric = (
  metric: ResolvedStatusMetric,
  room: TavernRoom,
) => {
  if (typeof metric.value !== "number") {
    return false;
  }
  if (!isDefaultSceneThreatMetric(metric)) {
    return true;
  }
  return roomHasActiveTaskForStatus(room, metric.definition.id);
};

const formatConditionTargetLabel = (
  target: TavernStatusTargetRef,
  characterNameById: Map<string, string>,
) => {
  switch (target.type) {
    case "global":
      return "全局";
    case "scene":
      return "";
    case "party":
      return `队伍 ${target.partyId}`;
    case "character":
      return characterNameById.get(target.characterId) ?? target.characterId;
    case "relationship": {
      const subject = target.subject.type === "character"
        ? characterNameById.get(target.subject.characterId) ?? target.subject.characterId
        : "你";
      const object = target.object.type === "character"
        ? characterNameById.get(target.object.characterId) ?? target.object.characterId
        : "你";
      return `${subject}对${object}`;
    }
  }
};

const formatTaskConditionCardText = (
  condition: TavernCondition | undefined,
  characterNameById: Map<string, string>,
  statusDefinitionById: Map<string, TavernStatusDefinition>,
): string => {
  if (!condition) {
    return "无额外条件";
  }
  if ("all" in condition) {
    return condition.all.map((item) =>
      formatTaskConditionCardText(item, characterNameById, statusDefinitionById)
    ).join(" 且 ");
  }
  if ("any" in condition) {
    return condition.any.map((item) =>
      formatTaskConditionCardText(item, characterNameById, statusDefinitionById)
    ).join(" 或 ");
  }
  if ("not" in condition) {
    return `非 ${formatTaskConditionCardText(condition.not, characterNameById, statusDefinitionById)}`;
  }
  if ("status" in condition && "target" in condition) {
    const targetLabel = formatConditionTargetLabel(condition.target, characterNameById);
    const statusLabel = statusDefinitionById.get(condition.status)?.label ?? condition.status;
    if (condition.lte !== undefined) {
      return `${targetLabel}${statusLabel}降至 ${condition.lte}`;
    }
    if (condition.gte !== undefined) {
      return `${targetLabel}${statusLabel}达到 ${condition.gte}`;
    }
    if (condition.equals !== undefined) {
      return `${targetLabel}${statusLabel}为 ${formatStatusValue(condition.equals)}`;
    }
    if (condition.notEquals !== undefined) {
      return `${targetLabel}${statusLabel}不是 ${formatStatusValue(condition.notEquals)}`;
    }
    return `${targetLabel}${statusLabel}变化`;
  }
  if ("factEvent" in condition) {
    return `出现 ${condition.factEvent} 事件`;
  }
  if ("task" in condition && "status" in condition) {
    return `任务 ${condition.task} ${taskStatusLabels[condition.status]}`;
  }
  if ("flag" in condition) {
    return `标记 ${condition.flag} 为 ${formatStatusValue(condition.equals)}`;
  }
  return formatConditionSummary(condition, characterNameById);
};

const findTaskStatusCondition = (
  condition: TavernCondition | undefined,
): Extract<TavernCondition, { status: string; target: TavernStatusTargetRef }> | null => {
  if (!condition) {
    return null;
  }
  if ("status" in condition && "target" in condition) {
    return condition;
  }
  if ("all" in condition) {
    return condition.all.map(findTaskStatusCondition).find((item) => item !== null) ?? null;
  }
  if ("any" in condition) {
    return condition.any.map(findTaskStatusCondition).find((item) => item !== null) ?? null;
  }
  return null;
};

const formatTaskNumber = (value: number) =>
  Number.isInteger(value) ? String(value) : value.toFixed(1);

const formatTaskMetricValue = (
  value: TavernStatusValue,
  definition: TavernStatusDefinition,
) => {
  if (typeof value !== "number") {
    return formatStatusValue(value);
  }
  const max = typeof definition.max === "number" ? definition.max : 100;
  return `${formatTaskNumber(Math.round(value))}/${formatTaskNumber(max)}`;
};

const formatTaskConditionTargetText = (
  condition: Extract<TavernCondition, { status: string; target: TavernStatusTargetRef }>,
) => {
  if (condition.lte !== undefined) {
    return `目标 ≤ ${formatTaskNumber(condition.lte)}`;
  }
  if (condition.gte !== undefined) {
    return `目标 ≥ ${formatTaskNumber(condition.gte)}`;
  }
  if (condition.equals !== undefined) {
    return `目标 = ${formatStatusValue(condition.equals)}`;
  }
  if (condition.notEquals !== undefined) {
    return `目标 ≠ ${formatStatusValue(condition.notEquals)}`;
  }
  return "等待变化";
};

const resolveTaskTargetPercent = (
  condition: Extract<TavernCondition, { status: string; target: TavernStatusTargetRef }>,
  definition: TavernStatusDefinition,
) => {
  const targetValue =
    condition.lte ??
    condition.gte ??
    (typeof condition.equals === "number" ? condition.equals : undefined);
  return typeof targetValue === "number"
    ? numericStatusPercent(targetValue, definition)
    : undefined;
};

const resolveTaskConditionMetric = ({
  activeRoom,
  task,
  characterNameById,
  statusDefinitionById,
}: {
  activeRoom: TavernRoom;
  task: TavernTaskDefinition;
  characterNameById: Map<string, string>;
  statusDefinitionById: Map<string, TavernStatusDefinition>;
}) => {
  const condition = findTaskStatusCondition(task.lifecycle.completeCondition);
  if (!condition) {
    return null;
  }

  const definition = statusDefinitionById.get(condition.status);
  if (!definition) {
    return null;
  }

  const value = getTavernStatusSnapshotValue(
    activeRoom.statusSnapshot,
    condition.target,
    definition.id,
  ) ?? definition.defaultValue;
  const targetLabel = formatConditionTargetLabel(condition.target, characterNameById);
  const metricLabel = `${targetLabel}${definition.label}` || definition.label;

  return {
    mode: "status",
    label: metricLabel,
    valueText: formatTaskMetricValue(value, definition),
    currentText: `当前：${metricLabel} ${formatStatusValue(value)}`,
    percent: numericStatusPercent(value, definition),
    targetText: formatTaskConditionTargetText(condition),
    targetPercent: resolveTaskTargetPercent(condition, definition),
  } satisfies TaskValueDisplay;
};

const resolveTaskProgressDisplay = ({
  activeRoom,
  task,
  state,
  characterNameById,
  statusDefinitionById,
}: {
  activeRoom: TavernRoom;
  task: TavernTaskDefinition;
  state?: TavernTaskState;
  characterNameById: Map<string, string>;
  statusDefinitionById: Map<string, TavernStatusDefinition>;
}): Pick<TaskCardData, "metric"> => {
  if (state?.progress && state.progress.target > 0) {
    return {
      metric: {
        mode: "progress",
        label: "任务进度",
        valueText: `${state.progress.current}/${state.progress.target}`,
        currentText: `当前：${state.progress.current} / ${state.progress.target}`,
        percent: Math.max(0, Math.min(100, (state.progress.current / state.progress.target) * 100)),
        targetText: `目标 ${state.progress.target}`,
        targetPercent: 100,
      },
    };
  }

  const status = state?.status ?? task.lifecycle.initialStatus;
  switch (status) {
    case "completed":
      return {};
    case "failed":
      return {};
    case "active": {
      const conditionMetric = resolveTaskConditionMetric({
        activeRoom,
        task,
        characterNameById,
        statusDefinitionById,
      });
      if (conditionMetric) {
        return { metric: conditionMetric };
      }
      if (task.progress?.target) {
        return {
          metric: {
            mode: "progress",
            label: "任务进度",
            valueText: `0/${task.progress.target}`,
            currentText: `当前：0 / ${task.progress.target}`,
            percent: 0,
            targetText: `目标 ${task.progress.target}`,
            targetPercent: 100,
          },
        };
      }
      return {};
    }
    case "inactive":
      return {};
  }
};

const AssetDraftPreview = ({
  draft,
  index,
  roomCharacters,
  isBusy,
  onApply,
  onDelete,
}: {
  draft: TavernAssetDraft;
  index: number;
  roomCharacters: TavernCharacter[];
  isBusy: boolean;
  onApply: () => void;
  onDelete: () => void;
}) => {
  const characterById = new Map(roomCharacters.map((character) => [character.id, character]));
  const draftSummary = [
    draft.timelineEvents.length > 0 ? `${draft.timelineEvents.length} 时间线` : "",
    draft.characterMemories.length > 0 ? `${draft.characterMemories.length} 记忆` : "",
    draft.lorebookEntries.length > 0 ? `${draft.lorebookEntries.length} 世界书` : "",
  ].filter(Boolean).join(" / ");

  return (
    <div className="space-y-3 rounded-md border border-current/10 bg-current/5 p-3 text-current">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-xs font-semibold">草稿 {index + 1}</div>
          {draftSummary && (
            <div className="mt-0.5 text-xs opacity-65">{draftSummary}</div>
          )}
        </div>
        <div className="flex shrink-0 gap-1">
          <Button
            type="button"
            size="xs"
            disabled={isBusy}
            onClick={onApply}
          >
            <Save className="size-3.5" />
            应用
          </Button>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="size-7"
            title="忽略草稿"
            aria-label="忽略草稿"
            disabled={isBusy}
            onClick={onDelete}
          >
            <Trash2 className="size-3.5" />
          </Button>
        </div>
      </div>

      {draft.timelineEvents.length > 0 && (
        <div className="space-y-1.5">
          <div className="text-xs font-medium opacity-70">时间线</div>
          {draft.timelineEvents.map((event) => (
            <div key={event.id} className="rounded-md bg-current/5 px-2.5 py-2">
              <div className="text-xs font-medium">{event.title || emptyValueText}</div>
              <div className="mt-1 whitespace-pre-wrap text-xs leading-5 opacity-70">
                {event.summary || emptyValueText}
              </div>
            </div>
          ))}
        </div>
      )}

      {draft.characterMemories.length > 0 && (
        <div className="space-y-1.5">
          <div className="text-xs font-medium opacity-70">角色记忆</div>
          {draft.characterMemories.map((memory) => (
            <div key={memory.id} className="rounded-md bg-current/5 px-2.5 py-2">
              <div className="text-xs font-medium">
                {characterById.get(memory.characterId)?.name ?? "角色"}
              </div>
              <div className="mt-1 whitespace-pre-wrap text-xs leading-5 opacity-70">
                {memory.note || emptyValueText}
              </div>
            </div>
          ))}
        </div>
      )}

      {draft.lorebookEntries.length > 0 && (
        <div className="space-y-1.5">
          <div className="text-xs font-medium opacity-70">世界书</div>
          {draft.lorebookEntries.map((entry) => (
            <div key={entry.id} className="rounded-md bg-current/5 px-2.5 py-2">
              <div className="text-xs font-medium">{entry.title || emptyValueText}</div>
              {entry.keywords.length > 0 && (
                <div className="mt-1 text-[11px] opacity-60">
                  {entry.keywords.join("，")}
                </div>
              )}
              <div className="mt-1 whitespace-pre-wrap text-xs leading-5 opacity-70">
                {entry.content || emptyValueText}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export const SidePanel = ({
  bind,
  isOpen,
  onOpenChange,
}: SidePanelProps) => {
  const {
    activeRoom,
    workspace,
    visualPreset,
    activeCharacter,
    roomCharacters,
    roomMessages,
    runtimeModel,
    runtimeAgentId,
    isSending,
    patchRoom,
    appendMessagesToRoom,
    reportError,
    resetExecutionTrace,
    patchExecutionStep,
    setExecutionTraceAnchorMessageId,
  } = useTavernPageContext();
  const [isExtractingAssets, setIsExtractingAssets] = useState(false);
  const [isTrackingProgress, setIsTrackingProgress] = useState(false);
  const [compactingCharacterIds, setCompactingCharacterIds] = useState<Set<string>>(() => new Set());
  const [pendingDangerAction, setPendingDangerAction] = useState<SidePanelDangerAction | null>(null);
  const plotDataRef = useRef<PlotDataSectionHandle | null>(null);
  const isBusy = isSending || isExtractingAssets || isTrackingProgress;

  const requestDangerAction = (action: SidePanelDangerAction) => {
    setPendingDangerAction(action);
  };

  const closeDangerAction = () => {
    setPendingDangerAction(null);
  };

  const confirmDangerAction = () => {
    if (!pendingDangerAction) {
      return;
    }

    pendingDangerAction.onConfirm();
    closeDangerAction();
  };

  useImperativeHandle(bind, () => ({
    show: () => onOpenChange(true),
    hide: () => onOpenChange(false),
    toggle: () => onOpenChange(!isOpen),
  }), [bind, isOpen, onOpenChange]);

  if (!isOpen || !activeRoom) {
    return null;
  }

  const userPersonaName = activeRoom.userPersonaName.trim();
  const activeScene = activeRoom.scenes?.find((scene) => scene.id === activeRoom.activeSceneId);
  const sceneOverviewTitle =
    activeRoom.sceneStatus?.location?.trim() ||
    activeScene?.title?.trim() ||
    activeRoom.title.trim() ||
    "当前场景";
  const sceneOverviewPhase =
    activeRoom.sceneStatus?.scenePhase?.trim() ||
    activeRoom.sceneStatus?.atmosphere?.trim() ||
    activeRoom.sceneStatus?.timeLabel?.trim() ||
    "进行中";
  const sceneStatusItems = [
    `回复方式：${replyModeDescriptions[activeRoom.replyMode ?? "active"]}`,
    userPersonaName && userPersonaName !== "我" ? `你的称呼：${userPersonaName}` : "",
    `沉浸描写：${activeRoom.settings.immersiveDescriptionEnabled ? "开启" : "关闭"}`,
    `生成过程：${activeRoom.settings.showExecutionTrace ? "显示" : "隐藏"}`,
    `自动整理资产：${activeRoom.settings.autoAssetExtractionEnabled ? "开启" : "关闭"}`,
  ].filter(Boolean);
  const characterNameById = new Map(roomCharacters.map((character) => [character.id, character.name]));
  const enabledLorebookCount = activeRoom.lorebookEntries.filter((entry) => entry.enabled).length;
  const statusDefinitionById = new Map(activeRoom.statusDefinitions.map((definition) => [definition.id, definition]));
  const pendingStatusEvents = activeRoom.statusEvents
    .filter((event) => event.status === "pending")
    .filter((event) => {
      const visibility = statusDefinitionById.get(event.statusId)?.visibility;
      return isTavernProgressVisibilityVisibleToUser(visibility ?? "public");
    })
    .slice(-6);
  const visibleStatusDefinitions = activeRoom.statusDefinitions.filter((definition) =>
    isTavernProgressVisibilityVisibleToUser(definition.visibility)
  );
  const sidePanelStatusItems = getProgressStatusItems(activeRoom.progressViews, "sidePanel");
  const sidePanelSituationMetrics = sidePanelStatusItems
    .flatMap((item) => {
      const definition = statusDefinitionById.get(item.statusId);
      if (
        !definition ||
        !isTavernProgressVisibilityVisibleToUser(definition.visibility) ||
        !["global", "scene", "party"].includes(definition.scope)
      ) {
        return [];
      }
      const metric = createResolvedStatusMetric({ activeRoom, definition, item });
      return metric ? [metric] : [];
    });
  const situationMetric =
    sidePanelSituationMetrics
      .filter((metric) => shouldUseSituationMetric(metric, activeRoom))
      .find((metric) => /威胁|风险|危机|局势/.test(metric.definition.label)) ??
    sidePanelSituationMetrics.find((metric) => shouldUseSituationMetric(metric, activeRoom)) ??
    null;
  const configuredCharacterStatusItems = getProgressStatusItems(activeRoom.progressViews, "characterCard")
    .filter((item) => {
      const definition = statusDefinitionById.get(item.statusId);
      return definition?.scope === "character" &&
        isTavernProgressVisibilityVisibleToUser(definition.visibility);
    });
  const fallbackCharacterStatusItems = visibleStatusDefinitions
    .filter((definition) => definition.scope === "character")
    .map((definition) => createFallbackStatusItem(definition.id));
  const characterStatusItems = configuredCharacterStatusItems.length > 0
    ? configuredCharacterStatusItems
    : fallbackCharacterStatusItems;
  const characterMetricsById = new Map(roomCharacters.map((character) => {
    const metrics = characterStatusItems
      .flatMap((item) => {
        const definition = statusDefinitionById.get(item.statusId);
        if (!definition || definition.scope !== "character") {
          return [];
        }
        const metric = createResolvedStatusMetric({
          activeRoom,
          definition,
          item,
          ownerCharacter: character,
        });
        return metric ? [metric] : [];
      })
      .slice(0, 2);
    return [character.id, metrics] as const;
  }));
  const visibleStatusRules = activeRoom.statusRules.filter((rule) => {
    const definition = statusDefinitionById.get(rule.apply.statusId);
    return definition ? isTavernProgressVisibilityVisibleToUser(definition.visibility) : true;
  });
  const visibleTaskDefinitions = activeRoom.taskDefinitions.filter((task) =>
    isTavernProgressVisibilityVisibleToUser(task.visibility)
  );
  const activeTaskCards: TaskCardData[] = visibleTaskDefinitions
    .map((task) => {
      const state = activeRoom.taskSnapshot[task.id];
      const status = state?.status ?? task.lifecycle.initialStatus;
      const progressDisplay = resolveTaskProgressDisplay({
        activeRoom,
        task,
        state,
        characterNameById,
        statusDefinitionById,
      });
      return {
        task,
        state,
        status,
        ...progressDisplay,
      };
    })
    .filter((item) => item.status !== "inactive")
    .slice(0, 4);
  const visibleSceneOutcomes = activeRoom.sceneOutcomes.filter((outcome) =>
    isTavernProgressVisibilityVisibleToUser(outcome.visibility)
  );
  const pendingOutcomeEvents = activeRoom.outcomeEvents.filter((event) => event.status === "pending");
  const recentStatusEvents = activeRoom.statusEvents
    .filter((event) => isTavernProgressVisibilityVisibleToUser(event.visibility))
    .slice(-12)
    .reverse();
  const recentTaskEvents = activeRoom.taskEvents
    .filter((event) => {
      const task = activeRoom.taskDefinitions.find((definition) => definition.id === event.taskId);
      return task ? isTavernProgressVisibilityVisibleToUser(task.visibility) : true;
    })
    .slice(-8)
    .reverse();
  const recentIllustrationHints = activeRoom.illustrationHints.slice(-4).reverse();
  const privateIntelEvents = filterTavernFactEventsForAudience({
    factEvents: activeRoom.factEvents,
    room: activeRoom,
    audience: { type: "user" },
  }).filter((event) => event.visibleToUser || event.visibility !== "public");
  const currentInformationView = resolveTavernInformationView({
    policy: activeRoom.settings.informationPolicy,
    outcomeEvents: activeRoom.outcomeEvents,
  });
  const reviewFactEvents = filterTavernFactEventsForAudience({
    factEvents: activeRoom.factEvents,
    room: activeRoom,
    audience: currentInformationView === "director" ? { type: "director" } : { type: "user" },
  });
  const hiddenFactCount = activeRoom.factEvents.filter(isHiddenFactEvent).length;
  const reviewHiddenFactCount = reviewFactEvents.filter(isHiddenFactEvent).length;
  const identityFactEvents = privateIntelEvents.filter(isIdentityFactEvent);
  const roleAssignment = activeRoom.settings.informationPolicy.roleAssignment;
  const generatedRoleAssignmentCount = activeRoom.factEvents.filter(isGeneratedTavernRoleAssignmentFactEvent).length;
  const patchInformationView = (view: TavernInformationView) => {
    patchRoom(activeRoom.id, {
      settings: {
        ...activeRoom.settings,
        informationPolicy: {
          ...activeRoom.settings.informationPolicy,
          uiDefaultView: view,
        },
      },
    });
  };
  const patchFactVisibleToUser = (factEventId: string, visibleToUser: boolean) => {
    patchRoom(activeRoom.id, {
      factEvents: activeRoom.factEvents.map((event) => {
        if (event.id !== factEventId) {
          return event;
        }

        const nextEvent = { ...event };
        if (visibleToUser) {
          nextEvent.visibleToUser = true;
          nextEvent.revealWhen = nextEvent.revealWhen ?? "manual";
        } else {
          delete nextEvent.visibleToUser;
        }
        return nextEvent;
      }),
    });
  };
  const assignRoles = () => {
    const roleFacts = assignTavernRoleFacts({
      room: activeRoom,
      characters: roomCharacters,
    });
    if (roleFacts.length === 0) {
      return;
    }

    patchRoom(activeRoom.id, {
      factEvents: [
        ...activeRoom.factEvents.filter((event) => !isGeneratedTavernRoleAssignmentFactEvent(event)),
        ...roleFacts,
      ],
      updatedAt: Date.now(),
    });
  };
  const applyAssetDraft = (draftId: string) => {
    const draft = activeRoom.assetDrafts.find((item) => item.id === draftId);
    if (!draft) {
      return;
    }

    const timelineEvents = draft.timelineEvents.filter((event) =>
      event.title.trim() && event.summary.trim()
    );
    const memoryDrafts = draft.characterMemories.filter((memory) =>
      memory.characterId.trim() && memory.note.trim()
    );
    const lorebookEntries = draft.lorebookEntries.filter((entry) =>
      entry.title.trim() && entry.content.trim()
    );
    const characterMemories = { ...activeRoom.characterMemories };
    const characterConfigs = { ...(activeRoom.characterConfigs ?? {}) };
    for (const memory of memoryDrafts) {
      const existing = characterMemories[memory.characterId]?.trim() ?? "";
      const nextNote = memory.note.trim();
      characterMemories[memory.characterId] = existing
        ? [existing, nextNote].join("\n")
        : nextNote;
      characterConfigs[memory.characterId] = {
        ...(characterConfigs[memory.characterId] ?? { characterId: memory.characterId }),
        memory: characterMemories[memory.characterId],
      };
    }

    patchRoom(activeRoom.id, {
      characterConfigs,
      characterMemories,
      timelineEvents: [
        ...activeRoom.timelineEvents,
        ...timelineEvents.map((event) => createTavernTimelineEvent(event)),
      ],
      lorebookEntries: [
        ...activeRoom.lorebookEntries,
        ...lorebookEntries.map((entry) => createTavernLorebookEntry(entry)),
      ],
      assetDrafts: activeRoom.assetDrafts.filter((item) => item.id !== draftId),
    });
  };
  const deleteAssetDraft = (draftId: string) => {
    const draft = activeRoom.assetDrafts.find((item) => item.id === draftId);
    if (!draft) {
      return;
    }

    requestDangerAction({
      title: "忽略草稿",
      description:
        "忽略这份待确认草稿？草稿中的时间线、记忆和世界书建议都会被删除。",
      confirmLabel: "忽略草稿",
      onConfirm: () => {
        const room = projectTavernSceneOntoRoom(activeRoom);
        patchRoom(activeRoom.id, {
          assetDrafts: room.assetDrafts.filter((draft) => draft.id !== draftId),
        });
      },
    });
  };
  const clearIllustrationHints = () => {
    if (activeRoom.illustrationHints.length === 0) {
      return;
    }

    requestDangerAction({
      title: "清空插图提示",
      description:
        "清空当前场景的插图提示？这些导演生成的画面提示会从当前场景中移除。",
      confirmLabel: "清空提示",
      onConfirm: () => {
        patchRoom(activeRoom.id, {
          illustrationHints: [],
        });
      },
    });
  };
  const extractRecentAssets = async () => {
    if (isBusy) {
      return;
    }

    if (!runtimeModel) {
      reportError("请先在设置中选择模型，再整理剧情资产。");
      return;
    }

    if (!runtimeAgentId) {
      reportError("请先选择可用的 Agent 运行配置。");
      return;
    }

    if (roomCharacters.length === 0) {
      reportError("当前房间还没有可整理的角色。");
      return;
    }

    if (activeRoom.assetDrafts.length >= activeRoom.settings.maxAssetDrafts) {
      reportError("待确认草稿已达上限，请先应用或忽略一部分草稿。");
      return;
    }

    const availableMessages = roomMessages.filter((message) =>
      message.status !== "streaming" && message.status !== "error"
    );
    const contextMessages = availableMessages.slice(-30);
    const sourceMessages = availableMessages.slice(-12);
    if (sourceMessages.length === 0) {
      reportError("当前房间还没有可整理的对话。");
      return;
    }

    setIsExtractingAssets(true);
    reportError("");
    if (activeRoom.settings.showExecutionTrace) {
      setExecutionTraceAnchorMessageId(roomMessages.at(-1)?.id ?? "");
      resetExecutionTrace([{
        id: "manual-asset-extraction",
        label: "整理最近对话",
        detail: "从最近对话中提取待确认剧情资产。",
        status: "running",
      }]);
    }

    try {
      const extractedDraft = await runTavernAssetExtraction({
        workspacePath: workspace.path,
        runtimeAgentId,
        runtimeModel: requireTavernRuntimeModelInput(runtimeModel),
        room: activeRoom,
        characters: roomCharacters,
        messages: contextMessages,
        sourceMessages,
        references: [],
        currentUserText: "手动整理最近对话中值得沉淀的剧情资产。",
      });
      const assetDraft = createTavernAssetDraft(extractedDraft);
      if (!hasAssetDraftItems(assetDraft)) {
        patchExecutionStep("manual-asset-extraction", {
          status: "done",
          detail: "没有发现新的稳定剧情资产。",
        });
        reportError("最近对话没有整理出新的剧情资产。");
        return;
      }

      const room = projectTavernSceneOntoRoom(activeRoom);
      patchRoom(activeRoom.id, {
        assetDrafts: [...room.assetDrafts, assetDraft]
          .slice(-activeRoom.settings.maxAssetDrafts),
      });
      patchExecutionStep("manual-asset-extraction", {
        status: "done",
        detail: "已生成待确认草稿。",
      });
    } catch (assetError) {
      patchExecutionStep("manual-asset-extraction", {
        status: "error",
        detail: getErrorMessage(assetError),
      });
      reportError(`剧情资产整理失败：${getErrorMessage(assetError)}`);
    } finally {
      setIsExtractingAssets(false);
    }
  };
  const trackRecentProgress = async () => {
    if (isBusy) {
      return;
    }

    if (!runtimeModel) {
      reportError("请先在设置中选择模型，再更新状态。");
      return;
    }

    if (!runtimeAgentId) {
      reportError("请先选择可用的 Agent 运行配置。");
      return;
    }

    if (roomCharacters.length === 0) {
      reportError("当前房间还没有可更新状态的角色。");
      return;
    }

    if (activeRoom.statusDefinitions.length === 0 || activeRoom.statusRules.length === 0) {
      reportError("当前房间还没有状态定义或状态规则。");
      return;
    }

    const availableMessages = roomMessages.filter((message) =>
      message.status !== "streaming" && message.status !== "error"
    );
    const contextMessages = availableMessages.slice(-30);
    const sourceMessages = availableMessages.slice(-12);
    if (sourceMessages.length === 0) {
      reportError("当前房间还没有可更新状态的对话。");
      return;
    }

    const progressTurnId = sourceMessages.at(-1)?.turnId ?? sourceMessages.at(-1)?.id ?? `manual-${Date.now()}`;
    setIsTrackingProgress(true);
    reportError("");
    if (activeRoom.settings.showExecutionTrace) {
      setExecutionTraceAnchorMessageId(sourceMessages.at(-1)?.id ?? "");
      resetExecutionTrace([{
        id: "manual-progress-tracking",
        label: "手动更新状态",
        detail: "从最近对话中抽取事实事件并应用状态规则。",
        status: "running",
      }]);
    }

    try {
      const factEvents = await runTavernProgressTracking({
        workspacePath: workspace.path,
        runtimeAgentId,
        runtimeModel: requireTavernRuntimeModelInput(runtimeModel),
        room: activeRoom,
        characters: roomCharacters,
        messages: contextMessages,
        sourceMessages,
        references: [],
        currentUserText: "手动更新最近对话中的状态、任务与结局。",
        turnId: progressTurnId,
      });

      if (factEvents.length === 0) {
        patchExecutionStep("manual-progress-tracking", {
          status: "done",
          detail: "最近对话没有明确状态事件。",
        });
        toast.info("最近对话没有明确状态事件。");
        return;
      }

      const progressPatch = advanceTavernProgressFromFactEvents({
        room: activeRoom,
        factEvents,
        turnId: progressTurnId,
        createdAt: Date.now(),
      });
      const { actionMessages, ...progressRoomPatch } = progressPatch;
      const progressedRoom = appendProgressCheckpointToRoom(
        syncTavernRoomActiveScene({
          ...projectTavernSceneOntoRoom(activeRoom),
          ...progressRoomPatch,
          updatedAt: Date.now(),
        }),
        "manual",
        progressTurnId,
      );
      patchRoom(activeRoom.id, {
        ...progressRoomPatch,
        statusCheckpoints: progressedRoom.statusCheckpoints,
      });
      if (actionMessages.length > 0) {
        appendMessagesToRoom(activeRoom.id, actionMessages);
      }
      patchExecutionStep("manual-progress-tracking", {
        status: "done",
        detail: `已抽取 ${factEvents.length} 个事实事件。`,
      });
      toast.success("状态面板已更新。");
    } catch (progressError) {
      patchExecutionStep("manual-progress-tracking", {
        status: "error",
        detail: getErrorMessage(progressError),
      });
      reportError(`状态更新失败：${getErrorMessage(progressError)}`);
    } finally {
      setIsTrackingProgress(false);
    }
  };
  const rebuildProgressFromHistory = () => {
    const rebuiltProgress = rebuildTavernProgressFromHistory({
      room: activeRoom,
      createdAt: Date.now(),
    });
    const rebuiltRoom = appendProgressCheckpointToRoom(
      syncTavernRoomActiveScene({
        ...projectTavernSceneOntoRoom(activeRoom),
        ...rebuiltProgress,
        updatedAt: Date.now(),
      }),
      "rebuild",
      rebuiltProgress.statusSnapshot.turnId,
    );
    patchRoom(activeRoom.id, {
      ...rebuiltProgress,
      statusCheckpoints: rebuiltRoom.statusCheckpoints,
    });
    toast.success("状态面板已从 checkpoint 和事件历史重建。");
  };
  const resolvePendingStatusEvent = (
    statusEventId: string,
    resolution: "applied" | "rejected",
  ) => {
    const progressPatch = resolveTavernPendingStatusEvent({
      room: activeRoom,
      statusEventId,
      resolution,
      createdAt: Date.now(),
    });
    if (!progressPatch) {
      reportError("未找到可处理的待确认状态事件。");
      return;
    }

    const { actionMessages, ...progressRoomPatch } = progressPatch;
    const progressedRoom = appendProgressCheckpointToRoom(
      syncTavernRoomActiveScene({
        ...projectTavernSceneOntoRoom(activeRoom),
        ...progressRoomPatch,
        updatedAt: Date.now(),
      }),
      "manual",
      progressRoomPatch.statusSnapshot.turnId,
    );
    patchRoom(activeRoom.id, {
      ...progressRoomPatch,
      statusCheckpoints: progressedRoom.statusCheckpoints,
    });
    if (actionMessages.length > 0) {
      appendMessagesToRoom(activeRoom.id, actionMessages);
    }
    toast.success(resolution === "applied" ? "状态事件已应用。" : "状态事件已拒绝。");
  };
  const resolvePendingOutcomeEvent = (
    outcomeEventId: string,
    resolution: "applied" | "dismissed",
  ) => {
    const progressPatch = resolveTavernPendingOutcomeEvent({
      room: activeRoom,
      outcomeEventId,
      resolution,
    });
    if (!progressPatch) {
      reportError("未找到可处理的待确认结局事件。");
      return;
    }

    const progressedRoom = appendProgressCheckpointToRoom(
      syncTavernRoomActiveScene({
        ...projectTavernSceneOntoRoom(activeRoom),
        ...progressPatch,
        updatedAt: Date.now(),
      }),
      "manual",
      activeRoom.statusSnapshot.turnId,
    );
    patchRoom(activeRoom.id, {
      ...progressPatch,
      statusCheckpoints: progressedRoom.statusCheckpoints,
    });
    toast.success(resolution === "applied" ? "结局已应用，复盘视角可用。" : "结局已忽略。");
  };
  const compactCharacterKnowledge = async (characterId: string) => {
    const character = roomCharacters.find((item) => item.id === characterId);
    if (!character) {
      reportError("未找到要压缩知识的角色。");
      return;
    }

    if (!runtimeModel) {
      reportError("请先在设置中选择模型，再压缩角色知识。");
      return;
    }

    if (!runtimeAgentId) {
      reportError("请先选择可用的 Agent 运行配置。");
      return;
    }

    setCompactingCharacterIds((current) => new Set([...current, characterId]));
    reportError("");
    try {
      const result = await compactTavernAgentKnowledge({
        workspacePath: workspace.path,
        room: activeRoom,
        runtimeAgentId,
        runtimeModel: requireTavernRuntimeModelInput(runtimeModel),
        agentRoleId: tavernCharacterAgentRoleId(activeRoom, character),
        compactInstruction: [
          `压缩「${character.name}」在当前酒馆中的长期角色知识。`,
          "保留角色已经知道的公开事实、自己产生过的心理与承诺、与其他角色的关系变化。",
          "不要引入其他角色未公开的心理描写。",
        ].join("\n"),
      });
      toast.success(result?.compacted === false
        ? `${character.name} 的底层 session 暂无可压缩内容。`
        : `已压缩 ${character.name} 的角色知识。`);
    } catch (compactError) {
      reportError(`压缩角色知识失败：${getErrorMessage(compactError)}`);
    } finally {
      setCompactingCharacterIds((current) => {
        const next = new Set(current);
        next.delete(characterId);
        return next;
      });
    }
  };
  const shouldShowIllustrationHints =
    activeRoom.settings.illustrationHints.enabled || recentIllustrationHints.length > 0;
  const sceneOverviewTaskCards = activeTaskCards.map((data) => ({
    data,
    conditionText: formatTaskConditionCardText(
      data.task.lifecycle.completeCondition,
      characterNameById,
      statusDefinitionById,
    ),
  }));

  return (
    <aside
      className={cn(
        "hidden min-h-0 flex-col border-l lg:flex",
        visualPreset.tavern.sidePanel,
      )}
    >
      <ScrollArea className="min-h-0 flex-1">
        <div className="space-y-5 p-4">
          <SceneOverviewSection
            sceneTitle={sceneOverviewTitle}
            scenePhase={sceneOverviewPhase}
            sceneStatusItems={sceneStatusItems}
            immersiveDescriptionEnabled={activeRoom.settings.immersiveDescriptionEnabled}
            scene={activeRoom.scene}
            sceneGoal={activeRoom.sceneGoal}
            memory={activeRoom.memory}
            identityFactEvents={identityFactEvents}
            pendingStatusEvents={pendingStatusEvents}
            statusDefinitionById={statusDefinitionById}
            isSending={isSending}
            isBusy={isBusy}
            isTrackingProgress={isTrackingProgress}
            situationMetric={situationMetric}
            taskCards={sceneOverviewTaskCards}
            onOpenDetail={(detailPanel) => plotDataRef.current?.open(detailPanel)}
            onImmersiveDescriptionChange={(checked) => patchRoom(activeRoom.id, {
              settings: {
                ...activeRoom.settings,
                immersiveDescriptionEnabled: checked,
              },
            })}
            onTrackRecentProgress={() => void trackRecentProgress()}
            onRebuildProgress={rebuildProgressFromHistory}
            onResolvePendingStatusEvent={resolvePendingStatusEvent}
          />

          {shouldShowIllustrationHints && (
            <section className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-[13px] font-semibold">
                  <Sparkles className="size-4 text-primary" />
                  插图提示
                </div>
                <span className="rounded-md border border-current/10 bg-current/5 px-2 py-0.5 text-[11px] text-current opacity-70">
                  {activeRoom.settings.illustrationHints.enabled ? "开启" : "已关闭"}
                </span>
              </div>
              <div className="space-y-2">
                {recentIllustrationHints.length > 0 ? (
                  recentIllustrationHints.map((hint) => (
                    <div
                      key={hint.id}
                      className="rounded-lg border border-current/10 bg-background/35 px-3 py-2.5 text-[11px] leading-4 text-current shadow-sm"
                    >
                      {hint.prompt}
                    </div>
                  ))
                ) : (
                  <EmptyPanelCard>本场景还没有生成插图提示。</EmptyPanelCard>
                )}
              </div>
            </section>
          )}

          <section className="space-y-3">
            <div className="flex min-h-8 items-center gap-2 text-sm font-semibold leading-tight text-current">
              <UsersRound className="size-4 shrink-0 text-primary" />
              <span className="truncate">入席角色</span>
            </div>
            <div className="space-y-2">
              {roomCharacters.map((character) => {
                const isCompacting = compactingCharacterIds.has(character.id);
                return (
                  <CharacterStatusRow
                    key={character.id}
                    character={character}
                    room={activeRoom}
                    isActive={character.id === activeCharacter?.id}
                    disabled={isSending}
                    memory={activeRoom.characterMemories[character.id] ?? ""}
                    metrics={characterMetricsById.get(character.id) ?? []}
                    isBusy={isBusy}
                    isCompacting={isCompacting}
                    onClick={() => patchRoom(activeRoom.id, { activeCharacterId: character.id })}
                    onCompact={() => void compactCharacterKnowledge(character.id)}
                  />
                );
              })}
              {roomCharacters.length === 0 && (
                <EmptyPanelCard>还没有角色入席。</EmptyPanelCard>
              )}
            </div>
          </section>

          <PlotDataSection
            activeRoom={activeRoom}
            isBusy={isBusy}
            isExtractingAssets={isExtractingAssets}
            enabledLorebookCount={enabledLorebookCount}
            visibleStatusDefinitionCount={visibleStatusDefinitions.length}
            visibleStatusRuleCount={visibleStatusRules.length}
            pendingStatusEventCount={pendingStatusEvents.length}
            visibleTaskDefinitionCount={visibleTaskDefinitions.length}
            visibleSceneOutcomeCount={visibleSceneOutcomes.length}
            pendingOutcomeEventCount={pendingOutcomeEvents.length}
            currentInformationViewLabel={informationViewLabels[currentInformationView]}
            reviewHiddenFactCount={reviewHiddenFactCount}
            hiddenFactCount={hiddenFactCount}
            privateIntelCount={privateIntelEvents.length}
            identityFactCount={identityFactEvents.length}
            onExtractRecentAssets={() => void extractRecentAssets()}
            bind={plotDataRef}
            renderDetailContent={(detailPanel) => (
              <>
              {detailPanel === "asset-drafts" && (
                activeRoom.assetDrafts.length > 0 ? (
                  <div className="space-y-3">
                    {activeRoom.assetDrafts.map((draft, index) => (
                      <AssetDraftPreview
                        key={draft.id}
                        draft={draft}
                        index={index}
                        roomCharacters={roomCharacters}
                        isBusy={isBusy}
                        onApply={() => applyAssetDraft(draft.id)}
                        onDelete={() => deleteAssetDraft(draft.id)}
                      />
                    ))}
                  </div>
                ) : (
                  <div className="rounded-md border bg-background/60 px-4 py-8 text-center text-sm text-muted-foreground">
                    暂无待确认草稿。
                  </div>
                )
              )}

              {detailPanel === "timeline" && (
                activeRoom.timelineEvents.length > 0 ? (
                  <div className="space-y-3">
                    {activeRoom.timelineEvents.map((event, index) => (
                      <div key={event.id} className="rounded-md border bg-background/60 p-3">
                        <div className="flex items-center gap-2">
                          <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-muted text-xs font-medium text-muted-foreground">
                            {index + 1}
                          </span>
                          <span className="min-w-0 truncate text-sm font-medium">{event.title}</span>
                        </div>
                        <div className="mt-2 whitespace-pre-wrap text-sm leading-6 text-muted-foreground">
                          {event.summary}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-md border bg-background/60 px-4 py-8 text-center text-sm text-muted-foreground">
                    暂无剧情事件。
                  </div>
                )
              )}

              {detailPanel === "lorebook" && (
                activeRoom.lorebookEntries.length > 0 ? (
                  <div className="space-y-3">
                    {activeRoom.lorebookEntries.map((entry) => (
                      <div key={entry.id} className="rounded-md border bg-background/60 p-3">
                        <div className="flex items-center justify-between gap-2">
                          <div className="min-w-0 truncate text-sm font-medium">{entry.title}</div>
                          <div className="flex shrink-0 items-center gap-1">
                            {entry.alwaysOn && (
                              <span className="rounded-md bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
                                常驻
                              </span>
                            )}
                            <span className="rounded-md bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
                              {entry.enabled ? "启用" : "停用"}
                            </span>
                          </div>
                        </div>
                        {entry.keywords.length > 0 && (
                          <div className="mt-1 text-xs text-muted-foreground">
                            {entry.keywords.join("，")}
                          </div>
                        )}
                        <div className="mt-2 whitespace-pre-wrap text-sm leading-6 text-muted-foreground">
                          {entry.content}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-md border bg-background/60 px-4 py-8 text-center text-sm text-muted-foreground">
                    暂无世界书。
                  </div>
                )
              )}

              {detailPanel === "illustration-hints" && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-sm font-medium">
                      {activeRoom.illustrationHints.length} 条提示
                    </div>
                    <Button
                      type="button"
                      size="xs"
                      variant="outline"
                      className="border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
                      disabled={isBusy || activeRoom.illustrationHints.length === 0}
                      onClick={clearIllustrationHints}
                    >
                      <Trash2 className="size-3.5" />
                      清空
                    </Button>
                  </div>
                  {activeRoom.illustrationHints.length > 0 ? (
                    <div className="space-y-3">
                      {activeRoom.illustrationHints.slice().reverse().map((hint, index) => (
                        <div key={hint.id} className="rounded-md border bg-background/60 p-3">
                          <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                            <span>#{activeRoom.illustrationHints.length - index}</span>
                            <span>{new Date(hint.createdAt).toLocaleString()}</span>
                          </div>
                          <div className="mt-2 whitespace-pre-wrap text-sm leading-6 text-muted-foreground">
                            {hint.prompt}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="rounded-md border bg-background/60 px-4 py-8 text-center text-sm text-muted-foreground">
                      暂无插图提示。
                    </div>
                  )}
                </div>
              )}

              {detailPanel === "progress-rules" && (
                <div className="space-y-5">
                  <section className="space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-sm font-medium">状态定义</div>
                      <span className="rounded-md bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                        {visibleStatusDefinitions.length} 项
                      </span>
                    </div>
                    {visibleStatusDefinitions.length > 0 ? (
                      <div className="space-y-3">
                        {visibleStatusDefinitions.map((definition) => (
                          <div key={definition.id} className="rounded-md border bg-background/60 p-3">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className="text-sm font-medium">{definition.label}</span>
                              <span className="rounded-md bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
                                {statusScopeLabels[definition.scope]}
                              </span>
                              <span className="rounded-md bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
                                {definition.valueType}
                              </span>
                              <span className="rounded-md bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
                                {updatePolicyModeLabels[definition.updatePolicy.mode]}
                              </span>
                            </div>
                            {definition.description?.trim() && (
                              <div className="mt-2 whitespace-pre-wrap text-sm leading-6 text-muted-foreground">
                                {definition.description}
                              </div>
                            )}
                            <div className="mt-2 grid gap-1.5 text-xs text-muted-foreground sm:grid-cols-2">
                              <div>默认：{formatStatusValue(definition.defaultValue)}</div>
                              <div>
                                范围：{
                                  typeof definition.min === "number" || typeof definition.max === "number"
                                    ? `${definition.min ?? "-∞"} - ${definition.max ?? "+∞"}`
                                    : "不限"
                                }
                              </div>
                              <div>
                                事件：{definition.updatePolicy.allowedEventTypes?.join("、") || "不限"}
                              </div>
                              <div>
                                置信度：{typeof definition.updatePolicy.confidenceThreshold === "number"
                                  ? `${Math.round(definition.updatePolicy.confidenceThreshold * 100)}%`
                                  : "默认"}
                              </div>
                              <div>
                                每轮上限：{definition.updatePolicy.maxDeltaPerTurn ?? "不限"}
                              </div>
                              <div>
                                审核阈值：{definition.updatePolicy.manualReviewAboveDelta ?? "未设置"}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="rounded-md border bg-background/60 px-4 py-8 text-center text-sm text-muted-foreground">
                        暂无可见状态定义。
                      </div>
                    )}
                  </section>

                  <section className="space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-sm font-medium">事件规则</div>
                      <span className="rounded-md bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                        {visibleStatusRules.length} 条
                      </span>
                    </div>
                    {visibleStatusRules.length > 0 ? (
                      <div className="space-y-3">
                        {visibleStatusRules.map((rule) => {
                          const definition = statusDefinitionById.get(rule.apply.statusId);
                          return (
                            <div key={rule.id} className="rounded-md border bg-background/60 p-3">
                              <div className="flex flex-wrap items-center gap-1.5">
                                <span className="text-sm font-medium">{rule.label}</span>
                                <span className="rounded-md bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
                                  {rule.when.eventType}
                                </span>
                                <span className="rounded-md bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
                                  {definition?.label ?? rule.apply.statusId}
                                </span>
                              </div>
                              <div className="mt-2 grid gap-1.5 text-xs text-muted-foreground sm:grid-cols-2">
                                <div>目标：{ruleTargetLabels[rule.apply.target ?? "eventTarget"]}</div>
                                <div>操作：{rule.apply.op === "add" ? "增减" : "设为"}</div>
                                <div className="sm:col-span-2">数值：{formatStatusRuleValue(rule)}</div>
                                <div>
                                  限制：{rule.apply.clamp ? `${rule.apply.clamp[0]} - ${rule.apply.clamp[1]}` : "不限"}
                                </div>
                                <div>
                                  每轮上限：{rule.safeguards?.maxDeltaPerTurn ?? "不限"}
                                </div>
                                <div>
                                  审核阈值：{rule.safeguards?.manualReviewAboveDelta ?? "未设置"}
                                </div>
                                <div>
                                  证据：{rule.safeguards?.requireExplicitEvidence ? "必须明确" : "默认"}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="rounded-md border bg-background/60 px-4 py-8 text-center text-sm text-muted-foreground">
                        暂无可见事件规则。
                      </div>
                    )}
                  </section>

                  <section className="space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-sm font-medium">最近变更</div>
                      <span className="rounded-md bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                        {recentStatusEvents.length} 条
                      </span>
                    </div>
                    {recentStatusEvents.length > 0 ? (
                      <div className="space-y-3">
                        {recentStatusEvents.map((event) => {
                          const definition = statusDefinitionById.get(event.statusId);
                          const deltaText = typeof event.delta === "number" && event.delta !== 0
                            ? `${event.delta > 0 ? "+" : ""}${event.delta}`
                            : "";
                          return (
                            <div key={event.id} className="rounded-md border bg-background/60 p-3">
                              <div className="flex flex-wrap items-center gap-1.5">
                                <span className="text-sm font-medium">
                                  {definition?.label ?? event.statusId}
                                </span>
                                <span className="rounded-md bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
                                  {statusEventStatusLabels[event.status]}
                                </span>
                                <span className="rounded-md bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
                                  {formatStatusTarget(event, characterNameById)}
                                </span>
                                <span className="rounded-md bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
                                  {Math.round(event.confidence * 100)}%
                                </span>
                              </div>
                              <div className="mt-2 text-sm leading-6 text-muted-foreground">
                                {formatStatusValue(event.before)}{" -> "}{formatStatusValue(event.after)}
                                {deltaText && (
                                  <span className={cn("ml-2", event.delta && event.delta > 0 ? "text-emerald-500" : "text-destructive")}>
                                    {deltaText}
                                  </span>
                                )}
                              </div>
                              <div className="mt-1 whitespace-pre-wrap text-xs leading-5 text-muted-foreground">
                                {event.reason}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="rounded-md border bg-background/60 px-4 py-8 text-center text-sm text-muted-foreground">
                        暂无状态变更。
                      </div>
                    )}
                  </section>
                </div>
              )}

              {detailPanel === "tasks-outcomes" && (
                <div className="space-y-5">
                  <section className="space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-sm font-medium">任务</div>
                      <span className="rounded-md bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                        {visibleTaskDefinitions.length} 个
                      </span>
                    </div>
                    {visibleTaskDefinitions.length > 0 ? (
                      <div className="space-y-3">
                        {visibleTaskDefinitions.map((task) => {
                          const state = activeRoom.taskSnapshot[task.id];
                          const status = state?.status ?? task.lifecycle.initialStatus;
                          const progressText = state?.progress
                            ? `${state.progress.current}/${state.progress.target}`
                            : task.progress?.target
                            ? `0/${task.progress.target}`
                            : "";
                          return (
                            <div key={task.id} className="rounded-md border bg-background/60 p-3">
                              <div className="flex flex-wrap items-center gap-1.5">
                                <span className="text-sm font-medium">{task.title}</span>
                                <span className="rounded-md bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
                                  {taskScopeLabels[task.scope]}
                                </span>
                                <span className="rounded-md bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
                                  {taskStatusLabels[status]}
                                </span>
                                {task.required && (
                                  <span className="rounded-md bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
                                    必做
                                  </span>
                                )}
                                {task.optional && (
                                  <span className="rounded-md bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
                                    支线
                                  </span>
                                )}
                              </div>
                              {task.description?.trim() && (
                                <div className="mt-2 whitespace-pre-wrap text-sm leading-6 text-muted-foreground">
                                  {task.description}
                                </div>
                              )}
                              {progressText && (
                                <div className="mt-2 text-xs text-muted-foreground">
                                  进度：{progressText}
                                </div>
                              )}
                              <div className="mt-2 grid gap-1.5 text-xs text-muted-foreground">
                                <div>归属：{formatEntityRef(task.owner, characterNameById)}</div>
                                {task.participants && task.participants.length > 0 && (
                                  <div>
                                    参与：{task.participants.map((entity) =>
                                      formatEntityRef(entity, characterNameById)
                                    ).join("、")}
                                  </div>
                                )}
                                <div>开始：{formatConditionSummary(task.lifecycle.startCondition, characterNameById)}</div>
                                <div>完成：{formatConditionSummary(task.lifecycle.completeCondition, characterNameById)}</div>
                                <div>失败：{formatConditionSummary(task.lifecycle.failCondition, characterNameById)}</div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="rounded-md border bg-background/60 px-4 py-8 text-center text-sm text-muted-foreground">
                        暂无可见任务。
                      </div>
                    )}
                  </section>

                  <section className="space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-sm font-medium">结局条件</div>
                      <span className="rounded-md bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                        {visibleSceneOutcomes.length} 个
                      </span>
                    </div>
                    {visibleSceneOutcomes.length > 0 ? (
                      <div className="space-y-3">
                        {visibleSceneOutcomes.map((outcome) => {
                          const event = activeRoom.outcomeEvents.find((candidate) =>
                            candidate.outcomeId === outcome.id && candidate.status !== "dismissed"
                          );
                          return (
                            <div key={outcome.id} className="space-y-3 rounded-md border bg-background/60 p-3">
                              <div className="flex flex-wrap items-center gap-1.5">
                                <span className="text-sm font-medium">{outcome.label}</span>
                                <span className="rounded-md bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
                                  {outcomeEndSceneLabels[outcome.endScene]}
                                </span>
                                <span className="rounded-md bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
                                  优先级 {outcome.priority}
                                </span>
                                {event && (
                                  <span className="rounded-md bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
                                    {outcomeStatusLabels[event.status]}
                                  </span>
                                )}
                              </div>
                              <div className="grid gap-1.5 text-xs text-muted-foreground">
                                <div>胜利：{outcome.winner?.map((entity) => formatEntityRef(entity, characterNameById)).join("、") || "未指定"}</div>
                                <div>失败：{outcome.loser?.map((entity) => formatEntityRef(entity, characterNameById)).join("、") || "未指定"}</div>
                                <div>条件：{formatConditionSummary(outcome.condition, characterNameById)}</div>
                              </div>
                              {event?.status === "pending" && (
                                <div className="grid grid-cols-2 gap-2">
                                  <Button
                                    type="button"
                                    size="xs"
                                    variant="outline"
                                    disabled={isBusy}
                                    onClick={() => resolvePendingOutcomeEvent(event.id, "applied")}
                                  >
                                    <Check className="size-3.5" />
                                    应用结局
                                  </Button>
                                  <Button
                                    type="button"
                                    size="xs"
                                    variant="ghost"
                                    disabled={isBusy}
                                    onClick={() => resolvePendingOutcomeEvent(event.id, "dismissed")}
                                  >
                                    <X className="size-3.5" />
                                    忽略
                                  </Button>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="rounded-md border bg-background/60 px-4 py-8 text-center text-sm text-muted-foreground">
                        暂无可见结局条件。
                      </div>
                    )}
                  </section>

                  <section className="space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-sm font-medium">最近任务事件</div>
                      <span className="rounded-md bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                        {recentTaskEvents.length} 条
                      </span>
                    </div>
                    {recentTaskEvents.length > 0 ? (
                      <div className="space-y-3">
                        {recentTaskEvents.map((event) => {
                          const task = activeRoom.taskDefinitions.find((definition) => definition.id === event.taskId);
                          return (
                            <div key={event.id} className="rounded-md border bg-background/60 p-3">
                              <div className="flex flex-wrap items-center gap-1.5">
                                <span className="text-sm font-medium">{task?.title ?? event.taskId}</span>
                                <span className="rounded-md bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
                                  {event.type}
                                </span>
                                <span className="rounded-md bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
                                  {taskStatusLabels[event.after.status]}
                                </span>
                              </div>
                              <div className="mt-2 whitespace-pre-wrap text-xs leading-5 text-muted-foreground">
                                {event.reason}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="rounded-md border bg-background/60 px-4 py-8 text-center text-sm text-muted-foreground">
                        暂无任务事件。
                      </div>
                    )}
                  </section>
                </div>
              )}

              {detailPanel === "script-review" && (
                <div className="space-y-4">
                  <div className="rounded-md border bg-background/60 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <div className="text-sm font-medium">{informationViewLabels[currentInformationView]}</div>
                        <div className="mt-0.5 text-xs text-muted-foreground">
                          {informationViewDescriptions[currentInformationView]}
                        </div>
                      </div>
                      {activeRoom.outcomeEvents.some((event) => event.status === "applied") && (
                        <span className="rounded-md bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                          已结局
                        </span>
                      )}
                    </div>
                    <div className="mt-3 grid grid-cols-3 gap-2">
                      {(["public", "reveal", "director"] as const).map((view) => (
                        <Button
                          key={view}
                          type="button"
                          size="xs"
                          variant={currentInformationView === view ? "default" : "outline"}
                          disabled={isBusy}
                          onClick={() => patchInformationView(view)}
                        >
                          {view === "public" && <EyeOff className="size-3.5" />}
                          {view === "reveal" && <Eye className="size-3.5" />}
                          {view === "director" && <ShieldCheck className="size-3.5" />}
                          {informationViewLabels[view]}
                        </Button>
                      ))}
                    </div>
                  </div>

                  {roleAssignment.enabled && (
                    <div className="rounded-md border bg-background/60 p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-sm font-medium">身份分配</div>
                          <div className="mt-0.5 text-xs text-muted-foreground">
                            {roleAssignment.rolePool.length} 种身份，已生成 {generatedRoleAssignmentCount} 条身份事实
                          </div>
                        </div>
                        <Button
                          type="button"
                          size="xs"
                          variant="outline"
                          disabled={isBusy || roleAssignment.rolePool.length === 0}
                          onClick={assignRoles}
                        >
                          <ShieldCheck className="size-3.5" />
                          随机分配
                        </Button>
                      </div>
                      {roleAssignment.rolePool.length > 0 && (
                        <div className="mt-3 flex flex-wrap gap-1.5">
                          {roleAssignment.rolePool.map((role) => (
                            <span
                              key={role.id}
                              className="rounded-md bg-muted px-2 py-1 text-[11px] text-muted-foreground"
                            >
                              {role.label} x{role.count}
                              {role.factionId ? ` / ${role.factionLabel || role.factionId}` : ""}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {identityFactEvents.length > 0 && (
                    <div className="space-y-2 rounded-md border bg-background/60 p-3">
                      <div className="text-sm font-medium">身份牌</div>
                      {identityFactEvents.map((event) => (
                        <div
                          key={event.id}
                          className="rounded-md bg-muted/60 px-3 py-2 text-sm leading-6 text-muted-foreground"
                        >
                          <div className="mb-1 flex flex-wrap items-center gap-1.5">
                            <span className="rounded-md bg-background px-1.5 py-0.5 text-[11px]">
                              {formatFactType(event.type)}
                            </span>
                            <span className="rounded-md bg-background px-1.5 py-0.5 text-[11px]">
                              仅你可见
                            </span>
                          </div>
                          <div className="whitespace-pre-wrap">{event.evidence}</div>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-sm font-medium">
                        当前可见事实
                      </div>
                      <span className="rounded-md bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                        {reviewFactEvents.length} 条
                      </span>
                    </div>
                    {reviewFactEvents.length > 0 ? (
                      reviewFactEvents.slice().reverse().map((event) => {
                        const hidden = isHiddenFactEvent(event);
                        return (
                          <div key={event.id} className="space-y-2 rounded-md border bg-background/60 p-3">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className="rounded-md bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
                                {formatFactType(event.type)}
                              </span>
                              <span className="rounded-md bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
                                {event.visibility ?? "public"}
                              </span>
                              {event.visibleToUser && (
                                <span className="rounded-md bg-primary/10 px-1.5 py-0.5 text-[11px] text-primary">
                                  我的情报
                                </span>
                              )}
                              {event.revealWhen && (
                                <span className="rounded-md bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
                                  {event.revealWhen}
                                </span>
                              )}
                              {hidden && (
                                <span className="rounded-md bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
                                  {formatFactAudience(event, characterNameById)}
                                </span>
                              )}
                            </div>
                            <div className="whitespace-pre-wrap text-sm leading-6 text-muted-foreground">
                              {event.evidence}
                            </div>
                            {hidden && currentInformationView === "director" && (
                              <Button
                                type="button"
                                size="xs"
                                variant={event.visibleToUser ? "ghost" : "outline"}
                                disabled={isBusy}
                                onClick={() => patchFactVisibleToUser(event.id, !event.visibleToUser)}
                              >
                                {event.visibleToUser ? (
                                  <EyeOff className="size-3.5" />
                                ) : (
                                  <Eye className="size-3.5" />
                                )}
                                {event.visibleToUser ? "移出我的情报" : "加入我的情报"}
                              </Button>
                            )}
                          </div>
                        );
                      })
                    ) : (
                      <div className="rounded-md border bg-background/60 px-4 py-8 text-center text-sm text-muted-foreground">
                        当前视角暂无可见事实。
                      </div>
                    )}
                  </div>
                </div>
              )}

              {detailPanel === "private-intel" && (
                privateIntelEvents.length > 0 ? (
                  <div className="space-y-3">
                    {privateIntelEvents.slice().reverse().map((event) => (
                      <div key={event.id} className="rounded-md border bg-background/60 p-3">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="rounded-md bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
                            {event.type}
                          </span>
                          <span className="rounded-md bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
                            {event.visibility ?? "public"}
                          </span>
                          {event.revealWhen && (
                            <span className="rounded-md bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
                              {event.revealWhen}
                            </span>
                          )}
                          {isHiddenFactEvent(event) && (
                            <span className="rounded-md bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
                              {formatFactAudience(event, characterNameById)}
                            </span>
                          )}
                        </div>
                        <div className="mt-2 whitespace-pre-wrap text-sm leading-6 text-muted-foreground">
                          {event.evidence}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-md border bg-background/60 px-4 py-8 text-center text-sm text-muted-foreground">
                    暂无仅你可知事实。
                  </div>
                )
              )}

              {detailPanel === "tips" && (
                <div className="space-y-4">
                  <div className="rounded-md border bg-background/60 p-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium">沉浸描写</div>
                        <div className="mt-0.5 text-xs leading-5 text-muted-foreground">
                          动作、神态、感官与环境互动
                        </div>
                      </div>
                      <Switch
                        size="sm"
                        checked={activeRoom.settings.immersiveDescriptionEnabled}
                        disabled={isSending}
                        aria-label="切换沉浸描写"
                        onCheckedChange={(checked) => patchRoom(activeRoom.id, {
                          settings: {
                            ...activeRoom.settings,
                            immersiveDescriptionEnabled: checked,
                          },
                        })}
                      />
                    </div>
                    <div className="mt-3 grid gap-1.5 text-xs text-muted-foreground">
                      {sceneStatusItems.map((item) => (
                        <div key={item}>{item}</div>
                      ))}
                    </div>
                  </div>
                  <TextBlock label="场景描述" value={activeRoom.scene} />
                  <TextBlock label="场景目标" value={activeRoom.sceneGoal} />
                  <TextBlock label="房间记忆" value={activeRoom.memory} />
                  <div className="rounded-md border bg-background/60 px-4 py-3 text-sm leading-6 text-muted-foreground">
                    剧情时间线和世界书是酒馆共享资产；入席角色、场景设定和阶段记忆在对应故事场景中维护。
                  </div>
                </div>
              )}
              </>
            )}
          />
        </div>
      </ScrollArea>

      <Dialog
        open={Boolean(pendingDangerAction)}
        onOpenChange={(open) => {
          if (!open) {
            closeDangerAction();
          }
        }}
      >
        {pendingDangerAction && (
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <div className="flex items-center gap-2">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-destructive/10 text-destructive">
                  <TriangleAlertIcon className="size-4" />
                </span>
                <DialogTitle>{pendingDangerAction.title}</DialogTitle>
              </div>
              <DialogDescription>{pendingDangerAction.description}</DialogDescription>
            </DialogHeader>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={closeDangerAction}
              >
                取消
              </Button>
              <Button
                type="button"
                variant="destructive"
                onClick={confirmDangerAction}
              >
                {pendingDangerAction.confirmLabel}
              </Button>
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>
    </aside>
  );
};
