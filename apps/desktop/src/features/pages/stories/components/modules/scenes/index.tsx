import { BookOpen, Pencil } from "lucide-react";
import { useRef } from "react";
import { Button } from "@/components/ui/button";
import type { StoryAsset } from "@/features/story";
import { EmptyBlock, StorySection } from "../../shared";
import type { StoryModuleSave } from "../types";
import { StoryScenesEdit, type StoryScenesEditHandle } from "./edit";

type StoryScenesModuleProps = {
  story: StoryAsset;
  onSave: StoryModuleSave;
};

export const StoryScenesModule = ({
  story,
  onSave,
}: StoryScenesModuleProps) => {
  const editRef = useRef<StoryScenesEditHandle>(null);

  return (
    <>
      <StorySection
        icon={BookOpen}
        title="场景"
        description="维护故事场景、剧情进展、推进方向和场景记忆。"
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
        {story.scenes.length === 0 ? (
          <EmptyBlock text="暂无场景" />
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {story.scenes.map((scene) => (
              <div key={scene.id} className="rounded-md border px-3 py-2">
                <div className="truncate text-sm font-medium">{scene.title}</div>
                <div className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">
                  {scene.scene || scene.goal || "空场景"}
                </div>
              </div>
            ))}
          </div>
        )}
      </StorySection>

      <StoryScenesEdit bind={editRef} story={story} onSave={onSave} />
    </>
  );
};
