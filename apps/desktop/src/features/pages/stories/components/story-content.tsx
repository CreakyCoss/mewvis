import {
  ArrowLeft,
  BookOpen,
  FileText,
  FileUp,
  GitBranch,
  Pencil,
  Plus,
  Target,
  Trash2,
  UsersRound,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { resolveAvatar } from "@/assets/avatars";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import type {
  StoryJson,
  StoryManuscriptDraftUpdateInput,
  StoryManuscriptSubmissionInput,
} from "@/features/story";
import { StoryCharactersModule } from "./modules/characters";
import { StoryGraphModule } from "./modules/graph";
import { StoryManuscriptsModule } from "./modules/manuscripts";
import { StoryOverviewModule } from "./modules/overview";
import { StoryScenesModule } from "./modules/scenes";
import { StoryWorldModule } from "./modules/world";
import type { StoryPresentationChannel } from "./presentations/registry";
import type { StoryDraft } from "./story-form-utils";
import {
  storyConfigTabs,
  type StoryConfigTab,
} from "./story-tabs";

type StoryContentProps = {
  activeTab: StoryConfigTab;
  canCreateStory: boolean;
  isLoading: boolean;
  onAcceptManuscript: (draftId: string, patch?: StoryManuscriptDraftUpdateInput) => void;
  onCreateManuscriptDraft: (
    input: Omit<StoryManuscriptSubmissionInput, "storyId" | "source">,
  ) => void;
  onCreateStory: () => void;
  onDeleteStory: (story: StoryJson) => void;
  onOpenImportDialog: () => void;
  onOpenStoryPresentation: (
    channel: StoryPresentationChannel,
    nodeId?: string,
  ) => void | Promise<void>;
  onPolishManuscriptDraft: (input: {
    nodeId: string;
    title: string;
    summary?: string;
    content: string;
  }) => Promise<string>;
  onRejectManuscript: (draftId: string) => void;
  onSaveManuscriptDraft: (
    draftId: string,
    patch: StoryManuscriptDraftUpdateInput,
  ) => void;
  onSaveOverviewDraft: (draft: StoryDraft) => void;
  onSaveStory: (story: StoryJson) => void;
  onSelectStory: (story: StoryJson) => void;
  onSetActiveTab: (tab: StoryConfigTab) => void;
  onStartEditing: (story: StoryJson) => void;
  onExitHomeFullscreen?: () => void;
  isEditing: boolean;
  story: StoryJson | null;
  stories: StoryJson[];
};

export const StoryContent = ({
  activeTab,
  canCreateStory,
  isLoading,
  onAcceptManuscript,
  onCreateManuscriptDraft,
  onCreateStory,
  onDeleteStory,
  onOpenImportDialog,
  onOpenStoryPresentation,
  onPolishManuscriptDraft,
  onRejectManuscript,
  onSaveManuscriptDraft,
  onSaveOverviewDraft,
  onSaveStory,
  onSelectStory,
  onSetActiveTab,
  onStartEditing,
  onExitHomeFullscreen,
  isEditing,
  story,
  stories,
}: StoryContentProps) => {
  const renderActiveModule = () => {
    if (!story) {
      return null;
    }

    if (activeTab === "overview") {
      return (
        <StoryOverviewModule
          story={story}
          onOpenModule={onSetActiveTab}
          onSave={onSaveOverviewDraft}
        />
      );
    }
    if (activeTab === "characters") {
      return <StoryCharactersModule story={story} onSave={onSaveStory} />;
    }
    if (activeTab === "scenes") {
      return <StoryScenesModule story={story} onSave={onSaveStory} />;
    }
    if (activeTab === "world") {
      return <StoryWorldModule story={story} onSave={onSaveStory} />;
    }
    if (activeTab === "graph") {
      return (
        <StoryGraphModule
          story={story}
          onSave={onSaveStory}
          onOpenScenes={() => onSetActiveTab("scenes")}
          onOpenNodeTavern={(nodeId) => void onOpenStoryPresentation("tavern", nodeId)}
          onOpenNodeChat={(nodeId) => void onOpenStoryPresentation("chat", nodeId)}
        />
      );
    }
    if (activeTab === "manuscripts") {
      return (
        <StoryManuscriptsModule
          story={story}
          onAccept={onAcceptManuscript}
          onCreateDraft={onCreateManuscriptDraft}
          onPolishDraft={onPolishManuscriptDraft}
          onSaveDraft={onSaveManuscriptDraft}
          onReject={onRejectManuscript}
        />
      );
    }

    return null;
  };

  if (isLoading) {
    return (
      <ScrollArea className="min-h-0 flex-1">
        <div className="p-6 text-sm text-muted-foreground">加载中...</div>
      </ScrollArea>
    );
  }

  if (!story) {
    return (
      <ScrollArea className="min-h-0 flex-1">
        <div className="flex min-h-[320px] flex-col px-6 py-5">
          {onExitHomeFullscreen ? (
            <div className="flex shrink-0">
              <Button
                type="button"
                variant="ghost"
                className="h-9 gap-2 px-2.5"
                onClick={onExitHomeFullscreen}
              >
                <ArrowLeft className="size-4" />
                返回
              </Button>
            </div>
          ) : null}
          <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
            <BookOpen className="size-10 text-muted-foreground" />
            <div className="text-base font-medium">暂无故事</div>
            <Button type="button" className="gap-2" onClick={onCreateStory} disabled={!canCreateStory}>
              <Plus className="size-4" />
              新建故事
            </Button>
          </div>
        </div>
      </ScrollArea>
    );
  }

  if (!isEditing) {
    const totalCharacterCount = stories.reduce((sum, item) => sum + item.characters.length, 0);
    const totalNodeCount = stories.reduce((sum, item) => sum + item.graph.nodes.length, 0);
    const totalDraftCount = stories.reduce(
      (sum, item) => sum + item.manuscriptInbox.drafts.filter((draft) => draft.status === "pending").length,
      0,
    );

    return (
      <ScrollArea className="min-h-0 flex-1 bg-background">
        <div className="flex w-full flex-col gap-5 px-5 py-5 lg:px-7">
          <header className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              {onExitHomeFullscreen ? (
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="size-9 shrink-0"
                  title="返回侧边栏"
                  aria-label="返回侧边栏"
                  onClick={onExitHomeFullscreen}
                >
                  <ArrowLeft className="size-4" />
                </Button>
              ) : null}
              <div className="flex size-10 shrink-0 items-center justify-center rounded-md border bg-muted/35">
                <BookOpen className="size-5 text-primary" />
              </div>
              <div className="min-w-0">
                <h1 className="truncate text-xl font-semibold leading-7">故事</h1>
                <div className="mt-0.5 flex flex-wrap gap-2 text-xs text-muted-foreground">
                  <span>{stories.length} 个故事</span>
                  <span>{totalCharacterCount} 角色</span>
                  <span>{totalNodeCount} 节点</span>
                  <span>{totalDraftCount} 待收稿</span>
                </div>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-9 gap-1.5"
                onClick={onOpenImportDialog}
                disabled={!canCreateStory}
              >
                <FileUp className="size-4" />
                导入故事
              </Button>
              <Button
                type="button"
                size="sm"
                className="h-9 gap-1.5"
                onClick={onCreateStory}
                disabled={!canCreateStory}
              >
                <Plus className="size-4" />
                新建故事
              </Button>
            </div>
          </header>

          <section className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,18rem),1fr))] items-start gap-5">
            {stories.map((item) => (
              <StoryCard
                key={item.id}
                story={item}
                isActive={item.id === story.id}
                onSelect={() => onSelectStory(item)}
                onEdit={() => {
                  onStartEditing(item);
                }}
                onDelete={() => onDeleteStory(item)}
              />
            ))}
          </section>
        </div>
      </ScrollArea>
    );
  }

  return (
    <div className="min-h-0 flex-1 overflow-hidden bg-background">
      <div className="flex h-full min-h-0 overflow-hidden">
        <aside className="hidden w-20 shrink-0 flex-col border-r bg-muted/10 px-2 py-4 md:flex">
          <nav className="flex min-h-0 flex-1 flex-col gap-1">
            {storyConfigTabs.map(({ id, label, description, icon: Icon }) => (
              <button
                key={id}
                type="button"
                title={`${label}：${description}`}
                aria-label={`切换到${label}`}
                onClick={() => onSetActiveTab(id)}
                className={[
                  "flex flex-col items-center gap-1 rounded-md px-1.5 py-2 text-[11px] leading-4 text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground",
                  activeTab === id ? "bg-primary/10 text-primary" : "",
                ].join(" ")}
              >
                <Icon className="size-4" />
                <span className="max-w-full truncate">{label}</span>
              </button>
            ))}
          </nav>
        </aside>

        <ScrollArea className="min-h-0 flex-1 bg-muted/10">
          <div className="flex w-full flex-col gap-4 px-4 py-4 lg:px-6">
            <nav className="flex gap-2 overflow-x-auto pb-1 md:hidden">
              {storyConfigTabs.map(({ id, label, description, icon: Icon }) => (
                <Button
                  key={id}
                  type="button"
                  title={`${label}：${description}`}
                  aria-label={`切换到${label}`}
                  size="sm"
                  variant={activeTab === id ? "default" : "outline"}
                  className="h-8 shrink-0 gap-1.5 px-3 text-xs"
                  onClick={() => onSetActiveTab(id)}
                >
                  <Icon className="size-3.5" />
                  {label}
                </Button>
              ))}
            </nav>

            <div className="mx-auto w-full max-w-7xl">
              {renderActiveModule()}
            </div>
          </div>
        </ScrollArea>
      </div>
    </div>
  );
};

