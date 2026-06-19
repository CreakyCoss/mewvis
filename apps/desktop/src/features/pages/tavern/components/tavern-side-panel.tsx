import { useState } from "react";
import {
  BookOpen,
  Check,
  ChevronRight,
  Clock,
  Eye,
  EyeOff,
  Loader2,
  MessageSquare,
  RefreshCcw,
  Save,
  ShieldCheck,
  Sparkles,
  Trash2,
  UsersRound,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { VisualPresetDefinition } from "@/features/pages/tavern/visual-presets";
import { cn } from "@/lib/utils";
import {
  filterTavernFactEventsForAudience,
  resolveTavernInformationView,
  type TavernInformationView,
} from "../core";
import type {
  TavernAssetDraft,
  TavernCharacter,
  TavernFactEvent,
  TavernReplyMode,
  TavernRoom,
} from "../types";
import { CharacterButton } from "./character-button";
import { TavernProgressPanel } from "./tavern-progress-panel";

type TavernSidePanelProps = {
  activeRoom: TavernRoom;
  visualPreset: VisualPresetDefinition;
  activeCharacter: TavernCharacter | null;
  roomCharacters: TavernCharacter[];
  isSending: boolean;
  isExtractingAssets: boolean;
  isTrackingProgress: boolean;
  onPatchRoom: (roomId: string, patch: Partial<TavernRoom>) => void;
  onApplyAssetDraft: (draftId: string) => void;
  onDeleteAssetDraft: (draftId: string) => void;
  onExtractRecentAssets: () => void;
  onTrackRecentProgress: () => void;
  onRebuildProgress: () => void;
  onResolvePendingStatusEvent: (statusEventId: string, resolution: "applied" | "rejected") => void;
  onClearIllustrationHints: () => void;
  onCompactCharacterKnowledge: (characterId: string) => void;
  compactingCharacterIds?: Set<string>;
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

const compactText = (value: string | undefined) => value?.trim() || emptyValueText;

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

const TextBlock = ({
  label,
  value,
}: {
  label: string;
  value: string | undefined;
}) => (
  <div className="space-y-1.5">
    <div className="text-xs font-medium text-current opacity-70">{label}</div>
    <div className="max-h-40 overflow-y-auto whitespace-pre-wrap rounded-md border border-current/10 bg-current/5 px-3 py-2 text-sm leading-6 text-current shadow-sm">
      {compactText(value)}
    </div>
  </div>
);

const TooltipField = ({
  label,
  value,
}: {
  label: string;
  value: string | undefined;
}) => (
  <div className="space-y-1">
    <div className="text-[11px] font-medium text-current opacity-65">{label}</div>
    <div className="whitespace-pre-wrap text-xs leading-5 text-current">
      {compactText(value)}
    </div>
  </div>
);

const CharacterProfileTooltip = ({
  character,
  memory,
}: {
  character: TavernCharacter;
  memory: string;
}) => (
  <HoverCardContent
    side="left"
    align="start"
    sideOffset={8}
    className="w-80 max-w-80 space-y-3 p-3 text-left"
  >
    <div>
      <div className="text-sm font-semibold text-popover-foreground">{character.name}</div>
    </div>
    <TooltipField label="角色设定" value={character.description} />
    <TooltipField label="说话方式" value={character.speakingStyle} />
    {character.goals?.trim() && (
      <TooltipField label="目标" value={character.goals} />
    )}
    {character.relationships?.trim() && (
      <TooltipField label="关系" value={character.relationships} />
    )}
    <TooltipField label="角色记忆" value={memory} />
  </HoverCardContent>
);

type DetailPanelKey =
  | "asset-drafts"
  | "timeline"
  | "lorebook"
  | "illustration-hints"
  | "script-review"
  | "private-intel"
  | "tips";

const DetailEntry = ({
  icon: Icon,
  title,
  summary,
  onClick,
}: {
  icon: typeof Sparkles;
  title: string;
  summary: string;
  onClick: () => void;
}) => (
  <button
    type="button"
    className="flex w-full min-w-0 items-center gap-2 rounded-md border border-current/10 bg-current/5 px-3 py-2 text-left text-current transition-colors hover:bg-current/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    onClick={onClick}
  >
    <Icon className="size-4 shrink-0 text-primary" />
    <span className="min-w-0 flex-1">
      <span className="block truncate text-sm font-medium">{title}</span>
      <span className="mt-0.5 block truncate text-xs opacity-65">{summary}</span>
    </span>
    <ChevronRight className="size-4 shrink-0 opacity-60" />
  </button>
);

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

export const TavernSidePanel = ({
  activeRoom,
  visualPreset,
  activeCharacter,
  roomCharacters,
  isSending,
  isExtractingAssets,
  isTrackingProgress,
  onPatchRoom,
  onApplyAssetDraft,
  onDeleteAssetDraft,
  onExtractRecentAssets,
  onTrackRecentProgress,
  onRebuildProgress,
  onResolvePendingStatusEvent,
  onClearIllustrationHints,
  onCompactCharacterKnowledge,
  compactingCharacterIds = new Set(),
}: TavernSidePanelProps) => {
  const [detailPanel, setDetailPanel] = useState<DetailPanelKey | null>(null);
  const isBusy = isSending || isExtractingAssets || isTrackingProgress;
  const userPersonaName = activeRoom.userPersonaName.trim();
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
      return visibility !== "hidden" && visibility !== "debug" && visibility !== "director";
    })
    .slice(-6);
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
  const patchInformationView = (view: TavernInformationView) => {
    onPatchRoom(activeRoom.id, {
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
    onPatchRoom(activeRoom.id, {
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
  const shouldShowIllustrationHints =
    activeRoom.settings.illustrationHints.enabled || recentIllustrationHints.length > 0;
  const detailPanelTitle = {
    "asset-drafts": "剧情资产草稿",
    timeline: "剧情时间线",
    lorebook: "世界书",
    "illustration-hints": "插图提示",
    "script-review": "剧本视角",
    "private-intel": "我的情报",
    tips: "现场提示",
  }[detailPanel ?? "tips"];
  const detailPanelDescription = {
    "asset-drafts": "确认或忽略系统整理出的剧情资产。",
    timeline: "查看已沉淀的剧情事件。",
    lorebook: "查看当前房间可引用的世界设定。",
    "illustration-hints": "查看导演为当前场景生成的公开画面提示。",
    "script-review": "切换公开、复盘和导演视角，管理可揭示事实。",
    "private-intel": "汇总当前用户可知但不公开进入聊天正文的事实。",
    tips: "查看酒馆现场的使用提醒。",
  }[detailPanel ?? "tips"];

  return (
    <aside
      className={cn(
        "hidden min-h-0 flex-col border-l lg:flex",
        visualPreset.tavern.sidePanel,
      )}
    >
      <ScrollArea className="min-h-0 flex-1">
        <div className="space-y-5 p-4">
          <section className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <Sparkles className="size-4 text-primary" />
                场景概览
              </div>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      className="inline-flex h-6 shrink-0 items-center rounded-md border border-current/10 bg-current/5 px-2 text-xs font-medium text-current opacity-80 transition-colors hover:bg-current/10 hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      对话设置
                    </button>
                  </TooltipTrigger>
                  <TooltipContent
                    side="right"
                    align="start"
                    sideOffset={8}
                    className="block max-w-72 whitespace-normal px-3 py-2 text-left leading-5"
                  >
                    <div className="space-y-1">
                      {sceneStatusItems.map((item) => (
                        <div key={item}>{item}</div>
                      ))}
                    </div>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
            <div className="flex items-center justify-between gap-3 rounded-md border border-current/10 bg-current/5 px-3 py-2.5 text-current">
              <div className="min-w-0">
                <div className="truncate text-sm font-medium">沉浸描写</div>
                <div className="mt-0.5 text-xs leading-5 opacity-65">
                  动作、神态、感官与环境互动
                </div>
              </div>
              <Switch
                size="sm"
                checked={activeRoom.settings.immersiveDescriptionEnabled}
                disabled={isSending}
                aria-label="切换沉浸描写"
                onCheckedChange={(checked) => onPatchRoom(activeRoom.id, {
                  settings: {
                    ...activeRoom.settings,
                    immersiveDescriptionEnabled: checked,
                  },
                })}
              />
            </div>
            <TextBlock label="场景描述" value={activeRoom.scene} />
            <TextBlock label="场景目标" value={activeRoom.sceneGoal} />
            <TextBlock label="房间记忆" value={activeRoom.memory} />
            {identityFactEvents.length > 0 && (
              <div className="space-y-2 rounded-md border border-primary/20 bg-primary/10 p-3 text-current">
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <ShieldCheck className="size-4 text-primary" />
                  我的身份
                </div>
                {identityFactEvents.slice(0, 3).map((event) => (
                  <div key={event.id} className="rounded-md bg-background/40 px-3 py-2 text-xs leading-5">
                    <div className="mb-1 flex flex-wrap items-center gap-1.5">
                      <span className="rounded-[4px] bg-current/10 px-1.5 py-0.5 text-[10px] leading-none opacity-70">
                        {formatFactType(event.type)}
                      </span>
                      <span className="rounded-[4px] bg-current/10 px-1.5 py-0.5 text-[10px] leading-none opacity-70">
                        仅你可见
                      </span>
                    </div>
                    <div className="line-clamp-3 whitespace-pre-wrap opacity-85">{event.evidence}</div>
                  </div>
                ))}
              </div>
            )}
            <div className="grid grid-cols-2 gap-2">
              <Button
                type="button"
                size="xs"
                variant="outline"
                className="border-current/20 bg-current/5 text-current hover:bg-current/10 hover:text-current disabled:opacity-50"
                disabled={isBusy}
                onClick={onTrackRecentProgress}
              >
                {isTrackingProgress ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <Sparkles className="size-3.5" />
                )}
                更新状态
              </Button>
              <Button
                type="button"
                size="xs"
                variant="outline"
                className="border-current/20 bg-current/5 text-current hover:bg-current/10 hover:text-current disabled:opacity-50"
                disabled={isBusy}
                onClick={onRebuildProgress}
              >
                <RefreshCcw className="size-3.5" />
                重建状态
              </Button>
            </div>
            {pendingStatusEvents.length > 0 && (
              <div className="space-y-2 rounded-md border border-current/10 bg-current/5 p-2.5 text-current">
                <div className="text-xs font-semibold opacity-80">待确认状态</div>
                {pendingStatusEvents.map((event) => {
                  const definition = statusDefinitionById.get(event.statusId);
                  const before = Array.isArray(event.before) ? event.before.join("、") : String(event.before ?? "未记录");
                  const after = Array.isArray(event.after) ? event.after.join("、") : String(event.after ?? "未记录");
                  return (
                    <div key={event.id} className="space-y-2 rounded-md bg-current/5 px-2.5 py-2">
                      <div className="flex min-w-0 items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="truncate text-xs font-medium">
                            {definition?.label ?? event.statusId}
                          </div>
                          <div className="mt-0.5 text-[11px] tabular-nums opacity-70">
                            {before}{" -> "}{after}
                            {typeof event.delta === "number" && (
                              <span className={event.delta > 0 ? "ml-1 text-emerald-500" : "ml-1 text-destructive"}>
                                {event.delta > 0 ? "+" : ""}{event.delta}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="shrink-0 text-[11px] opacity-60">
                          {Math.round(event.confidence * 100)}%
                        </div>
                      </div>
                      <div className="line-clamp-2 text-[11px] leading-4 opacity-65">
                        {event.reason}
                      </div>
                      <div className="grid grid-cols-2 gap-1.5">
                        <Button
                          type="button"
                          size="xs"
                          variant="outline"
                          className="border-current/20 bg-current/5 text-current hover:bg-current/10 hover:text-current disabled:opacity-50"
                          disabled={isBusy}
                          onClick={() => onResolvePendingStatusEvent(event.id, "applied")}
                        >
                          <Check className="size-3.5" />
                          应用
                        </Button>
                        <Button
                          type="button"
                          size="xs"
                          variant="ghost"
                          className="text-current hover:bg-current/10 hover:text-current disabled:opacity-50"
                          disabled={isBusy}
                          onClick={() => onResolvePendingStatusEvent(event.id, "rejected")}
                        >
                          <X className="size-3.5" />
                          拒绝
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            <TavernProgressPanel
              activeRoom={activeRoom}
              roomCharacters={roomCharacters}
              activeCharacter={activeCharacter}
              placement="sidePanel"
            />
          </section>

          {shouldShowIllustrationHints && (
            <section className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-sm font-semibold">
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
                      className="rounded-md border border-current/10 bg-current/5 px-3 py-2 text-xs leading-5 text-current"
                    >
                      {hint.prompt}
                    </div>
                  ))
                ) : (
                  <div className="rounded-md border border-current/10 bg-current/5 px-3 py-4 text-center text-sm text-current opacity-70">
                    本场景还没有生成插图提示。
                  </div>
                )}
              </div>
            </section>
          )}

          <section className="space-y-3">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <UsersRound className="size-4 text-primary" />
              入席角色
            </div>
            <div className="space-y-2">
              {roomCharacters.map((character) => {
                const isCompacting = compactingCharacterIds.has(character.id);
                return (
                  <div key={character.id} className="space-y-2">
                    <div className="flex items-center gap-2">
                      <HoverCard openDelay={120} closeDelay={120}>
                        <HoverCardTrigger asChild>
                          <div className="min-w-0 flex-1">
                            <CharacterButton
                              character={character}
                              isActive={character.id === activeCharacter?.id}
                              disabled={isSending}
                              onClick={() => onPatchRoom(activeRoom.id, { activeCharacterId: character.id })}
                            />
                          </div>
                        </HoverCardTrigger>
                        <CharacterProfileTooltip
                          character={character}
                          memory={activeRoom.characterMemories[character.id] ?? ""}
                        />
                      </HoverCard>
                      <Button
                        type="button"
                        size="icon-sm"
                        variant="outline"
                        className="shrink-0 border-current/20 bg-current/5 text-current hover:bg-current/10 hover:text-current disabled:opacity-50"
                        title="压缩角色知识"
                        aria-label={`压缩${character.name}的角色知识`}
                        disabled={isBusy || isCompacting}
                        onClick={() => onCompactCharacterKnowledge(character.id)}
                      >
                        {isCompacting ? (
                          <Loader2 className="size-3.5 animate-spin" />
                        ) : (
                          <RefreshCcw className="size-3.5" />
                        )}
                      </Button>
                    </div>
                    <TavernProgressPanel
                      activeRoom={activeRoom}
                      roomCharacters={roomCharacters}
                      activeCharacter={activeCharacter}
                      ownerCharacter={character}
                      placement="characterCard"
                      className="pl-1"
                    />
                  </div>
                );
              })}
              {roomCharacters.length === 0 && (
                <div className="rounded-md border border-current/10 bg-current/5 px-3 py-4 text-center text-sm text-current opacity-70">
                  还没有角色入席。
                </div>
              )}
            </div>
          </section>

          <section className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <BookOpen className="size-4 text-primary" />
                剧情资料
              </div>
              <Button
                type="button"
                size="xs"
                variant="outline"
                className="border-current/20 bg-current/5 text-current hover:bg-current/10 hover:text-current disabled:opacity-50"
                disabled={isBusy}
                onClick={onExtractRecentAssets}
              >
                {isExtractingAssets ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <Sparkles className="size-3.5" />
                )}
                整理最近
              </Button>
            </div>
            <div className="space-y-2">
              <DetailEntry
                icon={Sparkles}
                title="剧情资产草稿"
                summary={
                  activeRoom.assetDrafts.length > 0
                    ? `${activeRoom.assetDrafts.length} 个待确认草稿`
                    : "暂无待确认草稿"
                }
                onClick={() => setDetailPanel("asset-drafts")}
              />
              <DetailEntry
                icon={Clock}
                title="剧情时间线"
                summary={
                  activeRoom.timelineEvents.length > 0
                    ? `${activeRoom.timelineEvents.length} 个剧情事件`
                    : "暂无剧情事件"
                }
                onClick={() => setDetailPanel("timeline")}
              />
              <DetailEntry
                icon={BookOpen}
                title="世界书"
                summary={
                  activeRoom.lorebookEntries.length > 0
                    ? `${activeRoom.lorebookEntries.length} 条设定，${enabledLorebookCount} 条启用`
                    : "暂无世界书"
                }
                onClick={() => setDetailPanel("lorebook")}
              />
              <DetailEntry
                icon={Sparkles}
                title="插图提示"
                summary={
                  activeRoom.illustrationHints.length > 0
                    ? `${activeRoom.illustrationHints.length} 条画面提示`
                    : activeRoom.settings.illustrationHints.enabled ? "等待导演生成" : "未开启"
                }
                onClick={() => setDetailPanel("illustration-hints")}
              />
              <DetailEntry
                icon={ShieldCheck}
                title="剧本视角"
                summary={`${informationViewLabels[currentInformationView]}，${reviewHiddenFactCount}/${hiddenFactCount} 条隐藏事实可见`}
                onClick={() => setDetailPanel("script-review")}
              />
              <DetailEntry
                icon={MessageSquare}
                title="我的情报"
                summary={
                  privateIntelEvents.length > 0
                    ? `${privateIntelEvents.length} 条事实${identityFactEvents.length > 0 ? `，${identityFactEvents.length} 条身份/阵营` : ""}`
                    : "暂无仅你可知事实"
                }
                onClick={() => setDetailPanel("private-intel")}
              />
              <DetailEntry
                icon={MessageSquare}
                title="现场提示"
                summary="内页只保留现场信息，更多配置在首页编辑"
                onClick={() => setDetailPanel("tips")}
              />
            </div>
          </section>
        </div>
      </ScrollArea>
      <Sheet
        open={detailPanel !== null}
        onOpenChange={(open) => {
          if (!open) {
            setDetailPanel(null);
          }
        }}
      >
        <SheetContent
          side="right"
          className="!w-[92vw] !max-w-[92vw] gap-0 p-0 sm:!w-[480px] sm:!max-w-[480px]"
        >
          <SheetHeader className="border-b px-5 py-4 pr-14">
            <SheetTitle>{detailPanelTitle}</SheetTitle>
            <SheetDescription>{detailPanelDescription}</SheetDescription>
          </SheetHeader>
          <ScrollArea className="min-h-0 flex-1">
            <div className="space-y-4 p-5">
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
                        onApply={() => onApplyAssetDraft(draft.id)}
                        onDelete={() => onDeleteAssetDraft(draft.id)}
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
                      onClick={onClearIllustrationHints}
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
                <div className="space-y-3">
                  <div className="rounded-md border bg-background/60 px-4 py-3 text-sm leading-6 text-muted-foreground">
                    更多配置都在首页编辑，内页只保留对话现场需要查看的信息。
                  </div>
                  <div className="rounded-md border bg-background/60 px-4 py-3 text-sm leading-6 text-muted-foreground">
                    剧情时间线和世界书是酒馆共享资产；入席角色、场景设定和阶段记忆在对应故事场景中维护。
                  </div>
                </div>
              )}
            </div>
          </ScrollArea>
        </SheetContent>
      </Sheet>
    </aside>
  );
};
