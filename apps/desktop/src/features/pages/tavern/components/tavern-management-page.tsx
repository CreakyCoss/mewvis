import {
  Activity,
  ArrowRight,
  BookOpen,
  ChevronDown,
  ChevronRight,
  ChevronsDownUp,
  ChevronsUpDown,
  Clapperboard,
  Clock,
  Copy,
  Download,
  FileUp,
  LockKeyhole,
  MessageCircle,
  MoreHorizontal,
  Pencil,
  Plus,
  RotateCcw,
  Settings2,
  Trash2,
  TriangleAlertIcon,
  UnlockKeyhole,
  UsersRound,
  Wine,
} from "lucide-react";
import type { ComponentType, FormEvent, ReactNode } from "react";
import { useRef, useState } from "react";
import { resolveAgentAvatar } from "@/assets/agent-avatars";
import type { RuntimeModelOption } from "@/features/pages/settings/llm/store";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { TAVERN_SCENE_PRESET_OPTIONS } from "@/features/pages/tavern/visual-presets";
import { cn } from "@/lib/utils";
import {
  createTavernCharacter,
  createTavernLorebookEntry,
  createTavernScene,
  createTavernTimelineEvent,
  getActiveTavernScene,
  projectTavernSceneOntoRoom,
  syncTavernRoomActiveScene,
} from "../storage";
import type {
  TavernCharacter,
  TavernLorebookEntry,
  TavernReplyMode,
  TavernMessage,
  TavernCondition,
  TavernProgressView,
  TavernRoom,
  TavernRoomCharacterConfig,
  TavernRoomSettings,
  TavernProgressTrackerSettings,
  TavernSceneOutcomeDefinition,
  TavernStatusDefinition,
  TavernStatusRule,
  TavernTaskDefinition,
  TavernTimelineEvent,
  TavernTimelineScope,
} from "../types";
import { compactScene } from "../utils";
import {
  TavernCharacterFormDialog,
  type TavernCharacterFormValue,
} from "./tavern-character-form-dialog";

type TavernManagementPageProps = {
  rooms: TavernRoom[];
  activeRoom: TavernRoom;
  characterById: Map<string, TavernCharacter>;
  messagesByRoomId: Record<string, TavernMessage[]>;
  globalRuntimeModel: RuntimeModelOption | null;
  canDeleteRoom: boolean;
  onCreateRoom: () => void;
  onSelectRoom: (roomId: string) => void;
  onOpenRoom: (roomId: string) => void;
  onPatchRoom: (roomId: string, patch: Partial<TavernRoom>) => void;
  onCopyRoom: (roomId: string) => void;
  onRestoreSystemPresetRoom: (roomId: string) => void;
  onSetRoomLocked: (roomId: string, locked: boolean) => boolean;
  onDeleteRoom: (roomId: string) => void;
  onClearRoomMessages: (roomId: string) => void;
  onExportRoom: (roomId: string) => boolean;
  onImportRoom: (raw: string) => string | null;
};

const replyModeOptions: Array<{
  value: TavernReplyMode;
  label: string;
}> = [
  { value: "active", label: "当前角色" },
  { value: "round", label: "全员轮流" },
  { value: "director", label: "导演调度" },
];

const formatCount = (value: number, label: string) => `${value} ${label}`;

const emptyValueText = "未设置";

const parseKeywords = (value: string) =>
  value.split(/[,，\n]/)
    .map((keyword) => keyword.trim())
    .filter(Boolean);

const cloneTimelineScope = (
  scope: TavernTimelineScope | undefined,
): TavernTimelineScope => {
  if (scope?.mode === "range") {
    return {
      mode: "range",
      startEventId: scope.startEventId,
      endEventId: scope.endEventId,
    };
  }

  if (scope?.mode === "selected") {
    return {
      mode: "selected",
      eventIds: [...(scope.eventIds ?? [])],
    };
  }

  return { mode: "auto" };
};

const cloneRoomCharacterConfigs = (
  configs: Record<string, TavernRoomCharacterConfig> | undefined,
): Record<string, TavernRoomCharacterConfig> => Object.fromEntries(
  Object.entries(configs ?? {}).map(([characterId, config]) => [
    characterId,
    {
      ...config,
    },
  ]),
);

const characterMemoriesFromConfigs = (
  configs: Record<string, TavernRoomCharacterConfig>,
) => Object.fromEntries(
  Object.entries(configs).flatMap(([characterId, config]) => {
    const memory = config.memory?.trim() ?? "";
    return memory ? [[characterId, memory]] : [];
  }),
);

const getTimelineEventLabel = (
  event: TavernTimelineEvent,
  index: number,
) => `${index + 1}. ${event.title.trim() || emptyValueText}`;

const getTimelineScopeSummary = (
  scope: TavernTimelineScope | undefined,
  events: TavernTimelineEvent[],
) => {
  if (!scope || scope.mode === "auto") {
    return events.length > 0 ? "自动：完整共享时间线" : "自动：暂无共享事件";
  }

  if (scope.mode === "selected") {
    const count = (scope.eventIds ?? []).filter((eventId) =>
      events.some((event) => event.id === eventId)
    ).length;
    return count > 0 ? `精选：${count} 个事件` : "精选：未选择事件";
  }

  if (events.length === 0) {
    return "范围：暂无共享事件";
  }

  const startIndex = scope.startEventId
    ? events.findIndex((event) => event.id === scope.startEventId)
    : 0;
  const endIndex = scope.endEventId
    ? events.findIndex((event) => event.id === scope.endEventId)
    : events.length - 1;
  const startEvent = events[startIndex >= 0 ? startIndex : 0];
  const endEvent = events[endIndex >= 0 ? endIndex : events.length - 1];
  return `范围：${startEvent?.title || emptyValueText} - ${endEvent?.title || emptyValueText}`;
};

const editorControlClassName = "w-full bg-background/80 shadow-none";
const settingsFlagGridClassName =
  "grid grid-cols-[repeat(auto-fit,minmax(16rem,1fr))] gap-2";
const settingsEditorMetricGridClassName =
  "grid grid-cols-[repeat(auto-fit,minmax(9rem,1fr))] gap-3";

const getReplyModeLabel = (replyMode: TavernReplyMode) =>
  replyModeOptions.find((option) => option.value === replyMode)?.label ?? "当前角色";

type ProgressJsonParseResult<T> =
  | { ok: true; value: T[] }
  | { ok: false; error: string };

const formatProgressJson = (value: unknown) => JSON.stringify(value, null, 2);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === "object" && !Array.isArray(value));

const hasStringField = (value: Record<string, unknown>, field: string) =>
  typeof value[field] === "string" && value[field].trim().length > 0;

const hasRecordField = (value: Record<string, unknown>, field: string) =>
  isRecord(value[field]);

const parseProgressJsonArray = <T,>(
  raw: string,
  label: string,
  guard: (item: unknown) => item is T,
): ProgressJsonParseResult<T> => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, error: `${label}不是有效 JSON。` };
  }

  if (!Array.isArray(parsed)) {
    return { ok: false, error: `${label}必须是数组。` };
  }

  const invalidIndex = parsed.findIndex((item) => !guard(item));
  if (invalidIndex >= 0) {
    return { ok: false, error: `${label}第 ${invalidIndex + 1} 项缺少必要字段。` };
  }

  const seenIds = new Set<string>();
  const duplicatedItem = parsed.find((item) => {
    const id = isRecord(item) && typeof item.id === "string" ? item.id.trim() : "";
    if (!id) {
      return false;
    }
    if (seenIds.has(id)) {
      return true;
    }
    seenIds.add(id);
    return false;
  });
  if (duplicatedItem && isRecord(duplicatedItem) && typeof duplicatedItem.id === "string") {
    return { ok: false, error: `${label}存在重复 id：${duplicatedItem.id}` };
  }

  return { ok: true, value: parsed };
};

const isStatusDefinitionDraft = (item: unknown): item is TavernStatusDefinition => (
  isRecord(item) &&
  hasStringField(item, "id") &&
  hasStringField(item, "label") &&
  hasStringField(item, "scope") &&
  hasStringField(item, "valueType") &&
  hasStringField(item, "visibility") &&
  hasRecordField(item, "updatePolicy")
);

const isStatusRuleDraft = (item: unknown): item is TavernStatusRule => (
  isRecord(item) &&
  hasStringField(item, "id") &&
  hasStringField(item, "label") &&
  hasRecordField(item, "when") &&
  hasRecordField(item, "apply")
);

const isProgressViewDraft = (item: unknown): item is TavernProgressView => (
  isRecord(item) &&
  hasStringField(item, "id") &&
  hasStringField(item, "label") &&
  hasStringField(item, "kind") &&
  hasStringField(item, "placement") &&
  hasStringField(item, "ownerBinding") &&
  hasStringField(item, "layout") &&
  Array.isArray(item.items)
);

const isTaskDefinitionDraft = (item: unknown): item is TavernTaskDefinition => (
  isRecord(item) &&
  hasStringField(item, "id") &&
  hasStringField(item, "title") &&
  hasStringField(item, "scope") &&
  hasRecordField(item, "owner") &&
  hasStringField(item, "visibility") &&
  typeof item.required === "boolean" &&
  typeof item.optional === "boolean" &&
  typeof item.repeatable === "boolean" &&
  hasRecordField(item, "lifecycle") &&
  isRecord(item.lifecycle) &&
  hasStringField(item.lifecycle, "initialStatus") &&
  hasRecordField(item.lifecycle, "completeCondition")
);

const isSceneOutcomeDraft = (item: unknown): item is TavernSceneOutcomeDefinition => (
  isRecord(item) &&
  hasStringField(item, "id") &&
  hasStringField(item, "label") &&
  hasRecordField(item, "condition") &&
  typeof item.priority === "number" &&
  typeof item.exclusive === "boolean" &&
  hasStringField(item, "endScene") &&
  hasStringField(item, "visibility")
);

const collectConditionRefs = (
  condition: TavernCondition | undefined,
  refs: { statusIds: Set<string>; taskIds: Set<string> },
) => {
  if (!condition) {
    return;
  }
  if ("all" in condition) {
    condition.all.forEach((item) => collectConditionRefs(item, refs));
    return;
  }
  if ("any" in condition) {
    condition.any.forEach((item) => collectConditionRefs(item, refs));
    return;
  }
  if ("not" in condition) {
    collectConditionRefs(condition.not, refs);
    return;
  }
  if ("status" in condition) {
    if (typeof condition.status === "string") {
      refs.statusIds.add(condition.status);
    }
    return;
  }
  if ("task" in condition) {
    if (typeof condition.task === "string") {
      refs.taskIds.add(condition.task);
    }
  }
};

const validateProgressConfigReferences = ({
  statusDefinitions,
  statusRules,
  progressViews,
  taskDefinitions,
  sceneOutcomes,
}: {
  statusDefinitions: TavernStatusDefinition[];
  statusRules: TavernStatusRule[];
  progressViews: TavernProgressView[];
  taskDefinitions: TavernTaskDefinition[];
  sceneOutcomes: TavernSceneOutcomeDefinition[];
}) => {
  const statusIds = new Set(statusDefinitions.map((definition) => definition.id));
  const taskIds = new Set(taskDefinitions.map((task) => task.id));
  const outcomeIds = new Set(sceneOutcomes.map((outcome) => outcome.id));

  const invalidRule = statusRules.find((rule) => !statusIds.has(rule.apply.statusId));
  if (invalidRule) {
    return `状态规则「${invalidRule.label}」引用了不存在的状态：${invalidRule.apply.statusId}`;
  }

  for (const view of progressViews) {
    for (const item of view.items) {
      if (item.type === "status" && !statusIds.has(item.statusId)) {
        return `状态面板「${view.label}」引用了不存在的状态：${item.statusId}`;
      }
      if (item.type === "task" && !taskIds.has(item.taskId)) {
        return `状态面板「${view.label}」引用了不存在的任务：${item.taskId}`;
      }
      if (item.type === "outcome" && !outcomeIds.has(item.outcomeId)) {
        return `状态面板「${view.label}」引用了不存在的结局：${item.outcomeId}`;
      }
    }
  }

  for (const task of taskDefinitions) {
    const refs = { statusIds: new Set<string>(), taskIds: new Set<string>() };
    collectConditionRefs(task.lifecycle.startCondition, refs);
    collectConditionRefs(task.lifecycle.completeCondition, refs);
    collectConditionRefs(task.lifecycle.failCondition, refs);
    const missingStatusId = Array.from(refs.statusIds).find((statusId) => !statusIds.has(statusId));
    if (missingStatusId) {
      return `任务「${task.title}」引用了不存在的状态：${missingStatusId}`;
    }
    const missingTaskId = Array.from(refs.taskIds).find((taskId) => !taskIds.has(taskId));
    if (missingTaskId) {
      return `任务「${task.title}」引用了不存在的任务：${missingTaskId}`;
    }
  }

  for (const outcome of sceneOutcomes) {
    const refs = { statusIds: new Set<string>(), taskIds: new Set<string>() };
    collectConditionRefs(outcome.condition, refs);
    const missingStatusId = Array.from(refs.statusIds).find((statusId) => !statusIds.has(statusId));
    if (missingStatusId) {
      return `结局「${outcome.label}」引用了不存在的状态：${missingStatusId}`;
    }
    const missingTaskId = Array.from(refs.taskIds).find((taskId) => !taskIds.has(taskId));
    if (missingTaskId) {
      return `结局「${outcome.label}」引用了不存在的任务：${missingTaskId}`;
    }
  }

  return "";
};

const TavernEditorField = ({
  label,
  htmlFor,
  children,
  description,
  className,
}: {
  label: string;
  htmlFor: string;
  children: ReactNode;
  description?: string;
  className?: string;
}) => (
  <label className={cn("block space-y-1.5", className)} htmlFor={htmlFor}>
    <span className="text-xs font-medium text-muted-foreground">{label}</span>
    {children}
    {description && (
      <span className="block text-xs leading-5 text-muted-foreground">
        {description}
      </span>
    )}
  </label>
);

const TavernCompactSummaryItem = ({
  label,
  value,
  description,
  className,
  valueClassName,
}: {
  label: string;
  value: ReactNode;
  description?: ReactNode;
  className?: string;
  valueClassName?: string;
}) => (
  <div className={cn("min-w-0 rounded-md bg-background/45 px-2.5 py-2", className)}>
    <div className="truncate text-[11px] font-medium uppercase text-muted-foreground">{label}</div>
    <div className={cn("mt-0.5 min-w-0 truncate text-sm font-medium leading-5", valueClassName)}>
      {value}
    </div>
    {description && (
      <div className="mt-0.5 truncate text-xs leading-5 text-muted-foreground">
        {description}
      </div>
    )}
  </div>
);

const TavernInlineSummaryItem = ({
  label,
  value,
  className,
}: {
  label: string;
  value: string;
  className?: string;
}) => {
  const normalizedValue = value.trim();
  const displayValue = normalizedValue || emptyValueText;

  return (
    <div className={cn("flex min-w-0 items-baseline gap-2", className)}>
      <span className="shrink-0 text-[11px] font-medium text-muted-foreground">
        {label}
      </span>
      <span
        className={cn(
          "min-w-0 truncate text-sm leading-5 text-foreground",
          !normalizedValue && "text-muted-foreground",
        )}
        title={displayValue}
      >
        {displayValue}
      </span>
    </div>
  );
};

const TavernSceneSummaryLine = ({
  label,
  value,
  className,
}: {
  label: string;
  value: string;
  className?: string;
}) => {
  const normalizedValue = value.trim();

  return (
    <div className={cn("flex min-w-0 items-start gap-1.5 text-xs leading-5", className)}>
      <span className="shrink-0 font-medium text-foreground/70">{label}：</span>
      <span
        className={cn(
          "min-w-0 flex-1 line-clamp-2 whitespace-pre-wrap text-muted-foreground",
          !normalizedValue && "text-muted-foreground/70",
        )}
        title={normalizedValue || emptyValueText}
      >
        {normalizedValue || emptyValueText}
      </span>
    </div>
  );
};