const StoryCardMetric = ({
  icon: Icon,
  label,
  value,
}: {
  icon: LucideIcon;
  label: string;
  value: number;
}) => (
  <span className="inline-flex h-8 min-w-0 items-center justify-center gap-1.5 rounded-md border bg-muted/20 px-1.5 text-[11px] text-foreground/80">
    <Icon className="size-3.5 shrink-0" />
    <span className="truncate">{value} {label}</span>
  </span>
);

const StoryCard = ({
  story,
  isActive,
  onSelect,
  onEdit,
  onDelete,
}: {
  story: StoryJson;
  isActive: boolean;
  onSelect: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) => {
  const activeNode = story.graph.nodes.find((node) => node.id === story.graph.activeNodeId) ??
    story.graph.nodes.find((node) => node.id === story.graph.entryNodeId) ??
    story.graph.nodes[0] ??
    null;
  const pendingDraftCount = story.manuscriptInbox.drafts.filter((draft) => draft.status === "pending").length;
  const visibleCharacters = story.characters.slice(0, 4);
  const hiddenCharacterCount = Math.max(0, story.characters.length - visibleCharacters.length);

  return (
    <article
      className={[
        "flex flex-col overflow-hidden rounded-lg border bg-card shadow-[0_18px_50px_-42px_rgb(15_23_42_/_0.55)] transition-colors",
        isActive ? "border-primary/45 bg-primary/[0.035] shadow-[0_20px_58px_-38px_rgb(13_148_136_/_0.45)]" : "hover:border-primary/20",
      ].join(" ")}
    >
      <button
        type="button"
        className="flex min-w-0 flex-col text-left transition-colors hover:bg-accent/10 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
        onClick={onSelect}
      >
        <div className="relative">
          <div className="h-[clamp(6.25rem,9vw,7.5rem)] w-full overflow-hidden rounded-t-lg bg-gradient-to-br from-primary/15 via-muted to-background shadow-inner" />
          <span className="absolute left-3 top-3 max-w-[calc(100%-1.5rem)] truncate rounded-full border border-teal-100/30 bg-slate-950/65 px-2.5 py-1 text-xs font-semibold leading-4 text-teal-50 shadow-[0_12px_28px_-18px_rgb(15_23_42_/_0.9)] ring-1 ring-teal-100/24 backdrop-blur-md">
            标准故事
          </span>
          <div className="absolute inset-x-0 -bottom-6 flex justify-start px-4">
            <div className="flex min-w-0 items-end overflow-hidden pb-px">
              {visibleCharacters.length > 0 ? (
                <div className="flex min-w-0 items-end">
                  {visibleCharacters.map((character, index) => {
                    const avatar = resolveAvatar(character.avatar);
                    return (
                      <span
                        key={character.id}
                        className={[
                          "flex size-12 items-center justify-center overflow-hidden rounded-lg border-2 border-background bg-background shadow-[0_10px_26px_-18px_rgb(15_23_42_/_0.8)]",
                          index > 0 ? "-ml-3" : "",
                        ].join(" ")}
                      >
                        <img
                          src={avatar.src}
                          alt={character.name}
                          className="size-full object-cover"
                        />
                      </span>
                    );
                  })}
                  {hiddenCharacterCount > 0 ? (
                    <span className="-ml-3 flex size-12 shrink-0 items-center justify-center rounded-lg border-2 border-background bg-background/95 text-sm font-semibold text-muted-foreground shadow-[0_10px_26px_-18px_rgb(15_23_42_/_0.8)]">
                      +{hiddenCharacterCount}
                    </span>
                  ) : null}
                </div>
              ) : (
                <span className="flex size-12 items-center justify-center rounded-lg border-2 border-background bg-background/90 text-primary shadow-[0_10px_26px_-18px_rgb(15_23_42_/_0.8)]">
                  <BookOpen className="size-5" />
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="flex flex-col px-3.5 pt-8 pb-3">
          <h3 className="min-w-0 text-xl font-semibold leading-7 line-clamp-2">
            {story.title}
          </h3>
          <p className="mt-1.5 min-h-5 line-clamp-1 text-xs leading-5 text-muted-foreground">
            {story.outline || "暂无故事定位。"}
          </p>

          <div className="mt-2.5 grid grid-cols-3 gap-2">
            <StoryCardMetric icon={UsersRound} label="角色" value={story.characters.length} />
            <StoryCardMetric icon={GitBranch} label="节点" value={story.graph.nodes.length} />
            <StoryCardMetric icon={BookOpen} label="场景" value={story.scenes.length} />
          </div>

          <div className="mt-2.5">
            <div className="border-t pt-2.5">
              <div className="relative flex h-14 items-center gap-2.5 overflow-hidden rounded-lg border border-primary/15 bg-primary/[0.055] px-3 py-2 text-xs leading-5 text-muted-foreground">
                <Target className="absolute -right-3 -bottom-4 size-14 text-primary/5" />
                <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <Target className="size-4" />
                </span>
                <div className="min-w-0">
                  <div className="text-sm font-semibold leading-5 text-foreground">
                    当前目标
                  </div>
                  <div className="line-clamp-1">
                    {story.goal || activeNode?.title || "暂无整体目标。"}
                  </div>
                </div>
              </div>
            </div>
            {pendingDraftCount > 0 ? (
              <div className="mt-2 inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                <FileText className="size-3.5" />
                {pendingDraftCount} 篇待收稿
              </div>
            ) : null}
          </div>
        </div>
      </button>

      <div className="border-t bg-background/80 p-2.5">
        <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] gap-2">
          <Button
            type="button"
            size="sm"
            variant={isActive ? "secondary" : "outline"}
            className="h-9 min-w-0 whitespace-nowrap bg-background/80 text-sm"
            onClick={onSelect}
          >
            <BookOpen className="size-4 shrink-0" />
            <span className="truncate">{isActive ? "已选中" : "选中"}</span>
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-9 min-w-0 whitespace-nowrap bg-background/80 text-sm"
            onClick={onEdit}
          >
            <Pencil className="size-4 shrink-0" />
            <span className="truncate">编辑</span>
          </Button>
          <Button
            type="button"
            size="icon"
            variant="outline"
            className="size-9 shrink-0 bg-background/80 text-destructive hover:text-destructive"
            title="删除故事及工作区"
            aria-label="删除故事及工作区"
            onClick={onDelete}
          >
            <Trash2 className="size-4" />
          </Button>
        </div>
      </div>
    </article>
  );
};
