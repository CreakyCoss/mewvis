import { BookOpen, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { StoryImportDraft } from "@/features/story";
import { EditorField, EmptyBlock, StorySection } from "../story-primitives";
import { updateImportScene } from "./draft-utils";

type StoryImportDraftScenesProps = {
  draft: StoryImportDraft;
  onChange: (draft: StoryImportDraft) => void;
};

export const StoryImportDraftScenes = ({
  draft,
  onChange,
}: StoryImportDraftScenesProps) => (
  <StorySection icon={BookOpen} title="场景">
    {draft.scenes.length === 0 ? (
      <EmptyBlock text="暂无场景" />
    ) : (
      <div className="space-y-3">
        {draft.scenes.map((scene) => (
          <div key={scene.id} className="rounded-md border p-3">
            <div className="mb-3 flex items-center justify-between gap-2">
              <div className="truncate text-sm font-medium">{scene.title}</div>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="size-8 text-muted-foreground hover:text-destructive"
                onClick={() =>
                  onChange({
                    ...draft,
                    scenes: draft.scenes.filter((item) => item.id !== scene.id),
                  })
                }
                title="移除场景"
                aria-label="移除场景"
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <EditorField label="标题">
                <Input
                  value={scene.title}
                  onChange={(event) =>
                    onChange(updateImportScene(draft, scene.id, {
                      title: event.target.value,
                    }))
                  }
                />
              </EditorField>
              <EditorField label="目标">
                <Input
                  value={scene.goal}
                  onChange={(event) =>
                    onChange(updateImportScene(draft, scene.id, {
                      goal: event.target.value,
                    }))
                  }
                />
              </EditorField>
            </div>
          </div>
        ))}
      </div>
    )}
  </StorySection>
);