const TavernEditorSection = ({
  icon: Icon,
  title,
  description,
  meta,
  action,
  children,
  className,
  contentClassName,
}: {
  icon: ComponentType<{ className?: string }>;
  title: string;
  description?: string;
  meta?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  contentClassName?: string;
}) => (
  <section
    className={cn(
      "border-b border-border/70 last:border-b-0",
      className,
    )}
  >
    <div className="flex items-start justify-between gap-3 px-1 py-4">
      <div className="flex min-w-0 gap-2.5">
        <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
          <Icon className="size-3.5" />
        </span>
        <div className="min-w-0">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <h3 className="text-sm font-semibold leading-5">{title}</h3>
            {meta && (
              <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                {meta}
              </span>
            )}
          </div>
          {description && (
            <p className="mt-0.5 text-xs leading-5 text-muted-foreground">
              {description}
            </p>
          )}
        </div>
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
    <div className={cn("space-y-3 px-1 pb-5", contentClassName)}>
      {children}
    </div>
  </section>
);

type PendingDangerAction = {
  title: string;
  description: string;
  secondDescription: string;
  confirmLabel: string;
  summary?: string;
  onConfirm: () => void;
};

type RoomContentEditDraft =
  | {
      type: "basic";
      title: string;
      storyOutline: string;
      storyGoal: string;
      replyMode: TavernReplyMode;
      userPersonaName: string;
    }
  | {
      type: "narrative";
      sceneId: string;
      sceneTitle: string;
      scenePresetId: TavernRoom["scenePresetId"];
      scene: string;
      sceneGoal: string;
      scenePlot: string;
      sceneDirection: string;
      sceneTransition: string;
      timelineScope: TavernTimelineScope;
      memory: string;
      characterIds: string[];
      activeCharacterId: string;
      characterConfigs: Record<string, TavernRoomCharacterConfig>;
      characterMemories: Record<string, string>;
    }
  | ({
      type: "settings";
      progressTracker: TavernProgressTrackerSettings;
    } & TavernRoomSettings)
  | {
      type: "progress";
      statusDefinitionsJson: string;
      statusRulesJson: string;
      progressViewsJson: string;
      taskDefinitionsJson: string;
      sceneOutcomesJson: string;
    }
  | {
      type: "timeline";
      eventId: string | null;
      title: string;
      summary: string;
    }
  | {
      type: "lore";
      entryId: string | null;
      title: string;
      keywords: string;
      content: string;
      enabled: boolean;
      alwaysOn: boolean;
    };

const cloneTavernRoomSettings = (settings: TavernRoomSettings): TavernRoomSettings => ({
  ...settings,
  continuation: { ...settings.continuation },
  replyOptions: { ...settings.replyOptions },
  statusTracking: { ...settings.statusTracking },
  randomEvents: { ...settings.randomEvents },
  illustrationHints: { ...settings.illustrationHints },
});

const cloneTavernRoom = (room: TavernRoom): TavernRoom => ({
  ...room,
  settings: cloneTavernRoomSettings(room.settings),
  characterConfigs: cloneRoomCharacterConfigs(room.characterConfigs),
  characterMemories: { ...room.characterMemories },
  scenes: room.scenes?.map((scene) => ({
    ...scene,
    timelineScope: cloneTimelineScope(scene.timelineScope),
    characterConfigs: cloneRoomCharacterConfigs(scene.characterConfigs),
    characterMemories: { ...scene.characterMemories },
    characterIds: [...scene.characterIds],
    assetDrafts: scene.assetDrafts.map((draft) => ({
      ...draft,
      sourceMessageIds: [...draft.sourceMessageIds],
      timelineEvents: draft.timelineEvents.map((event) => ({ ...event })),
      characterMemories: draft.characterMemories.map((memory) => ({ ...memory })),
      lorebookEntries: draft.lorebookEntries.map((entry) => ({
        ...entry,
        keywords: [...entry.keywords],
      })),
    })),
    illustrationHints: scene.illustrationHints.map((hint) => ({
      ...hint,
      sourceMessageIds: [...hint.sourceMessageIds],
    })),
  })) ?? [],
  localCharacters: room.localCharacters?.map((character) => ({
    ...character,
  })) ?? [],
  characterIds: [...room.characterIds],
  timelineEvents: room.timelineEvents.map((event) => ({ ...event })),
  lorebookEntries: room.lorebookEntries.map((entry) => ({
    ...entry,
    keywords: [...entry.keywords],
  })),
  assetDrafts: room.assetDrafts.map((draft) => ({
    ...draft,
    sourceMessageIds: [...draft.sourceMessageIds],
    timelineEvents: draft.timelineEvents.map((event) => ({ ...event })),
    characterMemories: draft.characterMemories.map((memory) => ({ ...memory })),
    lorebookEntries: draft.lorebookEntries.map((entry) => ({
      ...entry,
      keywords: [...entry.keywords],
    })),
  })),
  illustrationHints: room.illustrationHints.map((hint) => ({
    ...hint,
    sourceMessageIds: [...hint.sourceMessageIds],
  })),
});

const prepareTavernRoomForSave = (room: TavernRoom): TavernRoom => {
  const characterConfigs = cloneRoomCharacterConfigs(room.characterConfigs);
  const characterMemories = characterMemoriesFromConfigs(characterConfigs);
  const scenes = room.scenes?.map((scene) => {
    const sceneCharacterConfigs = cloneRoomCharacterConfigs(scene.characterConfigs);

    return {
      ...scene,
      characterConfigs: sceneCharacterConfigs,
      characterMemories: characterMemoriesFromConfigs(sceneCharacterConfigs),
    };
  });

  const syncedRoom = syncTavernRoomActiveScene({
    ...room,
    scenes,
    characterConfigs,
    characterMemories,
    localCharacters: room.localCharacters ?? [],
  });

  return projectTavernSceneOntoRoom({
    ...syncedRoom,
    scenes: (syncedRoom.scenes ?? []).map((scene, index) => ({
      ...scene,
      order: index,
    })),
  });
};

