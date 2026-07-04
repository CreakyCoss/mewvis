import {
  BookOpen,
  Clapperboard,
  FileText,
  GitBranch,
  Pencil,
  ScrollText,
  Target,
  UserRound,
  UsersRound,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { useRef } from "react";
import { resolveAvatar } from "@/assets/avatars";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { StoryJson } from "../../model/types";
import { cn } from "@/lib/utils";
import type { StoryDraft } from "../../../components/story-form-utils";
import { formatCount, manuscriptSourceLabels } from "../../../components/story-form-utils";
import type { StoryConfigTab } from "../types";
import { editorHeaderActionButtonClassName, emptyValueText } from "../../../components/story-primitives";
import { StoryOverviewEdit, type StoryOverviewEditHandle } from "./edit";

type StoryOverviewModuleProps = {
  story: StoryJson;
  onOpenModule: (moduleId: StoryConfigTab) => void;
  onSave: (draft: StoryDraft) => void;
};

const getPreviewText = (value: string, fallback = emptyValueText) => value.trim() || fallback;

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
  <section className={cn("overflow-hidden rounded-xl border bg-card shadow-sm", className)}>
    <div className="flex items-center justify-between gap-3 border-b bg-background/70 px-4 py-3">
      <div className="flex min-w-0 items-center gap-2.5">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
          <Icon className="size-4" />
        </span>
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <h2 className="truncate text-base font-semibold leading-6">{title}</h2>
          {meta ? (
            <Badge variant="secondary" className={cn("bg-muted text-muted-foreground", metaClassName)}>
              {meta}
            </Badge>
          ) : null}
        </div>
      </div>
      {actionLabel && onAction ? (
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
      ) : null}
    </div>
    <div className={cn("p-4", contentClassName)}>{children}</div>
  </section>
);

const EmptyPreview = ({ icon: Icon, title, description }: { icon: LucideIcon; title: string; description: string }) => (
  <div className="flex min-h-36 flex-col items-center justify-center rounded-lg bg-muted/10 px-5 py-8 text-center">
    <span className="flex size-16 items-center justify-center rounded-full bg-primary/10 text-primary/75">
      <Icon className="size-8" />
    </span>
    <div className="mt-4 text-base font-semibold leading-6">{title}</div>
    <p className="mt-1 max-w-sm text-sm leading-6 text-muted-foreground">{description}</p>
  </div>
);

const LongTextCard = ({ icon: Icon, title, value }: { icon: LucideIcon; title: string; value: string }) => {
  const displayValue = getPreviewText(value);

  return (
    <div className="rounded-md border bg-background/75 px-3 py-2.5 shadow-xs">
      <div className="flex min-w-0 items-start gap-2.5">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
          <Icon className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm font-semibold leading-5">{title}</h3>
          <p
            className="mt-1 line-clamp-2 whitespace-pre-wrap text-xs leading-5 text-muted-foreground"
            title={displayValue}
          >
            {displayValue}
          </p>
        </div>
      </div>
    </div>
  );
};

const MetricCard = ({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: string }) => (
  <div className="rounded-md border bg-background/75 px-3 py-2.5 shadow-xs">
    <div className="truncate text-xs font-medium leading-5 text-muted-foreground">{label}</div>
    <div className="mt-3 flex min-w-0 items-center gap-2.5">
      <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
        <Icon className="size-4" />
      </span>
      <div className="min-w-0 truncate text-sm font-semibold leading-5" title={value}>
        {value}
      </div>
    </div>
  </div>
);

