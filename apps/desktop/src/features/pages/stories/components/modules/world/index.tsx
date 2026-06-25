import { FileText, Pencil } from "lucide-react";
import { useRef } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { StoryAsset } from "@/features/story";
import { EmptyBlock, StorySection } from "../../story-primitives";
import type { StoryModuleSave } from "../types";
import { StoryWorldEdit, type StoryWorldEditHandle } from "./edit";

type StoryWorldModuleProps = {
  story: StoryAsset;
  onSave: StoryModuleSave;
};

export const StoryWorldModule = ({
  story,
  onSave,
}: StoryWorldModuleProps) => {
  const editRef = useRef<StoryWorldEditHandle>(null);

  return (
    <>
      <StorySection
        icon={FileText}
        title="世界书"
        description="维护背景设定、关键词触发和常驻上下文。"
        action={(
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="gap-2"
            onClick={() => editRef.current?.(story)}
          >
            <Pencil className="size-4" />
            编辑
          </Button>
        )}
      >
        {story.lorebookEntries.length === 0 ? (
          <EmptyBlock text="暂无世界书条目" />
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {story.lorebookEntries.map((entry) => (
              <div key={entry.id} className="rounded-md border px-3 py-2">
                <div className="flex min-w-0 items-center justify-between gap-2">
                  <div className="truncate text-sm font-medium">{entry.title}</div>
                  {entry.alwaysOn ? <Badge variant="secondary">常驻</Badge> : null}
                </div>
                <div className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">
                  {entry.content || "空条目"}
                </div>
              </div>
            ))}
          </div>
        )}
      </StorySection>

      <StoryWorldEdit bind={editRef} story={story} onSave={onSave} />
    </>
  );
};