export const TavernManagementPage = ({
  rooms,
  activeRoom,
  characterById,
  messagesByRoomId,
  globalRuntimeModel,
  canDeleteRoom,
  onCreateRoom,
  onSelectRoom,
  onOpenRoom,
  onPatchRoom,
  onCopyRoom,
  onRestoreSystemPresetRoom,
  onSetRoomLocked,
  onDeleteRoom,
  onClearRoomMessages,
  onExportRoom,
  onImportRoom,
}: TavernManagementPageProps) => {
  const [editingRoomId, setEditingRoomId] = useState<string | null>(null);
  const [editingRoomDraft, setEditingRoomDraft] = useState<TavernRoom | null>(null);
  const [roomContentEditDraft, setRoomContentEditDraft] =
    useState<RoomContentEditDraft | null>(null);
  const [roomContentEditError, setRoomContentEditError] = useState("");
  const [editingCharacterId, setEditingCharacterId] = useState<string | null>(null);
  const [deletingRoomId, setDeletingRoomId] = useState<string | null>(null);
  const [restoringRoomId, setRestoringRoomId] = useState<string | null>(null);
  const [pendingDangerAction, setPendingDangerAction] = useState<PendingDangerAction | null>(null);
  const [dangerConfirmStep, setDangerConfirmStep] = useState<1 | 2>(1);
  const [lockingRoomRequest, setLockingRoomRequest] = useState<{
    roomId: string;
    locked: boolean;
  } | null>(null);
  const [isCreatingRoomCharacter, setIsCreatingRoomCharacter] = useState(false);
  const [roomOperationStatus, setRoomOperationStatus] = useState("");
  const [collapsedTimelineEventIds, setCollapsedTimelineEventIds] = useState<Record<string, boolean>>({});
  const [collapsedLoreEntryIds, setCollapsedLoreEntryIds] = useState<Record<string, boolean>>({});
  const roomImportInputRef = useRef<HTMLInputElement | null>(null);

  const editingRoom = editingRoomDraft;
  const editingActiveScene = editingRoom ? getActiveTavernScene(editingRoom) : null;
  const editingRoomScenes = editingRoom?.scenes ?? [];
  const deletingRoom = deletingRoomId
    ? rooms.find((room) => room.id === deletingRoomId) ?? null
    : null;
  const restoringRoom = restoringRoomId
    ? rooms.find((room) => room.id === restoringRoomId) ?? null
    : null;
  const lockingRoom = lockingRoomRequest
    ? rooms.find((room) => room.id === lockingRoomRequest.roomId) ?? null
    : null;
  const isLockingRoom = lockingRoomRequest?.locked ?? false;
  const editingCharacter = editingRoom && editingCharacterId
    ? editingRoom.localCharacters?.find((character) => character.id === editingCharacterId) ?? null
    : null;
  const activeRoomMessages = messagesByRoomId[activeRoom.id] ?? [];
  const totalRoomCharacterCount = rooms.reduce(
    (sum, room) => sum + (room.localCharacters?.length ?? 0),
    0,
  );
  const editingRoomCharacterById = new Map([
    ...characterById.entries(),
    ...(editingRoom?.localCharacters ?? []).map((character) => [character.id, character] as const),
  ]);
  const editingRoomCharacters = editingRoom
    ? editingRoom.characterIds
        .map((characterId) => editingRoomCharacterById.get(characterId))
        .filter((character): character is TavernCharacter => Boolean(character))
    : [];
  const editingRoomScenePreset = editingRoom
    ? TAVERN_SCENE_PRESET_OPTIONS.find((preset) => preset.id === editingRoom.scenePresetId)
    : null;
  const editingRoomMessageCount = editingRoom
    ? messagesByRoomId[editingRoom.id]?.length ?? 0
    : 0;
  const systemDefaultModelLabel = globalRuntimeModel
    ? `${globalRuntimeModel.provider.name} / ${
        globalRuntimeModel.modelName || globalRuntimeModel.modelId
      }`
    : "未选择";
  const editingRoomModelLabel = systemDefaultModelLabel;
  const editingPendingStatusEventCount = editingRoom
    ? editingRoom.statusEvents.filter((event) => event.status === "pending").length
    : 0;
  const editingAppliedStatusEventCount = editingRoom
    ? editingRoom.statusEvents.filter((event) => event.status === "applied").length
    : 0;
  const editingActiveTaskCount = editingRoom
    ? Object.values(editingRoom.taskSnapshot).filter((task) => task.status !== "inactive").length
    : 0;
  const editingOutcomeEventCount = editingRoom
    ? editingRoom.outcomeEvents.filter((event) => event.status !== "dismissed").length
    : 0;
  const editingProgressPlacementText = editingRoom
    ? Array.from(new Set(editingRoom.progressViews.map((view) => view.placement))).join("、")
    : "";
  const areAllTimelineEventsCollapsed = editingRoom && editingRoom.timelineEvents.length > 0
    ? editingRoom.timelineEvents.every((event) => collapsedTimelineEventIds[event.id])
    : false;
  const areAllLoreEntriesCollapsed = editingRoom && editingRoom.lorebookEntries.length > 0
    ? editingRoom.lorebookEntries.every((entry) => collapsedLoreEntryIds[entry.id])
    : false;

  const setAllTimelineEventsCollapsed = (collapsed: boolean) => {
    if (!editingRoom) {
      return;
    }

    setCollapsedTimelineEventIds(Object.fromEntries(
      editingRoom.timelineEvents.map((event) => [event.id, collapsed]),
    ));
  };

  const setAllLoreEntriesCollapsed = (collapsed: boolean) => {
    if (!editingRoom) {
      return;
    }

    setCollapsedLoreEntryIds(Object.fromEntries(
      editingRoom.lorebookEntries.map((entry) => [entry.id, collapsed]),
    ));
  };

  const openRoomEditor = (roomId: string) => {
    const room = rooms.find((item) => item.id === roomId);
    if (!room) {
      return;
    }

    onSelectRoom(roomId);
    setEditingRoomId(roomId);
    setEditingRoomDraft(cloneTavernRoom(projectTavernSceneOntoRoom(
      room,
    )));
    setRoomContentEditDraft(null);
    setRoomContentEditError("");
    setEditingCharacterId(null);
    setRoomOperationStatus("");
  };

  const closeRoomEditor = () => {
    setEditingRoomId(null);
    setEditingRoomDraft(null);
    setRoomContentEditDraft(null);
    setRoomContentEditError("");
    setEditingCharacterId(null);
    setIsCreatingRoomCharacter(false);
  };

  const patchEditingRoomDraft = (patch: Partial<TavernRoom>) => {
    setEditingRoomDraft((current) => current ? { ...current, ...patch } : current);
  };

  const switchEditingRoomScene = (sceneId: string) => {
    setEditingRoomDraft((current) => {
      if (!current || !current.scenes?.some((scene) => scene.id === sceneId)) {
        return current;
      }

      const syncedRoom = syncTavernRoomActiveScene(current);
      return projectTavernSceneOntoRoom({
        ...syncedRoom,
        activeSceneId: sceneId,
      });
    });
  };

  const createEditingRoomScene = () => {
    setEditingRoomDraft((current) => {
      if (!current || current.locked) {
        return current;
      }

      const syncedRoom = syncTavernRoomActiveScene(current);
      const scenes = syncedRoom.scenes ?? [];
      const createdAt = Date.now();
      const characterConfigs = Object.fromEntries(
        syncedRoom.characterIds.map((characterId) => [
          characterId,
          {
            characterId,
            memory: syncedRoom.characterConfigs?.[characterId]?.memory,
          },
        ]),
      );
      const scene = createTavernScene({
        title: `阶段 ${scenes.length + 1}`,
        order: scenes.length,
        scenePresetId: syncedRoom.scenePresetId,
        scene: "新的故事阶段等待配置。",
        sceneGoal: "",
        plot: "",
        storyDirection: "",
        transition: "",
        memory: "",
        characterConfigs,
        characterMemories: {},
        assetDrafts: [],
        characterIds: syncedRoom.characterIds,
        activeCharacterId: syncedRoom.activeCharacterId,
        createdAt,
        updatedAt: createdAt,
      });

      return projectTavernSceneOntoRoom({
        ...syncedRoom,
        activeSceneId: scene.id,
        scenes: [...scenes, scene],
        updatedAt: createdAt,
      });
    });
  };

  const deleteEditingRoomScene = (sceneId: string) => {
    setEditingRoomDraft((current) => {
      if (!current || current.locked || (current.scenes?.length ?? 0) <= 1) {
        return current;
      }

      const syncedRoom = syncTavernRoomActiveScene(current);
      const scenes = syncedRoom.scenes ?? [];
      const deletedIndex = scenes.findIndex((scene) => scene.id === sceneId);
      if (deletedIndex < 0) {
        return current;
      }

      const nextScenes = scenes
        .filter((scene) => scene.id !== sceneId)
        .map((scene, index) => ({ ...scene, order: index }));
      const nextActiveSceneId = syncedRoom.activeSceneId === sceneId
        ? nextScenes[Math.min(deletedIndex, nextScenes.length - 1)]?.id ?? nextScenes[0]?.id
        : syncedRoom.activeSceneId;

      return projectTavernSceneOntoRoom({
        ...syncedRoom,
        activeSceneId: nextActiveSceneId,
        scenes: nextScenes,
        updatedAt: Date.now(),
      });
    });
  };

  const moveEditingRoomScene = (sceneId: string, direction: -1 | 1) => {
    setEditingRoomDraft((current) => {
      if (!current || current.locked) {
        return current;
      }

      const syncedRoom = syncTavernRoomActiveScene(current);
      const scenes = [...(syncedRoom.scenes ?? [])];
      const index = scenes.findIndex((scene) => scene.id === sceneId);
      const targetIndex = index + direction;
      if (index < 0 || targetIndex < 0 || targetIndex >= scenes.length) {
        return current;
      }

      const targetScene = scenes[targetIndex];
      scenes[targetIndex] = scenes[index];
      scenes[index] = targetScene;

      return projectTavernSceneOntoRoom({
        ...syncedRoom,
        scenes: scenes.map((scene, nextIndex) => ({
          ...scene,
          order: nextIndex,
          updatedAt: scene.id === sceneId || scene.id === targetScene.id ? Date.now() : scene.updatedAt,
        })),
        updatedAt: Date.now(),
      });
    });
  };

  const createRoomLocalCharacter = (value: TavernCharacterFormValue) => {
    if (!editingRoom) {
      return;
    }

    const character = createTavernCharacter(value);
    patchEditingRoomDraft({
      localCharacters: [...(editingRoom.localCharacters ?? []), character],
    });
    setIsCreatingRoomCharacter(false);
  };

  const updateRoomLocalCharacter = (
    characterId: string,
    value: TavernCharacterFormValue,
  ) => {
    if (!editingRoom) {
      return;
    }

    const nextLocalCharacters = (editingRoom.localCharacters ?? []).map((character) =>
        character.id === characterId
          ? {
              ...character,
              name: value.name,
              avatar: value.avatar,
              description: value.description,
              speakingStyle: value.speakingStyle,
              goals: value.goals?.trim() || undefined,
              relationships: value.relationships?.trim() || undefined,
              updatedAt: Date.now(),
            }
          : character
      );

    patchEditingRoomDraft({
      localCharacters: nextLocalCharacters,
    });
    setEditingCharacterId(null);
  };

  const saveRoomEditor = () => {
    if (!editingRoom) {
      return;
    }

    onPatchRoom(editingRoom.id, prepareTavernRoomForSave(editingRoom));
    closeRoomEditor();
  };

  const requestDangerAction = (action: PendingDangerAction) => {
    setPendingDangerAction(action);
    setDangerConfirmStep(1);
  };

  const closeDangerAction = () => {
    setPendingDangerAction(null);
    setDangerConfirmStep(1);
  };

  const confirmDangerAction = () => {
    if (!pendingDangerAction) {
      return;
    }

    if (dangerConfirmStep === 1) {
      setDangerConfirmStep(2);
      return;
    }

    pendingDangerAction.onConfirm();
    closeDangerAction();
  };

  const requestDeleteRoom = (roomId: string) => {
    const room = rooms.find((item) => item.id === roomId);
    if (!canDeleteRoom || room?.locked) {
      return;
    }

    setDeletingRoomId(roomId);
  };

  const requestRestoreSystemPresetRoom = (roomId: string) => {
    const room = rooms.find((item) => item.id === roomId);
    if (!room?.systemPresetId || room.locked) {
      return;
    }

    setRestoringRoomId(roomId);
  };

  const requestRoomLockChange = (roomId: string, locked: boolean) => {
    const room = rooms.find((item) => item.id === roomId);
    if (!room || room.locked === locked) {
      return;
    }

    setLockingRoomRequest({ roomId, locked });
  };

  const confirmRestoreSystemPresetRoom = () => {
    if (!restoringRoom) {
      return;
    }

    onRestoreSystemPresetRoom(restoringRoom.id);
    setRestoringRoomId(null);
  };

  const confirmRoomLockChange = () => {
    if (!lockingRoom || !lockingRoomRequest) {
      return;
    }

    const applied = onSetRoomLocked(lockingRoom.id, lockingRoomRequest.locked);
    if (applied) {
      setLockingRoomRequest(null);
    }
  };

  const confirmDeleteRoom = () => {
    if (!deletingRoom || deletingRoom.locked) {
      return;
    }

    if (!window.confirm(
      `再次确认删除酒馆「${deletingRoom.title}」？房间、对话记录和剧情资产都会被永久移除。`,
    )) {
      return;
    }

    if (editingRoomId === deletingRoom.id) {
      closeRoomEditor();
    }
    onDeleteRoom(deletingRoom.id);
    setDeletingRoomId(null);
  };

  const closeRoomContentEditor = () => {
    setRoomContentEditDraft(null);
    setRoomContentEditError("");
  };

  const openBasicContentEditor = () => {
    if (!editingRoom) {
      return;
    }

    setRoomContentEditError("");
    setRoomContentEditDraft({
      type: "basic",
      title: editingRoom.title,
      storyOutline: editingRoom.storyOutline,
      storyGoal: editingRoom.storyGoal,
      replyMode: editingRoom.replyMode ?? "active",
      userPersonaName: editingRoom.userPersonaName,
    });
  };

  const openNarrativeContentEditor = (sceneId: string) => {
    if (!editingRoom) {
      return;
    }

    const scene = editingRoom.scenes?.find((item) => item.id === sceneId) ?? getActiveTavernScene(editingRoom);
    if (!scene) {
      return;
    }

    setRoomContentEditError("");
    setRoomContentEditDraft({
      type: "narrative",
      sceneId: scene.id,
      sceneTitle: scene.title,
      scenePresetId: scene.scenePresetId,
      scene: scene.scene,
      sceneGoal: scene.sceneGoal,
      scenePlot: scene.plot,
      sceneDirection: scene.storyDirection,
      sceneTransition: scene.transition,
      timelineScope: cloneTimelineScope(scene.timelineScope),
      memory: scene.memory,
      characterIds: [...scene.characterIds],
      activeCharacterId: scene.activeCharacterId,
      characterConfigs: cloneRoomCharacterConfigs(scene.characterConfigs),
      characterMemories: { ...scene.characterMemories },
    });
  };

  const openSettingsContentEditor = () => {
    if (!editingRoom) {
      return;
    }

    setRoomContentEditError("");
    setRoomContentEditDraft({
      type: "settings",
      ...editingRoom.settings,
      progressTracker: { ...editingRoom.progressTracker },
    });
  };

  const openProgressContentEditor = () => {
    if (!editingRoom) {
      return;
    }

    setRoomContentEditError("");
    setRoomContentEditDraft({
      type: "progress",
      statusDefinitionsJson: formatProgressJson(editingRoom.statusDefinitions),
      statusRulesJson: formatProgressJson(editingRoom.statusRules),
      progressViewsJson: formatProgressJson(editingRoom.progressViews),
      taskDefinitionsJson: formatProgressJson(editingRoom.taskDefinitions),
      sceneOutcomesJson: formatProgressJson(editingRoom.sceneOutcomes),
    });
  };

  const openTimelineContentEditor = (event: TavernTimelineEvent | null = null) => {
    setRoomContentEditError("");
    setRoomContentEditDraft({
      type: "timeline",
      eventId: event?.id ?? null,
      title: event?.title ?? "",
      summary: event?.summary ?? "",
    });
  };

  const openLoreContentEditor = (entry: TavernLorebookEntry | null = null) => {
    setRoomContentEditError("");
    setRoomContentEditDraft({
      type: "lore",
      entryId: entry?.id ?? null,
      title: entry?.title ?? "",
      keywords: entry?.keywords.join("，") ?? "",
      content: entry?.content ?? "",
      enabled: entry?.enabled ?? true,
      alwaysOn: entry?.alwaysOn ?? false,
    });
  };

  const saveRoomContentEditor = () => {
    if (!editingRoom || !roomContentEditDraft) {
      return;
    }

    if (roomContentEditDraft.type === "basic") {
      patchEditingRoomDraft({
        title: roomContentEditDraft.title,
        storyOutline: roomContentEditDraft.storyOutline,
        storyGoal: roomContentEditDraft.storyGoal,
        replyMode: roomContentEditDraft.replyMode,
        userPersonaName: roomContentEditDraft.userPersonaName,
      });
      closeRoomContentEditor();
      return;
    }

    if (roomContentEditDraft.type === "narrative") {
      const isEditedSceneActive = roomContentEditDraft.sceneId === editingRoom.activeSceneId;
      const updatedAt = Date.now();
      const validCharacterIds = new Set(editingRoomCharacterById.keys());
      const nextCharacterIds = Array.from(new Set(
        roomContentEditDraft.characterIds.filter((characterId) =>
          validCharacterIds.has(characterId)
        ),
      ));
      if ((editingRoom.localCharacters?.length ?? 0) > 0 && nextCharacterIds.length === 0) {
        setRoomContentEditError("请至少为场景引用一个角色。");
        return;
      }

      const nextActiveCharacterId = nextCharacterIds.includes(roomContentEditDraft.activeCharacterId)
        ? roomContentEditDraft.activeCharacterId
        : nextCharacterIds[0] ?? "";
      const nextCharacterConfigs: Record<string, TavernRoomCharacterConfig> = Object.fromEntries(
        nextCharacterIds.map((characterId) => {
          const sourceConfig = roomContentEditDraft.characterConfigs[characterId] ?? {
            characterId,
          };
          const memory = (
            roomContentEditDraft.characterMemories[characterId]
            ?? sourceConfig.memory
            ?? ""
          ).trim();
          return [
            characterId,
            {
              characterId,
              memory: memory || undefined,
            },
          ];
        }),
      );
      const nextCharacterMemories = Object.fromEntries(
        Object.entries(nextCharacterConfigs).flatMap(([characterId, config]) => {
          const memory = config.memory?.trim() ?? "";
          return memory ? [[characterId, memory]] : [];
        }),
      );

      patchEditingRoomDraft({
        ...(isEditedSceneActive
          ? {
              scenePresetId: roomContentEditDraft.scenePresetId,
              scene: roomContentEditDraft.scene,
              sceneGoal: roomContentEditDraft.sceneGoal,
              scenePlot: roomContentEditDraft.scenePlot,
              sceneDirection: roomContentEditDraft.sceneDirection,
              sceneTransition: roomContentEditDraft.sceneTransition,
              memory: roomContentEditDraft.memory,
              characterIds: nextCharacterIds,
              activeCharacterId: nextActiveCharacterId,
              characterConfigs: nextCharacterConfigs,
              characterMemories: nextCharacterMemories,
            }
          : {}),
        scenes: editingRoom.scenes?.map((scene) =>
          scene.id === roomContentEditDraft.sceneId
            ? {
                ...scene,
                title: roomContentEditDraft.sceneTitle.trim() || "默认场景",
                scenePresetId: roomContentEditDraft.scenePresetId,
                scene: roomContentEditDraft.scene,
                sceneGoal: roomContentEditDraft.sceneGoal,
                plot: roomContentEditDraft.scenePlot,
                storyDirection: roomContentEditDraft.sceneDirection,
                transition: roomContentEditDraft.sceneTransition,
                timelineScope: cloneTimelineScope(roomContentEditDraft.timelineScope),
                memory: roomContentEditDraft.memory,
                characterIds: nextCharacterIds,
                activeCharacterId: nextActiveCharacterId,
                characterConfigs: nextCharacterConfigs,
                characterMemories: nextCharacterMemories,
                updatedAt,
              }
            : scene
        ),
      });
      closeRoomContentEditor();
      return;
    }

    if (roomContentEditDraft.type === "settings") {
      patchEditingRoomDraft({
        settings: {
          ...(editingRoom?.settings ?? activeRoom.settings),
          immersiveDescriptionEnabled: roomContentEditDraft.immersiveDescriptionEnabled,
          showExecutionTrace: roomContentEditDraft.showExecutionTrace,
          autoAssetExtractionEnabled: roomContentEditDraft.autoAssetExtractionEnabled,
          assetExtractionIntervalTurns: Math.min(
            10,
            Math.max(1, Number(roomContentEditDraft.assetExtractionIntervalTurns) || 1),
          ),
          maxAssetDrafts: Math.min(
            20,
            Math.max(1, Number(roomContentEditDraft.maxAssetDrafts) || 1),
          ),
          directorMaxSpeakers: Math.min(
            6,
            Math.max(1, Number(roomContentEditDraft.directorMaxSpeakers) || 1),
          ),
          agentKnowledgeCompactIntervalTurns: Math.min(
            50,
            Math.max(0, Number(roomContentEditDraft.agentKnowledgeCompactIntervalTurns) || 0),
          ),
          statusTracking: {
            ...((editingRoom?.settings ?? activeRoom.settings).statusTracking),
            ...roomContentEditDraft.statusTracking,
          },
          randomEvents: {
            ...((editingRoom?.settings ?? activeRoom.settings).randomEvents),
            enabled: roomContentEditDraft.randomEvents.enabled,
            probability: Math.min(
              1,
              Math.max(0, Number(roomContentEditDraft.randomEvents.probability) || 0),
            ),
          },
          illustrationHints: {
            ...((editingRoom?.settings ?? activeRoom.settings).illustrationHints),
            enabled: roomContentEditDraft.illustrationHints.enabled,
          },
        },
        progressTracker: {
          enabled: roomContentEditDraft.progressTracker.enabled,
          mode: roomContentEditDraft.progressTracker.mode,
          intervalTurns: Math.min(
            50,
            Math.max(1, Number(roomContentEditDraft.progressTracker.intervalTurns) || 1),
          ),
          applyMode: roomContentEditDraft.progressTracker.applyMode,
          factConfidenceThreshold: Math.min(
            1,
            Math.max(0, Number(roomContentEditDraft.progressTracker.factConfidenceThreshold) || 0),
          ),
          generateCheckpointBeforeContextTrim:
            roomContentEditDraft.progressTracker.generateCheckpointBeforeContextTrim,
        },
      });
      closeRoomContentEditor();
      return;
    }

    if (roomContentEditDraft.type === "progress") {
      const statusDefinitions = parseProgressJsonArray<TavernStatusDefinition>(
        roomContentEditDraft.statusDefinitionsJson,
        "状态定义",
        isStatusDefinitionDraft,
      );
      if (!statusDefinitions.ok) {
        setRoomContentEditError(statusDefinitions.error);
        return;
      }

      const statusRules = parseProgressJsonArray<TavernStatusRule>(
        roomContentEditDraft.statusRulesJson,
        "状态规则",
        isStatusRuleDraft,
      );
      if (!statusRules.ok) {
        setRoomContentEditError(statusRules.error);
        return;
      }

      const progressViews = parseProgressJsonArray<TavernProgressView>(
        roomContentEditDraft.progressViewsJson,
        "状态面板",
        isProgressViewDraft,
      );
      if (!progressViews.ok) {
        setRoomContentEditError(progressViews.error);
        return;
      }

      const taskDefinitions = parseProgressJsonArray<TavernTaskDefinition>(
        roomContentEditDraft.taskDefinitionsJson,
        "任务定义",
        isTaskDefinitionDraft,
      );
      if (!taskDefinitions.ok) {
        setRoomContentEditError(taskDefinitions.error);
        return;
      }

      const sceneOutcomes = parseProgressJsonArray<TavernSceneOutcomeDefinition>(
        roomContentEditDraft.sceneOutcomesJson,
        "结局条件",
        isSceneOutcomeDraft,
      );
      if (!sceneOutcomes.ok) {
        setRoomContentEditError(sceneOutcomes.error);
        return;
      }

      const referenceError = validateProgressConfigReferences({
        statusDefinitions: statusDefinitions.value,
        statusRules: statusRules.value,
        progressViews: progressViews.value,
        taskDefinitions: taskDefinitions.value,
        sceneOutcomes: sceneOutcomes.value,
      });
      if (referenceError) {
        setRoomContentEditError(referenceError);
        return;
      }

      patchEditingRoomDraft({
        statusDefinitions: statusDefinitions.value,
        statusRules: statusRules.value,
        progressViews: progressViews.value,
        taskDefinitions: taskDefinitions.value,
        sceneOutcomes: sceneOutcomes.value,
      });
      closeRoomContentEditor();
      return;
    }

    if (roomContentEditDraft.type === "timeline") {
      const title = roomContentEditDraft.title.trim();
      const summary = roomContentEditDraft.summary.trim();
      if (!title || !summary) {
        setRoomContentEditError("请填写事件标题和摘要。");
        return;
      }

      patchEditingRoomDraft({
        timelineEvents: roomContentEditDraft.eventId
          ? editingRoom.timelineEvents.map((item) =>
              item.id === roomContentEditDraft.eventId
                ? {
                    ...item,
                    title,
                    summary,
                    updatedAt: Date.now(),
                  }
                : item
            )
          : [
              ...editingRoom.timelineEvents,
              createTavernTimelineEvent({ title, summary }),
            ],
      });
      closeRoomContentEditor();
      return;
    }

    const title = roomContentEditDraft.title.trim();
    const content = roomContentEditDraft.content.trim();
    if (!title || !content) {
      setRoomContentEditError("请填写世界书名称和内容。");
      return;
    }

    patchEditingRoomDraft({
      lorebookEntries: roomContentEditDraft.entryId
        ? editingRoom.lorebookEntries.map((item) =>
            item.id === roomContentEditDraft.entryId
              ? {
                  ...item,
                  title,
                  content,
                  keywords: parseKeywords(roomContentEditDraft.keywords),
                  enabled: roomContentEditDraft.enabled,
                  alwaysOn: roomContentEditDraft.alwaysOn,
                  updatedAt: Date.now(),
                }
              : item
          )
        : [
            ...editingRoom.lorebookEntries,
            {
              ...createTavernLorebookEntry({
                title,
                content,
                keywords: parseKeywords(roomContentEditDraft.keywords),
                alwaysOn: roomContentEditDraft.alwaysOn,
              }),
              enabled: roomContentEditDraft.enabled,
            },
          ],
    });
    closeRoomContentEditor();
  };

  const handleImportRoomFile = async (event: FormEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!file) {
      return;
    }

    try {
      const error = onImportRoom(await file.text());
      setRoomOperationStatus(error ?? "房间已导入");
    } catch {
      setRoomOperationStatus("读取房间文件失败");
    }
  };

  const getRoomContentEditDialogTitle = () => {
    if (!roomContentEditDraft) {
      return "";
    }

    switch (roomContentEditDraft.type) {
      case "basic":
        return "编辑基础信息";
      case "narrative":
        return "编辑叙事内容";
      case "settings":
        return "编辑运行设置";
      case "progress":
        return "编辑进度系统";
      case "timeline":
        return roomContentEditDraft.eventId ? "编辑剧情事件" : "新增剧情事件";
      case "lore":
        return roomContentEditDraft.entryId ? "编辑世界书" : "新增世界书";
    }
  };

  const getRoomContentEditDialogDescription = () => {
    if (!editingRoom || !roomContentEditDraft) {
      return "";
    }

    switch (roomContentEditDraft.type) {
      case "basic":
        return "修改房间名称、大故事总纲、发言模式和你的称呼。";
      case "narrative":
        return "修改当前故事阶段的描述、剧情、目标、走向、记忆和出场角色。";
      case "settings":
        return "调整执行过程、剧情资产整理和导演调度设置。";
      case "progress":
        return "编辑状态栏、规则引擎、任务目标和结局条件。任务与结局作用于当前故事阶段。";
      case "timeline":
        return "剧情事件会进入大故事时间线草稿，保存酒馆后才生效。";
      case "lore":
        return "世界书条目会进入酒馆共享设定草稿，保存酒馆后才生效。";
    }
  };

  const renderRoomContentEditFields = () => {
    if (!roomContentEditDraft) {
      return null;
    }
    const timelineEvents = editingRoom?.timelineEvents ?? [];

    switch (roomContentEditDraft.type) {
      case "basic":
        return (
          <>
            <TavernEditorField label="房间名称" htmlFor="tavern-content-title">
              <Input
                id="tavern-content-title"
                value={roomContentEditDraft.title}
                className={editorControlClassName}
                onChange={(event) => setRoomContentEditDraft({
                  ...roomContentEditDraft,
                  title: event.target.value,
                })}
              />
            </TavernEditorField>
            <TavernEditorField label="大故事总纲" htmlFor="tavern-content-story-outline">
              <Textarea
                id="tavern-content-story-outline"
                value={roomContentEditDraft.storyOutline}
                className={cn("min-h-[112px] resize-none text-sm leading-6", editorControlClassName)}
                onChange={(event) => setRoomContentEditDraft({
                  ...roomContentEditDraft,
                  storyOutline: event.target.value,
                })}
              />
            </TavernEditorField>
            <TavernEditorField label="大故事终局目标" htmlFor="tavern-content-story-goal">
              <Textarea
                id="tavern-content-story-goal"
                value={roomContentEditDraft.storyGoal}
                className={cn("min-h-[92px] resize-none text-sm leading-6", editorControlClassName)}
                onChange={(event) => setRoomContentEditDraft({
                  ...roomContentEditDraft,
                  storyGoal: event.target.value,
                })}
              />
            </TavernEditorField>
            <div className="grid gap-3 sm:grid-cols-2">
              <TavernEditorField label="发言模式" htmlFor="tavern-content-reply-mode">
                <NativeSelect
                  id="tavern-content-reply-mode"
                  value={roomContentEditDraft.replyMode}
                  className={editorControlClassName}
                  onChange={(event) => setRoomContentEditDraft({
                    ...roomContentEditDraft,
                    replyMode: event.target.value as TavernReplyMode,
                  })}
                >
                  {replyModeOptions.map((option) => (
                    <NativeSelectOption key={option.value} value={option.value}>
                      {option.label}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              </TavernEditorField>
            </div>
            <TavernEditorField label="你的称呼" htmlFor="tavern-content-user">
              <Input
                id="tavern-content-user"
                value={roomContentEditDraft.userPersonaName}
                className={editorControlClassName}
                onChange={(event) => setRoomContentEditDraft({
                  ...roomContentEditDraft,
                  userPersonaName: event.target.value,
                })}
              />
            </TavernEditorField>
          </>
        );
      case "narrative": {
        const availableSceneRoleDefinitions = editingRoom?.localCharacters ?? [];
        const availableSceneRoleIds = new Set(
          availableSceneRoleDefinitions.map((character) => character.id),
        );
        const selectedCharacterIds = new Set(roomContentEditDraft.characterIds);
        const selectedSceneRoleDefinitions = roomContentEditDraft.characterIds
          .map((characterId) => editingRoomCharacterById.get(characterId))
          .filter((character): character is TavernCharacter => Boolean(character));
        const addableSceneRoleDefinitions = availableSceneRoleDefinitions.filter(
          (character) => !selectedCharacterIds.has(character.id),
        );
        const addSceneCharacter = (character: TavernCharacter) => {
          const nextCharacterConfigs = {
            ...roomContentEditDraft.characterConfigs,
            [character.id]: roomContentEditDraft.characterConfigs[character.id] ?? {
              characterId: character.id,
            },
          };
          setRoomContentEditDraft({
            ...roomContentEditDraft,
            characterIds: Array.from(new Set([
              ...roomContentEditDraft.characterIds,
              character.id,
            ])),
            activeCharacterId: roomContentEditDraft.activeCharacterId || character.id,
            characterConfigs: nextCharacterConfigs,
          });
        };
        const removeSceneCharacter = (characterId: string) => {
          if (roomContentEditDraft.characterIds.length <= 1) {
            return;
          }

          const nextCharacterIds = roomContentEditDraft.characterIds.filter(
            (id) => id !== characterId,
          );
          const nextCharacterConfigs = { ...roomContentEditDraft.characterConfigs };
          const nextCharacterMemories = { ...roomContentEditDraft.characterMemories };
          delete nextCharacterConfigs[characterId];
          delete nextCharacterMemories[characterId];
          setRoomContentEditDraft({
            ...roomContentEditDraft,
            characterIds: nextCharacterIds,
            activeCharacterId: roomContentEditDraft.activeCharacterId === characterId
              ? nextCharacterIds[0] ?? ""
              : roomContentEditDraft.activeCharacterId,
            characterConfigs: nextCharacterConfigs,
            characterMemories: nextCharacterMemories,
          });
        };

        return (
          <>
            <TavernEditorField label="当前阶段名称" htmlFor="tavern-content-scene-title">
              <Input
                id="tavern-content-scene-title"
                value={roomContentEditDraft.sceneTitle}
                className={editorControlClassName}
                onChange={(event) => setRoomContentEditDraft({
                  ...roomContentEditDraft,
                  sceneTitle: event.target.value,
                })}
              />
            </TavernEditorField>
            <TavernEditorField label="场景设置" htmlFor="tavern-content-scene-preset">
              <NativeSelect
                id="tavern-content-scene-preset"
                value={roomContentEditDraft.scenePresetId}
                className={editorControlClassName}
                onChange={(event) => setRoomContentEditDraft({
                  ...roomContentEditDraft,
                  scenePresetId: event.target.value as TavernRoom["scenePresetId"],
                })}
              >
                {TAVERN_SCENE_PRESET_OPTIONS.map((preset) => (
                  <NativeSelectOption key={preset.id} value={preset.id}>
                    {preset.label}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </TavernEditorField>
            <TavernEditorField label="场景描述" htmlFor="tavern-content-scene">
              <Textarea
                id="tavern-content-scene"
                value={roomContentEditDraft.scene}
                className={cn("min-h-[132px] resize-none text-sm leading-6", editorControlClassName)}
                onChange={(event) => setRoomContentEditDraft({
                  ...roomContentEditDraft,
                  scene: event.target.value,
                })}
              />
            </TavernEditorField>
            <TavernEditorField label="阶段剧情" htmlFor="tavern-content-scene-plot">
              <Textarea
                id="tavern-content-scene-plot"
                value={roomContentEditDraft.scenePlot}
                className={cn("min-h-[132px] resize-none text-sm leading-6", editorControlClassName)}
                onChange={(event) => setRoomContentEditDraft({
                  ...roomContentEditDraft,
                  scenePlot: event.target.value,
                })}
              />
            </TavernEditorField>
            <TavernEditorField label="场景目标" htmlFor="tavern-content-goal">
              <Textarea
                id="tavern-content-goal"
                value={roomContentEditDraft.sceneGoal}
                className={cn("min-h-[92px] resize-none text-sm leading-6", editorControlClassName)}
                onChange={(event) => setRoomContentEditDraft({
                  ...roomContentEditDraft,
                  sceneGoal: event.target.value,
                })}
              />
            </TavernEditorField>
            <TavernEditorField label="剧情走向" htmlFor="tavern-content-scene-direction">
              <Textarea
                id="tavern-content-scene-direction"
                value={roomContentEditDraft.sceneDirection}
                className={cn("min-h-[112px] resize-none text-sm leading-6", editorControlClassName)}
                onChange={(event) => setRoomContentEditDraft({
                  ...roomContentEditDraft,
                  sceneDirection: event.target.value,
                })}
              />
            </TavernEditorField>
            <TavernEditorField label="承接关系" htmlFor="tavern-content-scene-transition">
              <Textarea
                id="tavern-content-scene-transition"
                value={roomContentEditDraft.sceneTransition}
                className={cn("min-h-[92px] resize-none text-sm leading-6", editorControlClassName)}
                onChange={(event) => setRoomContentEditDraft({
                  ...roomContentEditDraft,
                  sceneTransition: event.target.value,
                })}
              />
            </TavernEditorField>
            <div className="space-y-3 rounded-md border border-border/70 bg-muted/15 p-3">
              <TavernEditorField label="时间线范围" htmlFor="tavern-content-timeline-scope">
                <NativeSelect
                  id="tavern-content-timeline-scope"
                  value={roomContentEditDraft.timelineScope.mode}
                  className={editorControlClassName}
                  onChange={(event) => {
                    const mode = event.target.value as TavernTimelineScope["mode"];
                    setRoomContentEditDraft({
                      ...roomContentEditDraft,
                      timelineScope: mode === "range"
                        ? { mode: "range" }
                        : mode === "selected"
                        ? { mode: "selected", eventIds: [] }
                        : { mode: "auto" },
                    });
                  }}
                >
                  <NativeSelectOption value="auto">自动</NativeSelectOption>
                  <NativeSelectOption value="range">起止范围</NativeSelectOption>
                  <NativeSelectOption value="selected">精选事件</NativeSelectOption>
                </NativeSelect>
              </TavernEditorField>
              {roomContentEditDraft.timelineScope.mode === "range" && (
                <div className="grid gap-3 sm:grid-cols-2">
                  <TavernEditorField label="起点事件" htmlFor="tavern-content-timeline-start">
                    <NativeSelect
                      id="tavern-content-timeline-start"
                      value={roomContentEditDraft.timelineScope.startEventId ?? ""}
                      className={editorControlClassName}
                      onChange={(event) => setRoomContentEditDraft({
                        ...roomContentEditDraft,
                        timelineScope: {
                          ...roomContentEditDraft.timelineScope,
                          mode: "range",
                          startEventId: event.target.value || undefined,
                        },
                      })}
                    >
                      <NativeSelectOption value="">从第一条</NativeSelectOption>
                      {timelineEvents.map((event, index) => (
                        <NativeSelectOption key={event.id} value={event.id}>
                          {getTimelineEventLabel(event, index)}
                        </NativeSelectOption>
                      ))}
                    </NativeSelect>
                  </TavernEditorField>
                  <TavernEditorField label="终点事件" htmlFor="tavern-content-timeline-end">
                    <NativeSelect
                      id="tavern-content-timeline-end"
                      value={roomContentEditDraft.timelineScope.endEventId ?? ""}
                      className={editorControlClassName}
                      onChange={(event) => setRoomContentEditDraft({
                        ...roomContentEditDraft,
                        timelineScope: {
                          ...roomContentEditDraft.timelineScope,
                          mode: "range",
                          endEventId: event.target.value || undefined,
                        },
                      })}
                    >
                      <NativeSelectOption value="">到最后一条</NativeSelectOption>
                      {timelineEvents.map((event, index) => (
                        <NativeSelectOption key={event.id} value={event.id}>
                          {getTimelineEventLabel(event, index)}
                        </NativeSelectOption>
                      ))}
                    </NativeSelect>
                  </TavernEditorField>
                </div>
              )}
              {roomContentEditDraft.timelineScope.mode === "selected" && (
                <div className="space-y-2">
                  {timelineEvents.length > 0 ? (
                    timelineEvents.map((event, index) => {
                      const selectedEventIds = roomContentEditDraft.timelineScope.eventIds ?? [];
                      const isSelected = selectedEventIds.includes(event.id);

                      return (
                        <label
                          key={event.id}
                          className="flex items-start gap-2 rounded-md border bg-background/70 px-3 py-2"
                          htmlFor={`tavern-content-timeline-event-${event.id}`}
                        >
                          <input
                            id={`tavern-content-timeline-event-${event.id}`}
                            type="checkbox"
                            checked={isSelected}
                            className="mt-1 size-4"
                            onChange={(eventChange) => setRoomContentEditDraft({
                              ...roomContentEditDraft,
                              timelineScope: {
                                mode: "selected",
                                eventIds: eventChange.target.checked
                                  ? [...selectedEventIds, event.id]
                                  : selectedEventIds.filter((eventId) => eventId !== event.id),
                              },
                            })}
                          />
                          <span className="min-w-0">
                            <span className="block text-sm font-medium leading-5">
                              {getTimelineEventLabel(event, index)}
                            </span>
                            <span className="mt-0.5 line-clamp-2 block text-xs leading-5 text-muted-foreground">
                              {event.summary}
                            </span>
                          </span>
                        </label>
                      );
                    })
                  ) : (
                    <div className="rounded-md border bg-background/70 px-3 py-4 text-center text-sm text-muted-foreground">
                      暂无共享剧情事件。
                    </div>
                  )}
                </div>
              )}
            </div>
            <TavernEditorField label="阶段记忆" htmlFor="tavern-content-memory">
              <Textarea
                id="tavern-content-memory"
                value={roomContentEditDraft.memory}
                className={cn("min-h-[112px] resize-none text-sm leading-6", editorControlClassName)}
                onChange={(event) => setRoomContentEditDraft({
                  ...roomContentEditDraft,
                  memory: event.target.value,
                })}
              />
            </TavernEditorField>
            <div className="space-y-3 rounded-md border border-border/70 bg-muted/15 p-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-medium leading-5">场景引用角色</div>
                  <div className="mt-1 text-xs leading-5 text-muted-foreground">
                    添加本阶段需要出场的角色，并维护角色只在本场景生效的记忆。
                  </div>
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      type="button"
                      size="xs"
                      variant="outline"
                      disabled={addableSceneRoleDefinitions.length === 0}
                    >
                      <Plus className="size-3.5" />
                      添加角色
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-64">
                    <DropdownMenuLabel>可添加角色</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    {addableSceneRoleDefinitions.map((character) => (
                      <DropdownMenuItem
                        key={character.id}
                        className="items-start gap-2"
                        onSelect={() => addSceneCharacter(character)}
                      >
                        <img
                          src={resolveAgentAvatar(character.avatar).src}
                          alt=""
                          className="mt-0.5 size-7 rounded-md border bg-muted/20"
                        />
                        <span className="min-w-0">
                          <span className="block truncate text-sm">{character.name}</span>
                          <span className="line-clamp-1 block text-xs text-muted-foreground">
                            {character.speakingStyle || emptyValueText}
                          </span>
                        </span>
                      </DropdownMenuItem>
                    ))}
                    {addableSceneRoleDefinitions.length === 0 && (
                      <DropdownMenuItem disabled>暂无可添加角色</DropdownMenuItem>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
              {availableSceneRoleDefinitions.length > 0 || selectedSceneRoleDefinitions.length > 0 ? (
                <div className="space-y-2">
                  {selectedSceneRoleDefinitions.map((character) => {
                    const isActiveCharacter = roomContentEditDraft.activeCharacterId === character.id;
                    const characterConfig = roomContentEditDraft.characterConfigs[character.id] ?? {
                      characterId: character.id,
                    };
                    const characterMemory = roomContentEditDraft.characterMemories[character.id]
                      ?? characterConfig.memory
                      ?? "";

                    return (
                      <div
                        key={character.id}
                        className="space-y-3 rounded-md border border-primary/25 bg-background/80 p-3"
                      >
                        <div className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)_auto] gap-2.5">
                          <img
                            src={resolveAgentAvatar(character.avatar).src}
                            alt=""
                            className="size-10 rounded-md border bg-muted/20"
                          />
                          <div className="min-w-0">
                            <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                              <div className="min-w-0 truncate text-sm font-medium leading-5">
                                {character.name}
                              </div>
                              {!availableSceneRoleIds.has(character.id) && (
                                <Badge variant="secondary">外部角色</Badge>
                              )}
                              {isActiveCharacter && <Badge variant="outline">默认</Badge>}
                            </div>
                            <div className="mt-1 line-clamp-1 text-xs text-muted-foreground">
                              {character.speakingStyle || emptyValueText}
                            </div>
                          </div>
                          <div className="flex items-center gap-1">
                            <Button
                              type="button"
                              size="xs"
                              variant={isActiveCharacter ? "secondary" : "outline"}
                              disabled={isActiveCharacter}
                              onClick={() => setRoomContentEditDraft({
                                ...roomContentEditDraft,
                                activeCharacterId: character.id,
                              })}
                            >
                              设为默认
                            </Button>
                            <Button
                              type="button"
                              size="xs"
                              variant="ghost"
                              disabled={roomContentEditDraft.characterIds.length <= 1}
                              onClick={() => removeSceneCharacter(character.id)}
                            >
                              移除
                            </Button>
                          </div>
                        </div>
                        <div className="border-t pt-3">
                          <TavernEditorField
                            label="角色场景记忆"
                            htmlFor={`tavern-content-scene-character-memory-${character.id}`}
                          >
                            <Textarea
                              id={`tavern-content-scene-character-memory-${character.id}`}
                              value={characterMemory}
                              className={cn("min-h-[96px] resize-none text-sm leading-6", editorControlClassName)}
                              onChange={(event) => {
                                const nextMemory = event.target.value;
                                setRoomContentEditDraft({
                                  ...roomContentEditDraft,
                                  characterMemories: {
                                    ...roomContentEditDraft.characterMemories,
                                    [character.id]: nextMemory,
                                  },
                                  characterConfigs: {
                                    ...roomContentEditDraft.characterConfigs,
                                    [character.id]: {
                                      ...characterConfig,
                                      memory: nextMemory.trim() || undefined,
                                    },
                                  },
                                });
                              }}
                            />
                          </TavernEditorField>
                        </div>
                      </div>
                    );
                  })}
                  {selectedSceneRoleDefinitions.length === 0 && (
                    <div className="rounded-md border border-dashed bg-background/70 px-3 py-4 text-center text-sm text-muted-foreground">
                      暂未引用角色。点击“添加角色”加入本阶段需要的角色。
                    </div>
                  )}
                </div>
              ) : (
                <div className="rounded-md border bg-background/70 px-3 py-4 text-center text-sm text-muted-foreground">
                  暂无角色定义。请先在酒馆角色库中新建角色。
                </div>
              )}
            </div>
          </>
        );
      }
      case "settings":
        return (
          <>
            <div className="space-y-3 rounded-md border border-border/70 bg-muted/15 p-3">
              <div>
                <div className="text-sm font-medium leading-5">酒馆模型</div>
                <div className="mt-1 text-xs leading-5 text-muted-foreground">
                  酒馆统一使用当前默认模型：{editingRoomModelLabel}
                </div>
              </div>
            </div>
            <div className={settingsFlagGridClassName}>
              <label className="flex min-h-11 items-center gap-2 rounded-md border bg-background/80 px-3 py-2 text-sm">
                <input
                  type="checkbox"
                  checked={roomContentEditDraft.immersiveDescriptionEnabled}
                  className="accent-primary"
                  onChange={(event) => setRoomContentEditDraft({
                    ...roomContentEditDraft,
                    immersiveDescriptionEnabled: event.target.checked,
                  })}
                />
                沉浸描写
              </label>
              <label className="flex min-h-11 items-center gap-2 rounded-md border bg-background/80 px-3 py-2 text-sm">
                <input
                  type="checkbox"
                  checked={roomContentEditDraft.showExecutionTrace}
                  className="accent-primary"
                  onChange={(event) => setRoomContentEditDraft({
                    ...roomContentEditDraft,
                    showExecutionTrace: event.target.checked,
                  })}
                />
                显示执行过程
              </label>
              <label className="flex min-h-11 items-center gap-2 rounded-md border bg-background/80 px-3 py-2 text-sm">
                <input
                  type="checkbox"
                  checked={roomContentEditDraft.autoAssetExtractionEnabled}
                  className="accent-primary"
                  onChange={(event) => setRoomContentEditDraft({
                    ...roomContentEditDraft,
                    autoAssetExtractionEnabled: event.target.checked,
                  })}
                />
                自动整理剧情资产
              </label>
              <label className="flex min-h-11 items-center gap-2 rounded-md border bg-background/80 px-3 py-2 text-sm">
                <input
                  type="checkbox"
                  checked={roomContentEditDraft.statusTracking.enabled}
                  className="accent-primary"
                  onChange={(event) => setRoomContentEditDraft({
                    ...roomContentEditDraft,
                    statusTracking: {
                      ...roomContentEditDraft.statusTracking,
                      enabled: event.target.checked,
                      visibleToUser: event.target.checked,
                    },
                  })}
                />
                显示状态栏
              </label>
              <label className="flex min-h-11 items-center gap-2 rounded-md border bg-background/80 px-3 py-2 text-sm">
                <input
                  type="checkbox"
                  checked={roomContentEditDraft.progressTracker.enabled}
                  className="accent-primary"
                  onChange={(event) => setRoomContentEditDraft({
                    ...roomContentEditDraft,
                    progressTracker: {
                      ...roomContentEditDraft.progressTracker,
                      enabled: event.target.checked,
                    },
                  })}
                />
                自动追踪状态
              </label>
              <label className="flex min-h-11 items-center gap-2 rounded-md border bg-background/80 px-3 py-2 text-sm">
                <input
                  type="checkbox"
                  checked={roomContentEditDraft.randomEvents.enabled}
                  className="accent-primary"
                  onChange={(event) => setRoomContentEditDraft({
                    ...roomContentEditDraft,
                    randomEvents: {
                      ...roomContentEditDraft.randomEvents,
                      enabled: event.target.checked,
                    },
                  })}
                />
                导演随机事件
              </label>
              <label className="flex min-h-11 items-center gap-2 rounded-md border bg-background/80 px-3 py-2 text-sm">
                <input
                  type="checkbox"
                  checked={roomContentEditDraft.illustrationHints.enabled}
                  className="accent-primary"
                  onChange={(event) => setRoomContentEditDraft({
                    ...roomContentEditDraft,
                    illustrationHints: {
                      ...roomContentEditDraft.illustrationHints,
                      enabled: event.target.checked,
                    },
                  })}
                />
                插图提示
              </label>
            </div>
            <div className={settingsEditorMetricGridClassName}>
              <TavernEditorField label="整理间隔" htmlFor="tavern-content-asset-interval">
                <Input
                  id="tavern-content-asset-interval"
                  type="number"
                  min={1}
                  max={10}
                  value={roomContentEditDraft.assetExtractionIntervalTurns}
                  className={editorControlClassName}
                  onChange={(event) => setRoomContentEditDraft({
                    ...roomContentEditDraft,
                    assetExtractionIntervalTurns: Math.min(
                      10,
                      Math.max(1, Number(event.target.value) || 1),
                    ),
                  })}
                />
              </TavernEditorField>
              <TavernEditorField label="草稿上限" htmlFor="tavern-content-max-drafts">
                <Input
                  id="tavern-content-max-drafts"
                  type="number"
                  min={1}
                  max={20}
                  value={roomContentEditDraft.maxAssetDrafts}
                  className={editorControlClassName}
                  onChange={(event) => setRoomContentEditDraft({
                    ...roomContentEditDraft,
                    maxAssetDrafts: Math.min(20, Math.max(1, Number(event.target.value) || 1)),
                  })}
                />
              </TavernEditorField>
              <TavernEditorField label="导演人数" htmlFor="tavern-content-director-speakers">
                <Input
                  id="tavern-content-director-speakers"
                  type="number"
                  min={1}
                  max={6}
                  value={roomContentEditDraft.directorMaxSpeakers}
                  className={editorControlClassName}
                  onChange={(event) => setRoomContentEditDraft({
                    ...roomContentEditDraft,
                    directorMaxSpeakers: Math.min(6, Math.max(1, Number(event.target.value) || 1)),
                  })}
                />
              </TavernEditorField>
              <TavernEditorField label="角色压缩间隔" htmlFor="tavern-content-agent-compact-interval">
                <Input
                  id="tavern-content-agent-compact-interval"
                  type="number"
                  min={0}
                  max={50}
                  value={roomContentEditDraft.agentKnowledgeCompactIntervalTurns}
                  className={editorControlClassName}
                  onChange={(event) => setRoomContentEditDraft({
                    ...roomContentEditDraft,
                    agentKnowledgeCompactIntervalTurns: Math.min(
                      50,
                      Math.max(0, Number(event.target.value) || 0),
                    ),
                  })}
                />
              </TavernEditorField>
              <TavernEditorField label="状态更新模式" htmlFor="tavern-content-progress-mode">
                <NativeSelect
                  id="tavern-content-progress-mode"
                  value={roomContentEditDraft.progressTracker.mode}
                  className={editorControlClassName}
                  onChange={(event) => setRoomContentEditDraft({
                    ...roomContentEditDraft,
                    progressTracker: {
                      ...roomContentEditDraft.progressTracker,
                      mode: event.target.value as TavernProgressTrackerSettings["mode"],
                    },
                  })}
                >
                  <NativeSelectOption value="manual">手动</NativeSelectOption>
                  <NativeSelectOption value="afterTurn">每轮</NativeSelectOption>
                  <NativeSelectOption value="fixedTurns">固定轮次</NativeSelectOption>
                </NativeSelect>
              </TavernEditorField>
              <TavernEditorField label="状态间隔" htmlFor="tavern-content-progress-interval">
                <Input
                  id="tavern-content-progress-interval"
                  type="number"
                  min={1}
                  max={50}
                  value={roomContentEditDraft.progressTracker.intervalTurns}
                  className={editorControlClassName}
                  onChange={(event) => setRoomContentEditDraft({
                    ...roomContentEditDraft,
                    progressTracker: {
                      ...roomContentEditDraft.progressTracker,
                      intervalTurns: Math.min(
                        50,
                        Math.max(1, Number(event.target.value) || 1),
                      ),
                    },
                  })}
                />
              </TavernEditorField>
              <TavernEditorField label="事实置信度" htmlFor="tavern-content-progress-confidence">
                <Input
                  id="tavern-content-progress-confidence"
                  type="number"
                  min={0}
                  max={1}
                  step={0.05}
                  value={roomContentEditDraft.progressTracker.factConfidenceThreshold}
                  className={editorControlClassName}
                  onChange={(event) => setRoomContentEditDraft({
                    ...roomContentEditDraft,
                    progressTracker: {
                      ...roomContentEditDraft.progressTracker,
                      factConfidenceThreshold: Math.min(
                        1,
                        Math.max(0, Number(event.target.value) || 0),
                      ),
                    },
                  })}
                />
              </TavernEditorField>
              <TavernEditorField label="应用方式" htmlFor="tavern-content-progress-apply-mode">
                <NativeSelect
                  id="tavern-content-progress-apply-mode"
                  value={roomContentEditDraft.progressTracker.applyMode}
                  className={editorControlClassName}
                  onChange={(event) => setRoomContentEditDraft({
                    ...roomContentEditDraft,
                    progressTracker: {
                      ...roomContentEditDraft.progressTracker,
                      applyMode: event.target.value as TavernProgressTrackerSettings["applyMode"],
                    },
                  })}
                >
                  <NativeSelectOption value="review">需确认</NativeSelectOption>
                  <NativeSelectOption value="auto">自动</NativeSelectOption>
                </NativeSelect>
              </TavernEditorField>
              <TavernEditorField label="随机事件概率" htmlFor="tavern-content-random-event-probability">
                <Input
                  id="tavern-content-random-event-probability"
                  type="number"
                  min={0}
                  max={1}
                  step={0.05}
                  value={roomContentEditDraft.randomEvents.probability}
                  className={editorControlClassName}
                  onChange={(event) => setRoomContentEditDraft({
                    ...roomContentEditDraft,
                    randomEvents: {
                      ...roomContentEditDraft.randomEvents,
                      probability: Math.min(
                        1,
                        Math.max(0, Number(event.target.value) || 0),
                      ),
                    },
                  })}
                />
              </TavernEditorField>
            </div>
          </>
        );
      case "progress":
        return (
          <>
            <div className="rounded-md border border-border/70 bg-muted/15 px-3 py-2 text-xs leading-5 text-muted-foreground">
              状态定义、状态规则和状态面板属于房间级配置；任务定义和结局条件属于当前故事阶段。保存房间后配置才会写入本地数据。
            </div>
            <TavernEditorField
              label="状态定义 JSON"
              htmlFor="tavern-content-status-definitions"
              description="定义全局、场景、角色、关系等状态栏字段。"
            >
              <Textarea
                id="tavern-content-status-definitions"
                value={roomContentEditDraft.statusDefinitionsJson}
                spellCheck={false}
                className={cn("min-h-[200px] resize-y font-mono text-xs leading-5", editorControlClassName)}
                onChange={(event) => setRoomContentEditDraft({
                  ...roomContentEditDraft,
                  statusDefinitionsJson: event.target.value,
                })}
              />
            </TavernEditorField>
            <TavernEditorField
              label="状态规则 JSON"
              htmlFor="tavern-content-status-rules"
              description="把明确事实事件映射为状态数值变化。"
            >
              <Textarea
                id="tavern-content-status-rules"
                value={roomContentEditDraft.statusRulesJson}
                spellCheck={false}
                className={cn("min-h-[200px] resize-y font-mono text-xs leading-5", editorControlClassName)}
                onChange={(event) => setRoomContentEditDraft({
                  ...roomContentEditDraft,
                  statusRulesJson: event.target.value,
                })}
              />
            </TavernEditorField>
            <TavernEditorField
              label="状态面板 JSON"
              htmlFor="tavern-content-progress-views"
              description="配置 globalHeader、sceneHeader、sidePanel、characterCard、composerBelow 等展示位置。"
            >
              <Textarea
                id="tavern-content-progress-views"
                value={roomContentEditDraft.progressViewsJson}
                spellCheck={false}
                className={cn("min-h-[200px] resize-y font-mono text-xs leading-5", editorControlClassName)}
                onChange={(event) => setRoomContentEditDraft({
                  ...roomContentEditDraft,
                  progressViewsJson: event.target.value,
                })}
              />
            </TavernEditorField>
            <TavernEditorField
              label="任务定义 JSON"
              htmlFor="tavern-content-task-definitions"
              description="配置个人、团队、可选支线等任务目标。"
            >
              <Textarea
                id="tavern-content-task-definitions"
                value={roomContentEditDraft.taskDefinitionsJson}
                spellCheck={false}
                className={cn("min-h-[160px] resize-y font-mono text-xs leading-5", editorControlClassName)}
                onChange={(event) => setRoomContentEditDraft({
                  ...roomContentEditDraft,
                  taskDefinitionsJson: event.target.value,
                })}
              />
            </TavernEditorField>
            <TavernEditorField
              label="结局条件 JSON"
              htmlFor="tavern-content-scene-outcomes"
              description="配置胜负、阶段结束建议或自动结束条件。"
            >
              <Textarea
                id="tavern-content-scene-outcomes"
                value={roomContentEditDraft.sceneOutcomesJson}
                spellCheck={false}
                className={cn("min-h-[160px] resize-y font-mono text-xs leading-5", editorControlClassName)}
                onChange={(event) => setRoomContentEditDraft({
                  ...roomContentEditDraft,
                  sceneOutcomesJson: event.target.value,
                })}
              />
            </TavernEditorField>
          </>
        );
      case "timeline":
        return (
          <>
            <TavernEditorField label="事件标题" htmlFor="tavern-content-event-title">
              <Input
                id="tavern-content-event-title"
                value={roomContentEditDraft.title}
                className={editorControlClassName}
                onChange={(event) => setRoomContentEditDraft({
                  ...roomContentEditDraft,
                  title: event.target.value,
                })}
              />
            </TavernEditorField>
            <TavernEditorField label="事件摘要" htmlFor="tavern-content-event-summary">
              <Textarea
                id="tavern-content-event-summary"
                value={roomContentEditDraft.summary}
                className={cn("min-h-[120px] resize-none text-sm leading-6", editorControlClassName)}
                onChange={(event) => setRoomContentEditDraft({
                  ...roomContentEditDraft,
                  summary: event.target.value,
                })}
              />
            </TavernEditorField>
          </>
        );
      case "lore":
        return (
          <>
            <TavernEditorField label="条目名称" htmlFor="tavern-content-lore-title">
              <Input
                id="tavern-content-lore-title"
                value={roomContentEditDraft.title}
                className={editorControlClassName}
                onChange={(event) => setRoomContentEditDraft({
                  ...roomContentEditDraft,
                  title: event.target.value,
                })}
              />
            </TavernEditorField>
            <TavernEditorField
              label="关键词"
              htmlFor="tavern-content-lore-keywords"
              description="使用逗号、中文逗号或换行分隔。"
            >
              <Input
                id="tavern-content-lore-keywords"
                value={roomContentEditDraft.keywords}
                className={editorControlClassName}
                onChange={(event) => setRoomContentEditDraft({
                  ...roomContentEditDraft,
                  keywords: event.target.value,
                })}
              />
            </TavernEditorField>
            <TavernEditorField label="设定内容" htmlFor="tavern-content-lore-content">
              <Textarea
                id="tavern-content-lore-content"
                value={roomContentEditDraft.content}
                className={cn("min-h-[132px] resize-none text-sm leading-6", editorControlClassName)}
                onChange={(event) => setRoomContentEditDraft({
                  ...roomContentEditDraft,
                  content: event.target.value,
                })}
              />
            </TavernEditorField>
            <div className="grid gap-2 sm:grid-cols-2">
              <label className="flex min-h-11 items-center gap-2 rounded-md border bg-background/80 px-3 py-2 text-sm">
                <input
                  type="checkbox"
                  checked={roomContentEditDraft.enabled}
                  className="accent-primary"
                  onChange={(event) => setRoomContentEditDraft({
                    ...roomContentEditDraft,
                    enabled: event.target.checked,
                  })}
                />
                启用
              </label>
              <label className="flex min-h-11 items-center gap-2 rounded-md border bg-background/80 px-3 py-2 text-sm">
                <input
                  type="checkbox"
                  checked={roomContentEditDraft.alwaysOn}
                  className="accent-primary"
                  onChange={(event) => setRoomContentEditDraft({
                    ...roomContentEditDraft,
                    alwaysOn: event.target.checked,
                  })}
                />
                常驻
              </label>
            </div>
          </>
        );
    }
  };

  return (
    <div className="relative flex h-full min-h-0 flex-1 overflow-hidden bg-background text-foreground">
      <ScrollArea className="min-h-0 flex-1" aria-hidden={Boolean(editingRoom)}>
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 px-5 py-5 lg:px-7">
          <header className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-md border bg-muted/35">
                <Wine className="size-5 text-primary" />
              </div>
              <div className="min-w-0">
                <h1 className="truncate text-xl font-semibold leading-7">酒馆管理</h1>
                <div className="mt-0.5 flex flex-wrap gap-2 text-xs text-muted-foreground">
                  <span>{formatCount(rooms.length, "房间")}</span>
                  <span>{formatCount(totalRoomCharacterCount, "角色")}</span>
                  <span>{formatCount(activeRoomMessages.length, "消息")}</span>
                </div>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <input
                ref={roomImportInputRef}
                type="file"
                accept="application/json,.json"
                className="hidden"
                onChange={handleImportRoomFile}
              />
              <Button type="button" onClick={onCreateRoom}>
                <Plus className="size-4" />
                新建酒馆
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    type="button"
                    size="icon"
                    variant="outline"
                    className="size-9"
                    title="更多酒馆操作"
                    aria-label="更多酒馆操作"
                  >
                    <MoreHorizontal className="size-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-44">
                  <DropdownMenuLabel>酒馆操作</DropdownMenuLabel>
                  <DropdownMenuItem
                    onSelect={() => {
                      setRoomOperationStatus("");
                      roomImportInputRef.current?.click();
                    }}
                  >
                    <FileUp className="size-4" />
                    导入酒馆
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </header>

          <section className="space-y-3">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div className="min-w-0">
                <h2 className="text-base font-semibold leading-6">酒馆</h2>
                <div className="mt-0.5 flex flex-wrap gap-2 text-xs text-muted-foreground">
                  {formatCount(rooms.length, "房间")}
                  {roomOperationStatus && (
                    <span aria-live="polite">{roomOperationStatus}</span>
                  )}
                </div>
              </div>
            </div>

            <div className="grid gap-2.5 md:grid-cols-2">
              {rooms.map((room) => {
                const isActive = room.id === activeRoom.id;
                const roomCharacters = room.characterIds
                  .map((characterId) => characterById.get(characterId))
                  .filter((character): character is TavernCharacter => Boolean(character));
                const messages = messagesByRoomId[room.id] ?? [];
                const draftCount = room.assetDrafts.length;

                return (
                  <article
                    key={room.id}
                    className={cn(
                      "flex min-h-[132px] flex-col rounded-md border bg-background p-2 shadow-sm transition-colors",
                      isActive && "border-primary/50 bg-primary/[0.03]",
                    )}
                  >
                    <button
                      type="button"
                      className="min-w-0 flex-1 text-left"
                      onClick={() => onSelectRoom(room.id)}
                    >
                      <div className="flex items-start justify-between gap-2.5">
                        <div className="min-w-0 flex-1">
                          <div className="flex min-w-0 items-center gap-1.5">
                            <h3 className="min-w-0 flex-1 truncate text-sm font-semibold">{room.title}</h3>
                            {room.systemPresetId && (
                              <Badge variant="secondary" className="h-5 shrink-0 px-1.5 text-[11px]">
                                系统预设
                              </Badge>
                            )}
                            {room.locked && (
                              <Badge
                                variant="outline"
                                className="h-5 w-5 shrink-0 justify-center p-0"
                                title="已锁定"
                                aria-label="已锁定"
                              >
                                <LockKeyhole className="size-3" />
                              </Badge>
                            )}
                          </div>
                          <p className="mt-1 line-clamp-1 text-xs leading-5 text-muted-foreground">
                            {compactScene(room.scene)}
                          </p>
                        </div>
                        <div className="flex shrink-0 items-center gap-1">
                          {roomCharacters.slice(0, 3).map((character) => (
                            <img
                              key={character.id}
                              src={resolveAgentAvatar(character.avatar).src}
                              alt=""
                              className="size-6 rounded-md border bg-background"
                            />
                          ))}
                        </div>
                      </div>
                      {room.sceneGoal.trim() && (
                        <div className="mt-1.5 line-clamp-1 rounded-md bg-muted/35 px-2 py-1 text-xs leading-5 text-muted-foreground">
                          {room.sceneGoal}
                        </div>
                      )}
                    </button>

                    <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <span className="inline-flex items-center gap-1">
                        <UsersRound className="size-3.5" />
                        {roomCharacters.length}
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <MessageCircle className="size-3.5" />
                        {messages.length}
                      </span>
                      {draftCount > 0 && <span>{draftCount} 草稿</span>}
                    </div>

                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                      <div className="grid min-w-[156px] flex-1 grid-cols-2 gap-1.5">
                        <Button
                          type="button"
                          size="sm"
                          className="h-8 min-w-[74px] whitespace-nowrap"
                          onClick={() => onOpenRoom(room.id)}
                        >
                          <ArrowRight className="size-3.5 shrink-0" />
                          <span className="truncate">进入</span>
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-8 min-w-[74px] whitespace-nowrap"
                          onClick={() => openRoomEditor(room.id)}
                        >
                          <Pencil className="size-3.5 shrink-0" />
                          <span className="truncate">编辑</span>
                        </Button>
                      </div>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            className="ml-auto size-8 shrink-0"
                            title="更多操作"
                            aria-label={`更多操作：${room.title}`}
                          >
                            <MoreHorizontal className="size-3.5" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-44">
                          <DropdownMenuLabel>房间操作</DropdownMenuLabel>
                          <DropdownMenuItem onSelect={() => onCopyRoom(room.id)}>
                            <Copy className="size-4" />
                            复制酒馆
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onSelect={() => {
                              const exported = onExportRoom(room.id);
                              setRoomOperationStatus(
                                exported
                                  ? `已导出「${room.title}」`
                                  : `导出「${room.title}」失败`,
                              );
                            }}
                          >
                            <Download className="size-4" />
                            导出酒馆
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            variant="destructive"
                            disabled={room.locked}
                            onSelect={() => requestDangerAction({
                              title: "清空对话",
                              description: `清空「${room.title}」的对话记录？`,
                              secondDescription: "再次确认清空对话？当前房间现有消息会被替换为一条重置提示。",
                              confirmLabel: "清空对话",
                              summary: formatCount(messages.length, "消息"),
                              onConfirm: () => onClearRoomMessages(room.id),
                            })}
                          >
                            <RotateCcw className="size-4" />
                            清空对话
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onSelect={() => requestRoomLockChange(room.id, !room.locked)}
                          >
                            {room.locked ? (
                              <LockKeyhole className="size-4" />
                            ) : (
                              <UnlockKeyhole className="size-4" />
                            )}
                            {room.locked ? "解锁酒馆" : "锁定酒馆"}
                          </DropdownMenuItem>
                          {room.systemPresetId && (
                            <DropdownMenuItem
                              disabled={room.locked}
                              onSelect={() => requestRestoreSystemPresetRoom(room.id)}
                            >
                              <RotateCcw className="size-4" />
                              恢复默认
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuItem
                            variant="destructive"
                            disabled={!canDeleteRoom || room.locked}
                            onSelect={() => requestDeleteRoom(room.id)}
                          >
                            <Trash2 className="size-4" />
                            删除酒馆
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        </div>
      </ScrollArea>

      <Dialog
        open={Boolean(deletingRoom)}
        onOpenChange={(open) => {
          if (!open) {
            setDeletingRoomId(null);
          }
        }}
      >
        {deletingRoom && (
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <div className="flex items-center gap-2">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-destructive/10 text-destructive">
                  <TriangleAlertIcon className="size-4" />
                </span>
                <DialogTitle>确认删除酒馆</DialogTitle>
              </div>
              <DialogDescription>
                「{deletingRoom.title}」将从首页移除，相关对话记录和剧情资产也会一并删除。
              </DialogDescription>
            </DialogHeader>

            <div className="rounded-md border bg-muted/20 px-3 py-2 text-sm text-muted-foreground">
              {formatCount(messagesByRoomId[deletingRoom.id]?.length ?? 0, "消息")}
              {" / "}
              {formatCount(deletingRoom.characterIds.length, "入席角色")}
              {" / "}
              {formatCount(deletingRoom.assetDrafts.length, "草稿")}
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setDeletingRoomId(null)}
              >
                取消
              </Button>
              <Button
                type="button"
                variant="destructive"
                onClick={confirmDeleteRoom}
              >
                <Trash2 className="size-4" />
                删除酒馆
              </Button>
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>

      <Dialog
        open={Boolean(restoringRoom)}
        onOpenChange={(open) => {
          if (!open) {
            setRestoringRoomId(null);
          }
        }}
      >
        {restoringRoom && (
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <div className="flex items-center gap-2">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-destructive/10 text-destructive">
                  <TriangleAlertIcon className="size-4" />
                </span>
                <DialogTitle>确认恢复默认</DialogTitle>
              </div>
              <DialogDescription>
                「{restoringRoom.title}」将被系统预设内容覆盖，当前场景、角色、记忆、剧情资产和对话记录都会重置。
              </DialogDescription>
            </DialogHeader>

            <div className="rounded-md border bg-muted/20 px-3 py-2 text-sm text-muted-foreground">
              {formatCount(messagesByRoomId[restoringRoom.id]?.length ?? 0, "消息")}
              {" / "}
              {formatCount(restoringRoom.timelineEvents.length, "剧情事件")}
              {" / "}
              {formatCount(restoringRoom.lorebookEntries.length, "世界书")}
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setRestoringRoomId(null)}
              >
                取消
              </Button>
              <Button
                type="button"
                variant="destructive"
                onClick={confirmRestoreSystemPresetRoom}
              >
                <RotateCcw className="size-4" />
                继续恢复
              </Button>
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>

      <Dialog
        open={Boolean(lockingRoom)}
        onOpenChange={(open) => {
          if (!open) {
            setLockingRoomRequest(null);
          }
        }}
      >
        {lockingRoom && (
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <div className="flex items-center gap-2">
                <span className={cn(
                  "flex size-8 shrink-0 items-center justify-center rounded-md",
                  isLockingRoom
                    ? "bg-primary/10 text-primary"
                    : "bg-destructive/10 text-destructive",
                )}>
                  {isLockingRoom ? (
                    <LockKeyhole className="size-4" />
                  ) : (
                    <UnlockKeyhole className="size-4" />
                  )}
                </span>
                <DialogTitle>
                  {isLockingRoom ? "确认锁定酒馆" : "确认解锁酒馆"}
                </DialogTitle>
              </div>
              <DialogDescription>
                {isLockingRoom
                  ? `锁定「${lockingRoom.title}」后，将不能删除该酒馆、恢复系统默认或清空对话。`
                  : `解锁「${lockingRoom.title}」后，将重新允许删除该酒馆、恢复系统默认或清空对话。`}
              </DialogDescription>
            </DialogHeader>

            <div className="rounded-md border bg-muted/20 px-3 py-2 text-sm text-muted-foreground">
              {formatCount(messagesByRoomId[lockingRoom.id]?.length ?? 0, "消息")}
              {" / "}
              {formatCount(lockingRoom.timelineEvents.length, "剧情事件")}
              {" / "}
              {formatCount(lockingRoom.lorebookEntries.length, "世界书")}
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setLockingRoomRequest(null)}
              >
                取消
              </Button>
              <Button
                type="button"
                variant={isLockingRoom ? "default" : "destructive"}
                onClick={confirmRoomLockChange}
              >
                {isLockingRoom ? (
                  <LockKeyhole className="size-4" />
                ) : (
                  <UnlockKeyhole className="size-4" />
                )}
                {isLockingRoom ? "继续锁定" : "继续解锁"}
              </Button>
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>

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
                <DialogTitle>
                  {dangerConfirmStep === 1
                    ? pendingDangerAction.title
                    : `再次确认${pendingDangerAction.title}`}
                </DialogTitle>
              </div>
              <DialogDescription>
                {dangerConfirmStep === 1
                  ? pendingDangerAction.description
                  : pendingDangerAction.secondDescription}
              </DialogDescription>
            </DialogHeader>

            {pendingDangerAction.summary && (
              <div className="rounded-md border bg-muted/20 px-3 py-2 text-sm text-muted-foreground">
                {pendingDangerAction.summary}
              </div>
            )}

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
                {dangerConfirmStep === 1 ? "继续" : pendingDangerAction.confirmLabel}
              </Button>
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>

      {editingRoom && (
          <div className="absolute inset-0 z-30 flex min-h-0 flex-col overflow-hidden bg-background">
            <header className="shrink-0 border-b bg-muted/10 px-5 py-4 lg:px-7">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0 space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <h1 className="truncate text-xl font-semibold leading-7">
                      {editingRoom.title.trim() || emptyValueText}
                    </h1>
                    {editingRoom.systemPresetId && (
                      <Badge variant="secondary">
                        系统预设
                      </Badge>
                    )}
                    {editingRoom.locked && (
                      <Badge variant="outline" className="gap-1">
                        <LockKeyhole className="size-3" />
                        已锁定
                      </Badge>
                    )}
                  </div>
                  <p className="line-clamp-2 max-w-2xl text-sm leading-6 text-muted-foreground">
                    编辑酒馆内容、共享剧情资产和可用故事场景。
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4 lg:min-w-[360px]">
                  <div className="rounded-md border bg-background/70 px-3 py-2">
                    <div className="font-medium">{formatCount(editingRoomCharacters.length, "角色")}</div>
                    <div className="text-muted-foreground">入席</div>
                  </div>
                  <div className="rounded-md border bg-background/70 px-3 py-2">
                    <div className="font-medium">{formatCount(editingRoomMessageCount, "消息")}</div>
                    <div className="text-muted-foreground">对话</div>
                  </div>
                  <div className="rounded-md border bg-background/70 px-3 py-2">
                    <div className="font-medium">{formatCount(editingRoom.timelineEvents.length, "事件")}</div>
                    <div className="text-muted-foreground">时间线</div>
                  </div>
                  <div className="rounded-md border bg-background/70 px-3 py-2">
                    <div className="font-medium">{formatCount(editingRoom.lorebookEntries.length, "条")}</div>
                    <div className="text-muted-foreground">世界书</div>
                  </div>
                </div>
              </div>
            </header>

            <ScrollArea className="min-h-0 flex-1 bg-background">
              <div className="mx-auto flex w-full max-w-5xl flex-col px-5 py-2 lg:px-6">
                <TavernEditorSection
                  icon={Wine}
                  title="基础信息"
                  meta={editingRoomScenePreset?.label ?? "通用"}
                  action={(
                    <Button
                      type="button"
                      size="xs"
                      variant="outline"
                      onClick={openBasicContentEditor}
                    >
                      <Pencil className="size-3.5" />
                      编辑
                    </Button>
                  )}
                  contentClassName="space-y-0 pb-3"
                >
                  <div className="rounded-md bg-muted/15 px-3 py-2.5">
                    <div className="grid gap-2 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
                      <div className="grid min-w-0 gap-1.5">
                        <TavernInlineSummaryItem
                          label="大故事"
                          value={editingRoom.storyOutline}
                        />
                        <TavernInlineSummaryItem
                          label="终局"
                          value={editingRoom.storyGoal}
                        />
                      </div>
                      <div className="flex min-w-0 flex-wrap gap-1.5 lg:justify-end">
                        <Badge variant="outline">
                          阶段：{editingActiveScene?.title.trim() || emptyValueText}
                        </Badge>
                        <Badge variant="outline">
                          {formatCount(editingRoom.scenes?.length ?? 1, "场景")}
                        </Badge>
                        <Badge variant="outline">
                          {getReplyModeLabel(editingRoom.replyMode ?? "active")}
                        </Badge>
                        <Badge variant="outline">
                          称呼：{editingRoom.userPersonaName.trim() || emptyValueText}
                        </Badge>
                      </div>
                    </div>
                  </div>
                </TavernEditorSection>

                  <TavernEditorSection
                    className="order-last"
                    icon={Clapperboard}
                    title="故事场景"
                    description="编排同一个大故事中的阶段；酒馆内只会切换这里配置好的场景。"
                    meta={formatCount(editingRoomScenes.length, "阶段")}
                    action={(
                      <Button
                        type="button"
                        size="xs"
                        variant="outline"
                        disabled={editingRoom.locked}
                        onClick={createEditingRoomScene}
                      >
                        <Plus className="size-3.5" />
                        新增阶段
                      </Button>
                    )}
                    contentClassName="space-y-2"
                  >
                    <TooltipProvider delayDuration={180}>
                      <div className="grid gap-2">
                        {editingRoomScenes.map((scene, index) => {
                          const isActiveScene = scene.id === editingRoom.activeSceneId;
                          const sceneCharacters = scene.characterIds
                            .map((characterId) => editingRoomCharacterById.get(characterId))
                            .filter((character): character is TavernCharacter => Boolean(character));
                          const sceneTitle = scene.title || `阶段 ${index + 1}`;

                          return (
                            <div
                              key={scene.id}
                              className={cn(
                                "rounded-md border bg-background/80 p-3",
                                isActiveScene && "border-primary/45 bg-primary/[0.06] ring-1 ring-primary/10",
                              )}
                            >
                              <div className="flex min-w-0 items-start gap-3">
                                <span className="flex size-8 shrink-0 items-center justify-center rounded-md border bg-muted/50 text-xs font-medium text-muted-foreground">
                                  {index + 1}
                                </span>
                                <div className="min-w-0 flex-1">
                                  <div className="flex min-w-0 items-start justify-between gap-3">
                                    <div className="min-w-0">
                                      <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                                        <div className="min-w-0 truncate text-sm font-medium leading-5">
                                          {sceneTitle}
                                        </div>
                                        {isActiveScene && <Badge variant="secondary">默认</Badge>}
                                      </div>
                                      <div className="mt-1 line-clamp-2 whitespace-pre-wrap text-sm leading-6 text-muted-foreground">
                                        {scene.plot.trim() || scene.scene.trim() || emptyValueText}
                                      </div>
                                    </div>
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <div
                                          tabIndex={0}
                                          className="flex max-w-[14rem] shrink-0 cursor-default items-center gap-1.5 rounded-md bg-muted/35 px-2 py-1 outline-none focus-visible:ring-2 focus-visible:ring-ring/50 sm:max-w-xs"
                                        >
                                          <div className="flex -space-x-1.5">
                                            {sceneCharacters.map((character) => (
                                              <img
                                                key={character.id}
                                                src={resolveAgentAvatar(character.avatar).src}
                                                alt=""
                                                className="size-6 rounded-full border bg-muted"
                                              />
                                            ))}
                                            {sceneCharacters.length === 0 && (
                                              <span className="flex size-6 items-center justify-center rounded-full border bg-background text-[11px] text-muted-foreground">
                                                0
                                              </span>
                                            )}
                                          </div>
                                          <span className="whitespace-nowrap text-xs text-muted-foreground">
                                            {formatCount(sceneCharacters.length, "角色")}
                                          </span>
                                        </div>
                                      </TooltipTrigger>
                                      <TooltipContent side="top" align="end" className="max-w-xs p-3 text-left">
                                        <div className="space-y-2">
                                          <div className="font-medium text-background">场景角色</div>
                                          {sceneCharacters.length > 0 ? (
                                            sceneCharacters.map((character) => (
                                              <div key={character.id} className="flex min-w-0 gap-2">
                                                <img
                                                  src={resolveAgentAvatar(character.avatar).src}
                                                  alt=""
                                                  className="size-7 rounded-md border border-background/20 bg-background/10"
                                                />
                                                <div className="min-w-0">
                                                  <div className="truncate text-sm font-medium text-background">
                                                    {character.name}
                                                  </div>
                                                  <div className="line-clamp-2 text-xs leading-5 text-background/75">
                                                    {character.speakingStyle || emptyValueText}
                                                  </div>
                                                </div>
                                              </div>
                                            ))
                                          ) : (
                                            <div className="text-xs text-background/75">暂无引用角色</div>
                                          )}
                                        </div>
                                      </TooltipContent>
                                    </Tooltip>
                                  </div>
                                  <div className="mt-3 grid gap-1.5">
                                    <TavernSceneSummaryLine label="场景描述" value={scene.scene} />
                                    <TavernSceneSummaryLine label="阶段剧情" value={scene.plot} />
                                    <TavernSceneSummaryLine label="场景目标" value={scene.sceneGoal} />
                                    <TavernSceneSummaryLine label="剧情走向" value={scene.storyDirection} />
                                    <TavernSceneSummaryLine label="承接关系" value={scene.transition} />
                                    <TavernSceneSummaryLine label="阶段记忆" value={scene.memory} />
                                    <TavernSceneSummaryLine
                                      label="时间线范围"
                                      value={getTimelineScopeSummary(
                                        scene.timelineScope,
                                        editingRoom.timelineEvents,
                                      )}
                                    />
                                  </div>
                                </div>
                              </div>
                              <div className="mt-3 flex flex-wrap justify-end gap-1 border-t pt-2">
                                <Button
                                  type="button"
                                  size="xs"
                                  variant="ghost"
                                  disabled={editingRoom.locked || index === 0}
                                  onClick={() => moveEditingRoomScene(scene.id, -1)}
                                >
                                  上移
                                </Button>
                                <Button
                                  type="button"
                                  size="xs"
                                  variant="ghost"
                                  disabled={editingRoom.locked || index === editingRoomScenes.length - 1}
                                  onClick={() => moveEditingRoomScene(scene.id, 1)}
                                >
                                  下移
                                </Button>
                                <Button
                                  type="button"
                                  size="xs"
                                  variant={isActiveScene ? "secondary" : "outline"}
                                  disabled={isActiveScene}
                                  onClick={() => switchEditingRoomScene(scene.id)}
                                >
                                  设为默认
                                </Button>
                                <Button
                                  type="button"
                                  size="xs"
                                  variant="outline"
                                  aria-label={`编辑${sceneTitle}叙事`}
                                  onClick={() => openNarrativeContentEditor(scene.id)}
                                >
                                  编辑
                                </Button>
                                <Button
                                  type="button"
                                  size="xs"
                                  variant="ghost"
                                  disabled={editingRoom.locked || editingRoomScenes.length <= 1}
                                  onClick={() => {
                                    const sceneLabel = scene.title.trim() || `阶段 ${index + 1}`;
                                    requestDangerAction({
                                      title: "删除故事阶段",
                                      description: `删除「${sceneLabel}」？`,
                                      secondDescription:
                                        "再次确认删除故事阶段？保存后该阶段的剧情配置和对话历史会被移除。",
                                      confirmLabel: "删除阶段",
                                      onConfirm: () => deleteEditingRoomScene(scene.id),
                                    });
                                  }}
                                >
                                  删除
                                </Button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </TooltipProvider>
                  </TavernEditorSection>

                  <TavernEditorSection
                    icon={Settings2}
                    title="运行设置"
                    description="控制执行过程、剧情资产整理频率和导演调度人数。"
                    action={(
                      <Button
                        type="button"
                        size="xs"
                        variant="outline"
                        onClick={openSettingsContentEditor}
                      >
                        <Pencil className="size-3.5" />
                      编辑
                    </Button>
                  )}
                    contentClassName="space-y-0 pb-4"
                  >
                    <div className="grid gap-2 rounded-md border border-border/70 bg-muted/15 p-2 sm:grid-cols-2 lg:grid-cols-[minmax(0,1.6fr)_repeat(6,minmax(6.25rem,1fr))]">
                      <TavernCompactSummaryItem
                        label="酒馆模型"
                        value={editingRoomModelLabel}
                        className="sm:col-span-2 lg:col-span-1"
                      />
                      <TavernCompactSummaryItem
                        label="沉浸描写"
                        value={(
                          <Badge variant={editingRoom.settings.immersiveDescriptionEnabled ? "secondary" : "outline"}>
                            {editingRoom.settings.immersiveDescriptionEnabled ? "开启" : "关闭"}
                          </Badge>
                        )}
                        valueClassName="flex"
                      />
                      <TavernCompactSummaryItem
                        label="显示执行过程"
                        value={(
                          <Badge variant={editingRoom.settings.showExecutionTrace ? "secondary" : "outline"}>
                            {editingRoom.settings.showExecutionTrace ? "开启" : "关闭"}
                          </Badge>
                        )}
                        valueClassName="flex"
                      />
                      <TavernCompactSummaryItem
                        label="自动整理剧情资产"
                        value={(
                          <Badge variant={editingRoom.settings.autoAssetExtractionEnabled ? "secondary" : "outline"}>
                            {editingRoom.settings.autoAssetExtractionEnabled ? "开启" : "关闭"}
                          </Badge>
                        )}
                        valueClassName="flex"
                      />
                      <TavernCompactSummaryItem
                        label="状态栏"
                        value={(
                          <Badge variant={editingRoom.settings.statusTracking.enabled ? "secondary" : "outline"}>
                            {editingRoom.settings.statusTracking.enabled ? "显示" : "隐藏"}
                          </Badge>
                        )}
                        valueClassName="flex"
                      />
                      <TavernCompactSummaryItem
                        label="自动追踪状态"
                        value={(
                          <Badge variant={editingRoom.progressTracker.enabled ? "secondary" : "outline"}>
                            {editingRoom.progressTracker.enabled ? "开启" : "关闭"}
                          </Badge>
                        )}
                        valueClassName="flex"
                      />
                      <TavernCompactSummaryItem
                        label="导演随机事件"
                        value={(
                          <Badge variant={editingRoom.settings.randomEvents.enabled ? "secondary" : "outline"}>
                            {editingRoom.settings.randomEvents.enabled
                              ? `${Math.round(editingRoom.settings.randomEvents.probability * 100)}%`
                              : "关闭"}
                          </Badge>
                        )}
                        valueClassName="flex"
                      />
                      <TavernCompactSummaryItem
                        label="插图提示"
                        value={(
                          <Badge variant={editingRoom.settings.illustrationHints.enabled ? "secondary" : "outline"}>
                            {editingRoom.settings.illustrationHints.enabled ? "开启" : "关闭"}
                          </Badge>
                        )}
                        valueClassName="flex"
                      />
                      <TavernCompactSummaryItem
                        label="整理间隔"
                        value={`${editingRoom.settings.assetExtractionIntervalTurns} 轮`}
                      />
                      <TavernCompactSummaryItem
                        label="草稿上限"
                        value={`${editingRoom.settings.maxAssetDrafts} 条`}
                      />
                      <TavernCompactSummaryItem
                        label="导演人数"
                        value={`${editingRoom.settings.directorMaxSpeakers} 人`}
                      />
                      <TavernCompactSummaryItem
                        label="角色压缩"
                        value={editingRoom.settings.agentKnowledgeCompactIntervalTurns > 0
                          ? `${editingRoom.settings.agentKnowledgeCompactIntervalTurns} 轮`
                          : "关闭"}
                      />
                      <TavernCompactSummaryItem
                        label="状态追踪"
                        value={editingRoom.progressTracker.mode === "manual"
                          ? "手动"
                          : editingRoom.progressTracker.mode === "afterTurn"
                          ? "每轮"
                          : `${editingRoom.progressTracker.intervalTurns} 轮`}
                      />
                    </div>
                  </TavernEditorSection>

                  <TavernEditorSection
                    icon={Activity}
                    title="进度系统"
                    description="检查状态栏定义、规则引擎、任务目标、结局条件和可重建快照。"
                    action={(
                      <Button
                        type="button"
                        size="xs"
                        variant="outline"
                        onClick={openProgressContentEditor}
                      >
                        <Pencil className="size-3.5" />
                        编辑
                      </Button>
                    )}
                    contentClassName="space-y-0 pb-4"
                  >
                    <div className="grid gap-2 rounded-md border border-border/70 bg-muted/15 p-2 sm:grid-cols-2 lg:grid-cols-4">
                      <TavernCompactSummaryItem
                        label="状态定义"
                        value={formatCount(editingRoom.statusDefinitions.length, "项")}
                      />
                      <TavernCompactSummaryItem
                        label="状态规则"
                        value={formatCount(editingRoom.statusRules.length, "条")}
                      />
                      <TavernCompactSummaryItem
                        label="状态面板"
                        value={formatCount(editingRoom.progressViews.length, "个")}
                        description={editingProgressPlacementText || "未配置展示位置"}
                      />
                      <TavernCompactSummaryItem
                        label="任务定义"
                        value={formatCount(editingRoom.taskDefinitions.length, "个")}
                        description={formatCount(editingActiveTaskCount, "进行中")}
                      />
                      <TavernCompactSummaryItem
                        label="结局条件"
                        value={formatCount(editingRoom.sceneOutcomes.length, "个")}
                        description={formatCount(editingOutcomeEventCount, "已触发")}
                      />
                      <TavernCompactSummaryItem
                        label="状态事件"
                        value={formatCount(editingRoom.statusEvents.length, "条")}
                        description={`${editingAppliedStatusEventCount} 已应用 / ${editingPendingStatusEventCount} 待确认`}
                      />
                      <TavernCompactSummaryItem
                        label="检查点"
                        value={formatCount(editingRoom.statusCheckpoints.length, "个")}
                        description="可用于裁切后重建状态"
                      />
                      <TavernCompactSummaryItem
                        label="应用方式"
                        value={editingRoom.progressTracker.applyMode === "review" ? "确认后应用" : "自动应用"}
                        description={`置信阈值 ${editingRoom.progressTracker.factConfidenceThreshold}`}
                      />
                    </div>
                  </TavernEditorSection>

                  <TavernEditorSection
                    icon={UsersRound}
                    title="酒馆角色库"
                    description="维护可被各故事场景引用的角色定义；出场关系和场景记忆在故事场景中编辑。"
                    meta={formatCount(editingRoom.localCharacters?.length ?? 0, "角色")}
                    action={(
                      <Button
                        type="button"
                        size="xs"
                        variant="outline"
                        onClick={() => setIsCreatingRoomCharacter(true)}
                      >
                        <Plus className="size-3.5" />
                        新建
                      </Button>
                    )}
                    contentClassName="space-y-0"
                  >
                    <TooltipProvider delayDuration={180}>
                      <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-3">
                        {(editingRoom.localCharacters ?? []).map((character) => {
                          const referencedSceneCount = editingRoomScenes.filter((scene) =>
                            scene.characterIds.includes(character.id)
                          ).length;

                          return (
                            <Tooltip key={character.id}>
                              <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-2 rounded-md border bg-background/80 p-2.5">
                                <TooltipTrigger asChild>
                                  <div
                                    tabIndex={0}
                                    className="grid min-w-0 cursor-default grid-cols-[auto_minmax(0,1fr)] items-center gap-2.5 rounded-[6px] outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                                  >
                                    <img
                                      src={resolveAgentAvatar(character.avatar).src}
                                      alt=""
                                      className="size-10 rounded-md border bg-muted/20"
                                    />
                                    <div className="min-w-0">
                                      <div className="truncate text-sm font-medium leading-5">
                                        {character.name}
                                      </div>
                                      <div className="mt-1 truncate text-xs text-muted-foreground">
                                        {character.speakingStyle.trim() || emptyValueText}
                                      </div>
                                    </div>
                                  </div>
                                </TooltipTrigger>
                                <Button
                                  type="button"
                                  size="icon-xs"
                                  variant="ghost"
                                  title="编辑角色资料"
                                  aria-label={`编辑${character.name}的角色资料`}
                                  onClick={() => setEditingCharacterId(character.id)}
                                >
                                  <Pencil className="size-3.5" />
                                </Button>
                                <TooltipContent
                                  side="top"
                                  align="start"
                                  className="max-w-sm p-3 text-left"
                                >
                                  <div className="space-y-2">
                                    <div>
                                      <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                                        <span className="font-medium text-background">
                                          {character.name}
                                        </span>
                                        <span className="rounded-sm bg-background/15 px-1.5 py-0.5 text-[11px] text-background/80">
                                          {editingRoomModelLabel}
                                        </span>
                                      </div>
                                      <div className="mt-1 text-background/80">
                                        {formatCount(referencedSceneCount, "引用场景")}
                                      </div>
                                    </div>
                                    <div>
                                      <div className="font-medium text-background/90">
                                        角色设定
                                      </div>
                                      <div className="mt-0.5 whitespace-pre-wrap text-background/80">
                                        {character.description || emptyValueText}
                                      </div>
                                    </div>
                                    <div>
                                      <div className="font-medium text-background/90">
                                        说话方式
                                      </div>
                                      <div className="mt-0.5 whitespace-pre-wrap text-background/80">
                                        {character.speakingStyle || emptyValueText}
                                      </div>
                                    </div>
                                    <div>
                                      <div className="font-medium text-background/90">目标</div>
                                      <div className="mt-0.5 whitespace-pre-wrap text-background/80">
                                        {character.goals || emptyValueText}
                                      </div>
                                    </div>
                                    <div>
                                      <div className="font-medium text-background/90">关系</div>
                                      <div className="mt-0.5 whitespace-pre-wrap text-background/80">
                                        {character.relationships || emptyValueText}
                                      </div>
                                    </div>
                                  </div>
                                </TooltipContent>
                              </div>
                            </Tooltip>
                          );
                        })}
                        {(editingRoom.localCharacters?.length ?? 0) === 0 && (
                          <div className="rounded-md border bg-background px-3 py-4 text-center text-sm text-muted-foreground md:col-span-2 lg:col-span-3">
                            暂无角色定义。
                          </div>
                        )}
                      </div>
                    </TooltipProvider>
                  </TavernEditorSection>

                  <TavernEditorSection
                    icon={Clock}
                    title="剧情时间线"
                    description="沉淀整个大故事已经确定发生过的关键事件。"
                    meta={formatCount(editingRoom.timelineEvents.length, "事件")}
                    action={(
                      <div className="flex items-center gap-1">
                        <Button
                          type="button"
                          size="icon-xs"
                          variant="ghost"
                          disabled={editingRoom.timelineEvents.length === 0}
                          title={areAllTimelineEventsCollapsed ? "全部展开剧情事件" : "全部折叠剧情事件"}
                          aria-label={areAllTimelineEventsCollapsed ? "全部展开剧情事件" : "全部折叠剧情事件"}
                          onClick={() =>
                            setAllTimelineEventsCollapsed(!areAllTimelineEventsCollapsed)
                          }
                        >
                          {areAllTimelineEventsCollapsed ? (
                            <ChevronsUpDown className="size-3.5" />
                          ) : (
                            <ChevronsDownUp className="size-3.5" />
                          )}
                        </Button>
                        <Button
                          type="button"
                          size="xs"
                          variant="outline"
                          onClick={() => openTimelineContentEditor()}
                        >
                          <Plus className="size-3.5" />
                          新增
                        </Button>
                      </div>
                    )}
                  >
                    <ol className="space-y-3 pl-7">
                      {editingRoom.timelineEvents.map((event, index) => {
                        const isCollapsed = Boolean(collapsedTimelineEventIds[event.id]);

                        return (
                          <li key={event.id} className="relative">
                            {index < editingRoom.timelineEvents.length - 1 && (
                              <span
                                className="absolute -bottom-3 -left-4 top-9 w-px bg-border"
                                aria-hidden="true"
                              />
                            )}
                            <span className="absolute -left-7 top-3 flex size-6 items-center justify-center rounded-full border bg-background text-[11px] font-medium text-muted-foreground shadow-xs">
                              {index + 1}
                            </span>
                            <div className="rounded-md bg-muted/15 px-3 py-2.5">
                              <div className="flex items-start gap-2">
                                <Button
                                  type="button"
                                  size="icon-xs"
                                  variant="ghost"
                                  className="mt-0.5"
                                  title={isCollapsed ? "展开剧情事件" : "折叠剧情事件"}
                                  aria-label={isCollapsed ? "展开剧情事件" : "折叠剧情事件"}
                                  onClick={() =>
                                    setCollapsedTimelineEventIds((current) => ({
                                      ...current,
                                      [event.id]: !isCollapsed,
                                    }))
                                  }
                                >
                                  {isCollapsed ? (
                                    <ChevronRight className="size-3.5" />
                                  ) : (
                                    <ChevronDown className="size-3.5" />
                                  )}
                                </Button>
                                <div className="min-w-0 flex-1">
                                  <div className="truncate text-sm font-medium leading-5">
                                    {event.title || emptyValueText}
                                  </div>
                                  {!isCollapsed && (
                                    <div className="mt-1 whitespace-pre-wrap text-sm leading-6 text-muted-foreground">
                                      {event.summary || emptyValueText}
                                    </div>
                                  )}
                                </div>
                                <Button
                                  type="button"
                                  size="icon-sm"
                                  variant="ghost"
                                  title="编辑剧情事件"
                                  aria-label="编辑剧情事件"
                                  onClick={() => openTimelineContentEditor(event)}
                                >
                                  <Pencil className="size-4" />
                                </Button>
                                <Button
                                  type="button"
                                  size="icon-sm"
                                  variant="ghost"
                                  title="删除剧情事件"
                                  aria-label="删除剧情事件"
                                  onClick={() => {
                                    const eventLabel =
                                      event.title.trim() || `剧情事件 ${index + 1}`;
                                    requestDangerAction({
                                      title: "删除剧情事件",
                                      description: `删除剧情事件「${eventLabel}」？`,
                                      secondDescription:
                                        "再次确认删除剧情事件？保存后它会从当前酒馆的剧情时间线中移除。",
                                      confirmLabel: "删除事件",
                                      onConfirm: () =>
                                        patchEditingRoomDraft({
                                          timelineEvents: editingRoom.timelineEvents.filter(
                                            (item) => item.id !== event.id,
                                          ),
                                        }),
                                    });
                                  }}
                                >
                                  <Trash2 className="size-4" />
                                </Button>
                              </div>
                            </div>
                          </li>
                        );
                      })}
                      {editingRoom.timelineEvents.length === 0 && (
                        <li className="rounded-md bg-muted/15 px-3 py-4 text-center text-sm text-muted-foreground">
                          暂无剧情事件。
                        </li>
                      )}
                    </ol>
                  </TavernEditorSection>

                  <TavernEditorSection
                    icon={BookOpen}
                    title="世界书"
                    description="维护整个酒馆故事可被关键词触发或常驻生效的共享设定资料。"
                    meta={formatCount(editingRoom.lorebookEntries.length, "条")}
                    action={(
                      <div className="flex items-center gap-1">
                        <Button
                          type="button"
                          size="icon-xs"
                          variant="ghost"
                          disabled={editingRoom.lorebookEntries.length === 0}
                          title={areAllLoreEntriesCollapsed ? "全部展开世界书" : "全部折叠世界书"}
                          aria-label={areAllLoreEntriesCollapsed ? "全部展开世界书" : "全部折叠世界书"}
                          onClick={() =>
                            setAllLoreEntriesCollapsed(!areAllLoreEntriesCollapsed)
                          }
                        >
                          {areAllLoreEntriesCollapsed ? (
                            <ChevronsUpDown className="size-3.5" />
                          ) : (
                            <ChevronsDownUp className="size-3.5" />
                          )}
                        </Button>
                        <Button
                          type="button"
                          size="xs"
                          variant="outline"
                          onClick={() => openLoreContentEditor()}
                        >
                          <Plus className="size-3.5" />
                          新增
                        </Button>
                      </div>
                    )}
                  >
                    <ol className="space-y-3 pl-7">
                      {editingRoom.lorebookEntries.map((entry, index) => {
                        const isCollapsed = Boolean(collapsedLoreEntryIds[entry.id]);

                        return (
                          <li key={entry.id} className="relative">
                            {index < editingRoom.lorebookEntries.length - 1 && (
                              <span
                                className="absolute -bottom-3 -left-4 top-9 w-px bg-border"
                                aria-hidden="true"
                              />
                            )}
                            <span
                              className={cn(
                                "absolute -left-7 top-3 flex size-6 items-center justify-center rounded-full border bg-background text-[11px] font-medium shadow-xs",
                                entry.enabled ? "text-primary" : "text-muted-foreground",
                              )}
                            >
                              {index + 1}
                            </span>
                            <div className="rounded-md bg-muted/15 px-3 py-2.5">
                              <div className="flex items-start gap-2">
                                <Button
                                  type="button"
                                  size="icon-xs"
                                  variant="ghost"
                                  className="mt-0.5"
                                  title={isCollapsed ? "展开世界书" : "折叠世界书"}
                                  aria-label={isCollapsed ? "展开世界书" : "折叠世界书"}
                                  onClick={() =>
                                    setCollapsedLoreEntryIds((current) => ({
                                      ...current,
                                      [entry.id]: !isCollapsed,
                                    }))
                                  }
                                >
                                  {isCollapsed ? (
                                    <ChevronRight className="size-3.5" />
                                  ) : (
                                    <ChevronDown className="size-3.5" />
                                  )}
                                </Button>
                                <div className="min-w-0 flex-1">
                                  <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                                    <div className="min-w-0 truncate text-sm font-medium leading-5">
                                      {entry.title || emptyValueText}
                                    </div>
                                    {!isCollapsed && (
                                      <>
                                        <Badge variant={entry.enabled ? "secondary" : "outline"}>
                                          {entry.enabled ? "启用" : "停用"}
                                        </Badge>
                                        {entry.alwaysOn && <Badge variant="outline">常驻</Badge>}
                                      </>
                                    )}
                                  </div>
                                  {!isCollapsed && (
                                    <>
                                      <div className="mt-2 flex flex-wrap gap-1">
                                        {entry.keywords.length > 0 ? (
                                          entry.keywords.map((keyword) => (
                                            <span
                                              key={keyword}
                                              className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground"
                                            >
                                              {keyword}
                                            </span>
                                          ))
                                        ) : (
                                          <span className="text-xs text-muted-foreground">
                                            无关键词
                                          </span>
                                        )}
                                      </div>
                                      <div className="mt-2 whitespace-pre-wrap text-sm leading-6 text-muted-foreground">
                                        {entry.content || emptyValueText}
                                      </div>
                                    </>
                                  )}
                                </div>
                                <Button
                                  type="button"
                                  size="icon-sm"
                                  variant="ghost"
                                  title="编辑世界书"
                                  aria-label="编辑世界书"
                                  onClick={() => openLoreContentEditor(entry)}
                                >
                                  <Pencil className="size-4" />
                                </Button>
                                <Button
                                  type="button"
                                  size="icon-sm"
                                  variant="ghost"
                                  title="删除世界书"
                                  aria-label="删除世界书"
                                  onClick={() => {
                                    const entryLabel = entry.title.trim() || "未命名世界书";
                                    requestDangerAction({
                                      title: "删除世界书",
                                      description: `删除世界书「${entryLabel}」？`,
                                      secondDescription:
                                        "再次确认删除世界书？保存后它会从当前酒馆的设定资料中移除。",
                                      confirmLabel: "删除世界书",
                                      onConfirm: () =>
                                        patchEditingRoomDraft({
                                          lorebookEntries: editingRoom.lorebookEntries.filter(
                                            (item) => item.id !== entry.id,
                                          ),
                                        }),
                                    });
                                  }}
                                >
                                  <Trash2 className="size-4" />
                                </Button>
                              </div>
                            </div>
                          </li>
                        );
                      })}
                      {editingRoom.lorebookEntries.length === 0 && (
                        <li className="rounded-md bg-muted/15 px-3 py-4 text-center text-sm text-muted-foreground">
                          暂无世界书。
                        </li>
                      )}
                    </ol>
                  </TavernEditorSection>
              </div>
            </ScrollArea>

            <div className="flex shrink-0 justify-end gap-2 border-t bg-popover px-5 py-4 lg:px-7">
              <Button
                type="button"
                variant="outline"
                onClick={closeRoomEditor}
              >
                取消
              </Button>
              <Button
                type="button"
                onClick={saveRoomEditor}
              >
                保存
              </Button>
            </div>
          </div>
        )}

        <Dialog
          open={Boolean(editingRoom && roomContentEditDraft)}
          onOpenChange={(open) => {
            if (!open) {
              closeRoomContentEditor();
            }
          }}
        >
          {editingRoom && roomContentEditDraft && (
            <DialogContent
              className={cn(
                "flex max-h-[calc(100vh-2rem)] flex-col overflow-hidden",
                roomContentEditDraft.type === "narrative" || roomContentEditDraft.type === "progress"
                  ? "sm:max-w-3xl lg:max-w-4xl"
                  : "sm:max-w-xl",
              )}
            >
              <DialogHeader>
                <DialogTitle>{getRoomContentEditDialogTitle()}</DialogTitle>
                <DialogDescription>
                  {getRoomContentEditDialogDescription()}
                </DialogDescription>
              </DialogHeader>

              <form
                className="flex min-h-0 flex-1 flex-col"
                onSubmit={(event) => {
                  event.preventDefault();
                  saveRoomContentEditor();
                }}
              >
                <div className="min-h-0 flex-1 overflow-y-auto pr-1">
                  <div className="space-y-3">
                    {renderRoomContentEditFields()}
                  </div>

                  {roomContentEditError && (
                    <div className="mt-3 rounded-md border border-destructive/25 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                      {roomContentEditError}
                    </div>
                  )}
                </div>

                <DialogFooter className="mt-4 shrink-0 border-t pt-4">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={closeRoomContentEditor}
                  >
                    取消
                  </Button>
                  <Button type="submit">
                    保存修改
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          )}
        </Dialog>

      <TavernCharacterFormDialog
        open={isCreatingRoomCharacter || Boolean(editingCharacter)}
        character={editingCharacter}
        roomModelLabel={editingRoomModelLabel}
        onOpenChange={(open) => {
          if (!open) {
            setIsCreatingRoomCharacter(false);
            setEditingCharacterId(null);
          }
        }}
        onSubmit={(value) => {
          if (isCreatingRoomCharacter) {
            createRoomLocalCharacter(value);
            return;
          }

          if (editingCharacter) {
            updateRoomLocalCharacter(editingCharacter.id, value);
          }
        }}
      />
    </div>
  );
};
