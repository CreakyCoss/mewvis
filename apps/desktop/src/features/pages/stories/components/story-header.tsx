import { BookOpen, FileUp, MessageSquareText, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { StoryAsset } from "@/features/story";
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
  onCreateStory: () => void;
  onOpenImportDialog: () => void;
  onOpenStoryPresentation: (channel: StoryPresentationChannel) => void | Promise<void>;
  openingStoryId: string;
  workspaceName?: string | null;
};

export const StoryHeader = ({
  activeStory,
  canCreateStory,
  isSaving,
  onCreateStory,
  onOpenImportDialog,
  onOpenStoryPresentation,
  openingStoryId,
  workspaceName,
}: StoryHeaderProps) => (
  <header className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b bg-background px-4 py-4 lg:px-6">
    <div className="min-w-0">
      <div className="flex min-w-0 items-center gap-2 md:hidden">
        <BookOpen className="size-4 text-muted-foreground" />
        <h1 className="truncate text-lg font-semibold">故事</h1>
      </div>
      <div className="hidden min-w-0 md:block">
        <h2 className="truncate text-lg font-semibold leading-7">
          {activeStory?.title ?? "故事资产"}
        </h2>
        <p className="text-xs text-muted-foreground">
          {workspaceName ?? "未选择工作区"}
        </p>
      </div>
    </div>
    <div className="flex items-center gap-2">
      <Button
        type="button"
        variant="outline"
        className="gap-2 md:hidden"
        onClick={onCreateStory}
        disabled={!canCreateStory || isSaving}
      >
        <Plus className="size-4" />
        新建
      </Button>
      <Button
        type="button"
        variant="outline"
        className="gap-2"
        onClick={onOpenImportDialog}
        disabled={!canCreateStory || isSaving}
      >
        <FileUp className="size-4" />
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
            className="gap-2"
            onClick={() => void onOpenStoryPresentation(definition.channel)}
            disabled={!activeStory || !canCreateStory || isOpening}
          >
            <Icon className="size-4" />
            {isOpening ? definition.loadingLabel : definition.label}
          </Button>
        );
      })}
    </div>
  </header>
);