export const StoryOverviewModule = ({ story, onOpenModule, onSave }: StoryOverviewModuleProps) => {
  const editRef = useRef<StoryOverviewEditHandle>(null);
  const activeNode =
    story.graph.nodes.find((node) => node.id === story.graph.activeNodeId) ??
    story.graph.nodes.find((node) => node.id === story.graph.entryNodeId) ??
    story.graph.nodes[0] ??
    null;
  const activeScene = activeNode?.sceneId
    ? (story.scenes.find((scene) => scene.id === activeNode.sceneId) ?? null)
    : (story.scenes[0] ?? null);
  const lorebookEntry = story.lorebookEntries[0] ?? null;
  const pendingDrafts = story.manuscriptInbox.drafts.filter((draft) => draft.status === "pending");
  const latestAcceptedDraft = story.manuscriptInbox.accepted[0] ?? null;

  return (
    <>
      <div className="space-y-4">
        <div className="space-y-1 px-0.5">
          <h2 className="text-lg font-semibold leading-7">故事资源总览</h2>
          <p className="text-sm leading-6 text-muted-foreground">
            集中查看故事定位、角色、剧情结构、场景内容和稿件状态，快速判断这个故事是否已经可进入呈现端。
          </p>
        </div>

        <div className="grid gap-4 xl:grid-cols-[minmax(22rem,0.9fr)_minmax(0,1.35fr)]">
          <OverviewCard
            icon={ScrollText}
            title="基础信息"
            meta={story.userPersonaName.trim() || "我"}
            actionLabel="编辑"
            onAction={() => editRef.current?.(story)}
            className="xl:col-span-2"
          >
            <div className="grid gap-3 xl:grid-cols-[minmax(0,0.95fr)_minmax(20rem,1fr)]">
              <div className="grid gap-2">
                <LongTextCard icon={FileText} title="故事定位" value={story.outline} />
                <LongTextCard icon={Target} title="整体目标" value={story.goal} />
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <MetricCard icon={Clapperboard} label="当前场景" value={activeScene?.title ?? emptyValueText} />
                <MetricCard icon={GitBranch} label="当前节点" value={activeNode?.title ?? emptyValueText} />
                <MetricCard icon={UserRound} label="用户称呼" value={story.userPersonaName.trim() || emptyValueText} />
                <MetricCard icon={BookOpen} label="故事场景" value={formatCount(story.scenes.length, "场景")} />
              </div>
            </div>
          </OverviewCard>

          <OverviewCard
            icon={UsersRound}
            title="角色"
            meta={formatCount(story.characters.length, "角色")}
            actionLabel="管理角色"
            onAction={() => onOpenModule("characters")}
          >
            {story.characters.length > 0 ? (
              <div className="grid gap-2 sm:grid-cols-2">
                {story.characters.slice(0, 4).map((character) => {
                  const avatar = resolveAvatar(character.avatar);
                  return (
                    <div
                      key={character.id}
                      className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] gap-3 rounded-lg border bg-background/70 p-2.5"
                    >
                      <span className="flex size-14 items-center justify-center overflow-hidden rounded-md border bg-background">
                        <img src={avatar.src} alt={character.name} className="size-full object-cover" />
                      </span>
                      <div className="min-w-0">
                        <div className="truncate text-sm font-semibold leading-5">
                          {character.name || emptyValueText}
                        </div>
                        <div className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">
                          {character.speakingStyle || character.description || emptyValueText}
                        </div>
                      </div>
                    </div>
                  );
                })}
                {story.characters.length > 4 ? (
                  <div className="flex min-h-20 items-center justify-center rounded-lg border border-dashed bg-muted/10 text-sm text-muted-foreground">
                    还有 {story.characters.length - 4} 个角色
                  </div>
                ) : null}
              </div>
            ) : (
              <EmptyPreview
                icon={UsersRound}
                title="暂无角色"
                description="角色决定故事呈现的主要张力，建议先补充至少一位角色。"
              />
            )}
          </OverviewCard>

          <OverviewCard
            icon={GitBranch}
            title="剧情结构"
            meta={`${formatCount(story.graph.nodes.length, "节点")} · ${formatCount(story.graph.edges.length, "分支")}`}
            actionLabel="管理结构"
            onAction={() => onOpenModule("graph")}
          >
            {activeNode ? (
              <div className="grid min-h-36 grid-cols-[auto_minmax(0,1fr)] items-center gap-4 rounded-lg bg-muted/10 px-5 py-5">
                <span className="flex size-16 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <GitBranch className="size-8" />
                </span>
                <div className="min-w-0">
                  <div className="truncate text-base font-semibold leading-6">{activeNode.title || emptyValueText}</div>
                  <div className="mt-1 line-clamp-3 text-sm leading-6 text-muted-foreground">
                    {activeScene?.scene?.trim() || activeScene?.goal?.trim() || "当前节点的场景内容在场景编辑中维护。"}
                  </div>
                </div>
              </div>
            ) : (
              <EmptyPreview icon={GitBranch} title="暂无剧情节点" description="剧情结构用于组织节点和分支。" />
            )}
          </OverviewCard>

          <OverviewCard
            icon={BookOpen}
            title="世界书"
            meta={formatCount(story.lorebookEntries.length, "条")}
            actionLabel="管理世界书"
            onAction={() => onOpenModule("world")}
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
                    {lorebookEntry.enabled ? <Badge variant="secondary">启用</Badge> : null}
                    {lorebookEntry.alwaysOn ? <Badge variant="outline">常驻</Badge> : null}
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
                description="维护可被关键词触发，或常驻生效的共享设定资料。"
              />
            )}
          </OverviewCard>

          <OverviewCard
            icon={Clapperboard}
            title="故事场景"
            meta={formatCount(story.scenes.length, "场景")}
            actionLabel="管理场景"
            onAction={() => onOpenModule("scenes")}
            contentClassName="p-5"
          >
            {activeScene ? (
              <div className="rounded-xl border border-primary/35 bg-primary/[0.06] p-4 ring-1 ring-primary/10">
                <div className="flex min-w-0 items-start gap-3">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                    <Clapperboard className="size-5" />
                  </span>
                  <div className="min-w-0">
                    <div className="truncate text-base font-semibold leading-6">
                      {activeScene.title || emptyValueText}
                    </div>
                    <div className="mt-2 space-y-1.5 text-sm leading-6 text-muted-foreground">
                      <div className="line-clamp-2">
                        <span className="font-medium text-foreground/70">描述：</span>
                        {activeScene.scene || emptyValueText}
                      </div>
                      <div className="line-clamp-2">
                        <span className="font-medium text-foreground/70">目标：</span>
                        {activeScene.goal || emptyValueText}
                      </div>
                      <div className="line-clamp-2">
                        <span className="font-medium text-foreground/70">推进：</span>
                        {activeScene.direction || emptyValueText}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <EmptyPreview
                icon={Clapperboard}
                title="暂无场景"
                description="场景保存节点呈现所需的背景、目标、进展和记忆。"
              />
            )}
          </OverviewCard>

          <OverviewCard
            icon={FileText}
            title="稿件"
            meta={`${formatCount(pendingDrafts.length, "待收稿")} · ${formatCount(story.manuscriptInbox.accepted.length, "已收稿")}`}
            actionLabel="查看稿件"
            onAction={() => onOpenModule("manuscripts")}
          >
            {pendingDrafts[0] || latestAcceptedDraft ? (
              <div className="rounded-lg bg-muted/10 px-5 py-5">
                <div className="text-xs font-medium text-muted-foreground">
                  {pendingDrafts[0] ? "最新待收稿" : "最新收稿"}
                </div>
                <div className="mt-1 truncate text-base font-semibold leading-6">
                  {(pendingDrafts[0] ?? latestAcceptedDraft)?.title ?? emptyValueText}
                </div>
                <div className="mt-2 line-clamp-3 text-sm leading-6 text-muted-foreground">
                  {(pendingDrafts[0] ?? latestAcceptedDraft)?.summary ||
                    (pendingDrafts[0] ?? latestAcceptedDraft)?.content ||
                    emptyValueText}
                </div>
                <Badge variant="outline" className="mt-3">
                  {manuscriptSourceLabels[(pendingDrafts[0] ?? latestAcceptedDraft)?.source ?? "manual"]}
                </Badge>
              </div>
            ) : (
              <EmptyPreview
                icon={FileText}
                title="暂无稿件"
                description="酒馆、聊天框、手写和 AI 润色都可以向故事端收稿。"
              />
            )}
          </OverviewCard>
        </div>
      </div>

      <StoryOverviewEdit bind={editRef} story={story} onSave={onSave} />
    </>
  );
};
