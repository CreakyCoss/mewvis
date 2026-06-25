import { BookOpen, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { StoryAsset } from "@/features/story";
import { cn } from "@/lib/utils";
import { formatCount, getPendingDraftCount } from "./story-form-utils";

type StorySidebarProps = {
  activeStoryId?: string | null;
  canCreateStory: boolean;
  isSaving: boolean;
  onCreateStory: () => void;
  onSelectStory: (story: StoryAsset) => void;
  stories: StoryAsset[];
};

export const StorySidebar = ({
  activeStoryId,
  canCreateStory,
  isSaving,
  onCreateStory,
  onSelectStory,
  stories,
}: StorySidebarProps) => (
  <aside className="hidden w-80 shrink-0 border-r bg-background md:flex md:flex-col">
    <div className="flex shrink-0 items-center justify-between gap-3 border-b px-4 py-4">
      <div className="min-w-0">
        <h1 className="truncate text-lg font-semibold leading-7">故事</h1>
        <p className="text-xs text-muted-foreground">
          {formatCount(stories.length, "个故事")}
        </p>
      </div>
      <Button
        type="button"
        size="icon"
        className="size-8 shrink-0"
        onClick={onCreateStory}
        disabled={!canCreateStory || isSaving}
        title="新建故事"
        aria-label="新建故事"
      >
        <Plus className="size-4" />
      </Button>
    </div>
    <ScrollArea className="min-h-0 flex-1">
      <div className="space-y-1 p-2">
        {stories.map((story) => {
          const pendingDraftCount = getPendingDraftCount(story);
          return (
            <button
              key={story.id}
              type="button"
              className={cn(
                "flex w-full min-w-0 flex-col gap-2 rounded-md px-3 py-2.5 text-left transition-colors hover:bg-muted",
                activeStoryId === story.id && "bg-muted",
              )}
              onClick={() => onSelectStory(story)}
            >
              <div className="flex min-w-0 items-center gap-2">
                <BookOpen className="size-4 shrink-0 text-muted-foreground" />
                <span className="truncate text-sm font-medium">{story.title}</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                <Badge variant="outline">{formatCount(story.characters.length, "角色")}</Badge>
                <Badge variant="outline">{formatCount(story.scenes.length, "场景")}</Badge>
                {pendingDraftCount > 0 ? (
                  <Badge variant="secondary">
                    {formatCount(pendingDraftCount, "待收稿")}
                  </Badge>
                ) : null}
              </div>
            </button>
          );
        })}
      </div>
    </ScrollArea>
  </aside>
);
