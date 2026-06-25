import {
  ArrowLeft,
  BookOpen,
  FileText,
  FileUp,
  GitBranch,
  MessageSquareText,
  Plus,
  UsersRound,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { StoryAsset } from "@/features/story";
import { editorHeaderActionButtonClassName } from "./story-primitives";
import {
  storyPresentationDefinitions,
  type StoryPresentationChannel,
  type StoryPresentationIcon,
} from "./presentations/registry";

const storyPresentationIconMap = {
  chat: MessageSquareText,
  tavern: BookOpen,
} satisfies Record<StoryPresentationIcon, typeof BookOpen>;

type StoryHeaderProps = {
  activeStory: StoryAsset | null;
  canCreateStory: boolean;
  isSaving: boolean;
  onBackToList: () => void;
  onCreateStory: () => void;
  onOpenImportDialog: () => void;
  onOpenStoryPresentation: (channel: StoryPresentationChannel) => void | Promise<void>;
  openingStoryId: string;
  pendingDraftCount: number;
  workspaceName?: string | null;
};

export const StoryHeader = ({
  activeStory,
  canCreateStory,
  isSaving,
  onBackToList,
  onCreateStory,
  onOpenImportDialog,
  onOpenStoryPresentation,
  openingStoryId,
  pendingDraftCount,
  workspaceName,
}: StoryHeaderProps) => {
  const headerStats: Array<{
    icon: LucideIcon;
    label: string;
    value: number;
  }> = [
    { icon: UsersRound, label: "角色", value: activeStory?.characters.length ?? 0 },
    { icon: BookOpen, label: "场景", value: activeStory?.scenes.length ?? 0 },
    { icon: GitBranch, label: "剧情节点", value: activeStory?.graph.nodes.length ?? 0 },
    { icon: FileText, label: "待收稿", value: pendingDraftCount },
  ];

  return (
    <header className="shrink-0 border-b bg-background px-5 py-4 shadow-sm lg:px-7">
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0 space-y-1.5">
            <div className="flex min-w-0 items-center gap-3">
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="size-9 shrink-0"
                title="返回故事入口"
                aria-label="返回故事入口"
                onClick={onBackToList}
              >
                <ArrowLeft className="size-4" />
              </Button>
              <span className="flex size-10 shrink-0 items-center justify-center rounded-lg border bg-muted/35 text-primary">
                <BookOpen className="size-5" />
              </span>
              <div className="min-w-0">
                <h2 className="truncate text-xl font-semibold leading-7">
                  {activeStory?.title ?? "故事资产"}
                </h2>
                <p className="line-clamp-2 max-w-2xl text-sm leading-6 text-muted-foreground">
                  {workspaceName ?? "未选择工作区"} · 编辑故事内容、结构、场景和可被呈现端读取的标准数据。
                </p>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              className={`${editorHeaderActionButtonClassName} h-9 md:hidden`}
              onClick={onCreateStory}
              disabled={!canCreateStory || isSaving}
            >
              <Plus className="size-3.5" />
              新建
            </Button>
            <Button
              type="button"
              variant="outline"
              className={`${editorHeaderActionButtonClassName} h-9`}
              onClick={onOpenImportDialog}
              disabled={!canCreateStory || isSaving}
            >
              <FileUp className="size-3.5" />
              导入
            </Button>
            {storyPresentationDefinitions.map((definition) => {
              const Icon = storyPresentationIconMap[definition.icon];
              const isOpening = Boolean(
                definition.loadingLabel &&
                  activeStory &&
                  openingStoryId === activeStory.id,
              );
              return (
                <Button
                  key={definition.channel}
                  type="button"
                  variant="outline"
                  className={`${editorHeaderActionButtonClassName} h-9`}
                  onClick={() => void onOpenStoryPresentation(definition.channel)}
                  disabled={!activeStory || !canCreateStory || isOpening}
                >
                  <Icon className="size-3.5" />
                  {isOpening ? definition.loadingLabel : definition.label}
                </Button>
              );
            })}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
          {headerStats.map(({ icon: Icon, value, label }) => (
            <div
              key={label}
              className="flex items-center gap-3 rounded-lg border bg-muted/10 px-3 py-2.5 shadow-xs"
            >
              <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                <Icon className="size-4" />
              </span>
              <div className="min-w-0">
                <div className="text-base font-semibold leading-5">
                  {value}
                </div>
                <div className="truncate text-[11px] leading-4 text-muted-foreground">
                  {label}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </header>
  );
};
