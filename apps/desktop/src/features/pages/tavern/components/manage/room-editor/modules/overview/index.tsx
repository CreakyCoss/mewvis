import {
  BookOpen,
  Clapperboard,
  Clock,
  FileText,
  Link2,
  MessageSquareText,
  Pencil,
  Route,
  Target,
  UsersRound,
  Wine,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { resolveAgentAvatar } from "@/assets/agent-avatars";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { getTavernPromptStylePreset } from "../../../../../prompt-styles";
import { getActiveTavernScene } from "../../../../../storage";
import type {
  TavernCharacter,
  TavernRoom,
  TavernScene,
} from "../../../../../types";
import {
  emptyValueText,
  formatCount,
  getRoomCharacterById,
  getRoomCharacters,
  getTimelineScopeSummary,
} from "../../utils";
import { BasicSummaryContent } from "../basic/summary";
import { editorHeaderActionButtonClassName } from "../../primitives";

type OverviewTargetModuleId =
  | "basic"
  | "characters"
  | "scenes"
  | "timeline"
  | "lore"
  | "settings"
  | "progress";

type OverviewSectionProps = {
  data: TavernRoom;
  characterById: Map<string, TavernCharacter>;
  onOpenModule: (moduleId: OverviewTargetModuleId) => void;
};

const getPreviewText = (value: string, fallback = emptyValueText) =>
  value.trim() || fallback;

const OverviewCard = ({
  icon: Icon,
  title,
  meta,
  metaClassName,
  actionLabel,
  onAction,
  children,
  className,
  contentClassName,
}: {
  icon: LucideIcon;
  title: string;
  meta?: string;
  metaClassName?: string;
  actionLabel?: string;
  onAction?: () => void;
  children: ReactNode;
  className?: string;
  contentClassName?: string;
}) => (
  <section
    className={cn(
      "overflow-hidden rounded-xl border bg-card shadow-sm",
      className,
    )}
  >
    <div className="flex items-center justify-between gap-3 border-b bg-background/70 px-4 py-3">
      <div className="flex min-w-0 items-center gap-2.5">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
          <Icon className="size-4" />
        </span>
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <h2 className="truncate text-base font-semibold leading-6">{title}</h2>
          {meta && (
            <Badge
              variant="secondary"
              className={cn(
                "bg-muted text-muted-foreground",
                metaClassName,
              )}
            >
              {meta}
            </Badge>
          )}
        </div>
      </div>
      {actionLabel && onAction && (
        <Button
          type="button"
          size="sm"
          variant="outline"
          className={editorHeaderActionButtonClassName}
          onClick={onAction}
        >
          <Pencil className="size-3.5" />
          {actionLabel}
        </Button>
      )}
    </div>
    <div className={cn("p-4", contentClassName)}>
      {children}
    </div>
  </section>
);

const EmptyPreview = ({
  icon: Icon,
  title,
  description,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
}) => (
  <div className="flex min-h-36 flex-col items-center justify-center rounded-lg bg-muted/10 px-5 py-8 text-center">
    <span className="flex size-16 items-center justify-center rounded-full bg-primary/10 text-primary/75">
      <Icon className="size-8" />
    </span>
    <div className="mt-4 text-base font-semibold leading-6">{title}</div>
    <p className="mt-1 max-w-sm text-sm leading-6 text-muted-foreground">
      {description}
    </p>
  </div>
);

const SummaryLine = ({
  icon: Icon,
  label,
  value,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
}) => (
  <div className="grid min-w-0 grid-cols-[auto_7rem_minmax(0,1fr)] items-center gap-2 rounded-md bg-background/80 px-3 py-2 shadow-xs">
    <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
      <Icon className="size-3.5" />
    </span>
    <span className="whitespace-nowrap text-xs font-medium leading-6 text-foreground/75">
      {label}
    </span>
    <span
      className="block min-w-0 truncate whitespace-nowrap text-sm leading-6 text-muted-foreground"
      title={value}
    >
      {value}
    </span>
  </div>
);

const renderSceneCharacters = (
  scene: TavernScene | null,
  roomCharacterById: Map<string, TavernCharacter>,
) => (scene?.characterIds ?? [])
  .map((characterId) => roomCharacterById.get(characterId))
  .filter((character): character is TavernCharacter => Boolean(character));

export const OverviewSection = ({
  data,
  characterById,
  onOpenModule,
}: OverviewSectionProps) => {
  const roomCharacterById = getRoomCharacterById(data, characterById);
  const roomCharacters = getRoomCharacters(data, roomCharacterById);
  const activeScene = getActiveTavernScene(data);
  const activeSceneCharacters = renderSceneCharacters(activeScene, roomCharacterById);
  const scenes = data.scenes ?? [];
  const timelineEvent = data.timelineEvents[0] ?? null;
  const lorebookEntry = data.lorebookEntries[0] ?? null;
  const promptStyle = getTavernPromptStylePreset(data.promptStyleId);

  return (
    <div className="space-y-4">
      <div className="space-y-1 px-0.5">
        <h2 className="text-lg font-semibold leading-7">故事资源总览</h2>
        <p className="text-sm leading-6 text-muted-foreground">
          集中查看角色、剧情、世界设定与场景阶段，快速判断这个酒馆是否已经可开局。
        </p>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(22rem,0.9fr)_minmax(0,1.35fr)]">
        <OverviewCard
          icon={Wine}
          title="基础信息"
          meta={promptStyle.label}
          metaClassName="border border-primary/15 bg-primary/10 text-primary dark:border-primary/20 dark:bg-primary/15"
          actionLabel="编辑"
          onAction={() => onOpenModule("basic")}
          className="xl:col-span-2"
          contentClassName="p-4"
        >
          <BasicSummaryContent data={data} />
        </OverviewCard>

        <OverviewCard
          icon={UsersRound}
          title="酒馆角色库"
          meta={formatCount(roomCharacters.length, "角色")}
          actionLabel="管理角色"
          onAction={() => onOpenModule("characters")}
        >
          {roomCharacters.length > 0 ? (
            <div className="grid gap-2 sm:grid-cols-2">
              {roomCharacters.slice(0, 4).map((character) => (
                <div
                  key={character.id}
                  className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] gap-3 rounded-lg border bg-background/70 p-2.5"
                >
                  <img
                    src={resolveAgentAvatar(character.avatar).src}
                    alt=""
                    className="size-14 rounded-md border bg-muted object-cover"
                  />
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold leading-5">
                      {character.name || emptyValueText}
                    </div>
                    <div className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">
                      {character.speakingStyle || character.description || emptyValueText}
                    </div>
                  </div>
                </div>
              ))}
              {roomCharacters.length > 4 && (
                <div className="flex min-h-20 items-center justify-center rounded-lg border border-dashed bg-muted/10 text-sm text-muted-foreground">
                  还有 {roomCharacters.length - 4} 个角色
                </div>
              )}
            </div>
          ) : (
            <EmptyPreview
              icon={UsersRound}
              title="暂无角色"
              description="角色决定酒馆对话的主要张力，建议先补充至少一位角色。"
            />
          )}
        </OverviewCard>

        <OverviewCard
          icon={Clock}
          title="剧情时间线"
          meta={formatCount(data.timelineEvents.length, "事件")}
          actionLabel="管理事件"
          onAction={() => onOpenModule("timeline")}
        >
          {timelineEvent ? (
            <div className="grid min-h-36 grid-cols-[auto_minmax(0,1fr)] items-center gap-4 rounded-lg bg-muted/10 px-5 py-5">
              <span className="flex size-16 items-center justify-center rounded-full bg-primary/10 text-primary">
                <Clock className="size-8" />
              </span>
              <div className="min-w-0">
                <div className="truncate text-base font-semibold leading-6">
                  {timelineEvent.title || emptyValueText}
                </div>
                <div className="mt-1 line-clamp-3 text-sm leading-6 text-muted-foreground">
                  {timelineEvent.summary || emptyValueText}
                </div>
              </div>
            </div>
          ) : (
            <EmptyPreview
              icon={Clock}
              title="暂无剧情事件"
              description="沉淀已经确定发生过的关键事件，方便后续场景连续推进。"
            />
          )}
        </OverviewCard>

        <OverviewCard
          icon={BookOpen}
          title="世界书"
          meta={formatCount(data.lorebookEntries.length, "条")}
          actionLabel="管理世界书"
          onAction={() => onOpenModule("lore")}
        >
          {lorebookEntry ? (
            <div className="grid min-h-56 place-items-center rounded-lg bg-muted/10 px-5 py-8 text-center">
              <div className="max-w-md">
                <span className="mx-auto flex size-16 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <BookOpen className="size-8" />
                </span>
                <div className="mt-4 truncate text-base font-semibold leading-6">
                  {lorebookEntry.title || emptyValueText}
                </div>
                <div className="mt-2 line-clamp-3 text-sm leading-6 text-muted-foreground">
                  {lorebookEntry.content || emptyValueText}
                </div>
                <div className="mt-3 flex flex-wrap justify-center gap-1">
                  {lorebookEntry.enabled && <Badge variant="secondary">启用</Badge>}
                  {lorebookEntry.alwaysOn && <Badge variant="outline">常驻</Badge>}
                  {lorebookEntry.keywords.slice(0, 3).map((keyword) => (
                    <Badge key={keyword} variant="outline">
                      {keyword}
                    </Badge>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <EmptyPreview
              icon={BookOpen}
              title="暂无世界书"
              description="维护会被关键词触发，或常驻生效的共享设定资料。"
            />
          )}
        </OverviewCard>

        <OverviewCard
          icon={Clapperboard}
          title="故事场景"
          meta={formatCount(scenes.length, "阶段")}
          actionLabel="管理场景"
          onAction={() => onOpenModule("scenes")}
          className="xl:col-span-1"
          contentClassName="p-5"
        >
          {activeScene ? (
            <div className="rounded-xl border border-primary/35 bg-primary/[0.06] p-4 ring-1 ring-primary/10">
              <div className="flex min-w-0 items-start justify-between gap-3">
                <div className="flex min-w-0 items-start gap-3">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-lg border bg-background text-sm font-semibold text-muted-foreground">
                    {(activeScene.order ?? 0) + 1}
                  </span>
                  <div className="min-w-0">
                    <div className="flex min-w-0 flex-wrap items-center gap-2">
                      <h3 className="truncate text-base font-semibold leading-6">
                        {activeScene.title || "默认场景"}
                      </h3>
                      <Badge variant="secondary">默认</Badge>
                    </div>
                    <p className="mt-1 truncate text-sm leading-6 text-muted-foreground">
                      {getPreviewText(activeScene.plot || activeScene.scene)}
                    </p>
                  </div>
                </div>
                <div className="hidden shrink-0 items-center gap-2 rounded-md bg-background/70 px-2.5 py-1.5 md:flex">
                  <div className="flex -space-x-1.5">
                    {activeSceneCharacters.slice(0, 4).map((character) => (
                      <img
                        key={character.id}
                        src={resolveAgentAvatar(character.avatar).src}
                        alt=""
                        className="size-7 rounded-full border bg-muted object-cover"
                      />
                    ))}
                    {activeSceneCharacters.length === 0 && (
                      <span className="flex size-7 items-center justify-center rounded-full border bg-background text-[11px] text-muted-foreground">
                        0
                      </span>
                    )}
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {formatCount(activeSceneCharacters.length, "角色")}
                  </span>
                </div>
              </div>

              <div className="mt-4 grid gap-2">
                <SummaryLine
                  icon={FileText}
                  label="场景描述"
                  value={getPreviewText(activeScene.scene)}
                />
                <SummaryLine
                  icon={Target}
                  label="场景目标"
                  value={getPreviewText(activeScene.sceneGoal)}
                />
                <SummaryLine
                  icon={Route}
                  label="剧情走向"
                  value={getPreviewText(activeScene.storyDirection)}
                />
                <SummaryLine
                  icon={Link2}
                  label="承接关系"
                  value={getPreviewText(activeScene.transition)}
                />
                <SummaryLine
                  icon={MessageSquareText}
                  label="时间线范围"
                  value={getTimelineScopeSummary(activeScene.timelineScope, data.timelineEvents)}
                />
              </div>
            </div>
          ) : (
            <EmptyPreview
              icon={Clapperboard}
              title="暂无故事场景"
              description="故事阶段用于组织可切换的叙事场景，建议至少维护一个默认阶段。"
            />
          )}
        </OverviewCard>
      </div>
    </div>
  );
};
