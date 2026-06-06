import { useState } from "react";
import {
  BookOpen,
  ChevronRight,
  Clock,
  Loader2,
  MessageSquare,
  Save,
  Sparkles,
  Trash2,
  UsersRound,
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
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { VisualPresetDefinition } from "@/features/visual-presets";
import { cn } from "@/lib/utils";
import type {
  TavernAssetDraft,
  TavernCharacter,
  TavernReplyMode,
  TavernRoom,
} from "../types";
import { CharacterButton } from "./character-button";

type TavernSidePanelProps = {
  activeRoom: TavernRoom;
  visualPreset: VisualPresetDefinition;
  activeCharacter: TavernCharacter | null;
  roomCharacters: TavernCharacter[];
  isSending: boolean;
  isExtractingAssets: boolean;
  onPatchRoom: (roomId: string, patch: Partial<TavernRoom>) => void;
  onApplyAssetDraft: (draftId: string) => void;
  onDeleteAssetDraft: (draftId: string) => void;
  onExtractRecentAssets: () => void;
};

const replyModeDescriptions: Record<TavernReplyMode, string> = {
  active: "仅当前选中的角色发言",
  round: "所有入席角色依次发言",
  director: "由导演选择合适角色发言",
};

const emptyValueText = "未设置";

const compactText = (value: string | undefined) => value?.trim() || emptyValueText;

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

type DetailPanelKey = "asset-drafts" | "timeline" | "lorebook" | "tips";

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
  onPatchRoom,
  onApplyAssetDraft,
  onDeleteAssetDraft,
  onExtractRecentAssets,
}: TavernSidePanelProps) => {
  const [detailPanel, setDetailPanel] = useState<DetailPanelKey | null>(null);
  const isBusy = isSending || isExtractingAssets;
  const userPersonaName = activeRoom.userPersonaName.trim();
  const sceneStatusItems = [
    `回复方式：${replyModeDescriptions[activeRoom.replyMode ?? "active"]}`,
    userPersonaName && userPersonaName !== "我" ? `你的称呼：${userPersonaName}` : "",
    `生成过程：${activeRoom.settings.showExecutionTrace ? "显示" : "隐藏"}`,
    `自动整理记忆：${activeRoom.settings.autoAssetExtractionEnabled ? "开启" : "关闭"}`,
  ].filter(Boolean);
  const enabledLorebookCount = activeRoom.lorebookEntries.filter((entry) => entry.enabled).length;
  const detailPanelTitle = {
    "asset-drafts": "剧情资产草稿",
    timeline: "剧情时间线",
    lorebook: "世界书",
    tips: "现场提示",
  }[detailPanel ?? "tips"];
  const detailPanelDescription = {
    "asset-drafts": "确认或忽略系统整理出的剧情资产。",
    timeline: "查看已沉淀的剧情事件。",
    lorebook: "查看当前房间可引用的世界设定。",
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
            <TextBlock label="场景描述" value={activeRoom.scene} />
            <TextBlock label="场景目标" value={activeRoom.sceneGoal} />
            <TextBlock label="房间记忆" value={activeRoom.memory} />
            {activeRoom.autoMemory.trim() && (
              <TextBlock label="自动记忆" value={activeRoom.autoMemory} />
            )}
          </section>

          <section className="space-y-3">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <UsersRound className="size-4 text-primary" />
              入席角色
            </div>
            <div className="space-y-2">
              {roomCharacters.map((character) => (
                <HoverCard key={character.id} openDelay={120} closeDelay={120}>
                  <HoverCardTrigger asChild>
                    <CharacterButton
                      character={character}
                      isActive={character.id === activeCharacter?.id}
                      disabled={isSending}
                      onClick={() => onPatchRoom(activeRoom.id, { activeCharacterId: character.id })}
                    />
                  </HoverCardTrigger>
                  <CharacterProfileTooltip
                    character={character}
                    memory={activeRoom.characterMemories[character.id] ?? ""}
                  />
                </HoverCard>
              ))}
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

              {detailPanel === "tips" && (
                <div className="space-y-3">
                  <div className="rounded-md border bg-background/60 px-4 py-3 text-sm leading-6 text-muted-foreground">
                    更多配置都在首页编辑，内页只保留对话现场需要查看的信息。
                  </div>
                  <div className="rounded-md border bg-background/60 px-4 py-3 text-sm leading-6 text-muted-foreground">
                    入席角色、场景设定、剧情时间线、世界书和记忆整理策略，都可以回到酒馆首页的编辑弹窗中统一维护。
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
