import type { Ref } from "react";
import { useImperativeHandle, useState } from "react";
import { BookOpen, Plus, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { StoryAsset, StoryContextScene } from "@/features/story";
import { createStoryScene } from "../../story-form-utils";
import { EmptyBlock } from "../../story-primitives";
import type { StoryModuleSave } from "../types";
import { StorySceneEditCard } from "./scene-card";

export type StoryScenesEditHandle = (story?: StoryAsset) => void;

type StoryScenesEditProps = {
  bind: Ref<StoryScenesEditHandle>;
  story: StoryAsset;
  onSave: StoryModuleSave;
};

export const StoryScenesEdit = ({
  bind,
  story,
  onSave,
}: StoryScenesEditProps) => {
  const [draft, setDraft] = useState<StoryAsset | null>(null);

  const open = (nextStory = story) => setDraft(nextStory);

  useImperativeHandle(bind, () => open);

  const close = () => setDraft(null);

  const updateScene = (
    sceneId: string,
    updater: (scene: StoryContextScene) => StoryContextScene,
  ) => {
    setDraft((current) =>
      current
        ? {
            ...current,
            scenes: current.scenes.map((scene) => scene.id === sceneId ? updater(scene) : scene),
          }
        : current
    );
  };

  const updateSceneStatus = (
    sceneId: string,
    field: keyof NonNullable<StoryContextScene["status"]>,
    value: string,
  ) => {
    updateScene(sceneId, (scene) => ({
      ...scene,
      status: {
        ...scene.status,
        [field]: value,
      },
    }));
  };

  const save = () => {
    if (!draft) {
      return;
    }
    onSave(draft);
    close();
  };

  return (
    <Dialog
      open={Boolean(draft)}
      onOpenChange={(openState) => {
        if (!openState) {
          close();
        }
      }}
    >
      {draft ? (
        <DialogContent className="max-h-[min(90vh,52rem)] overflow-hidden sm:max-w-5xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <BookOpen className="size-4" />
              编辑场景
            </DialogTitle>
          </DialogHeader>
          <ScrollArea className="max-h-[min(68vh,40rem)] pr-3">
            <div className="space-y-4">
              <div className="flex justify-end">
                <Button
                  type="button"
                  size="sm"
                  className="gap-2"
                  onClick={() =>
                    setDraft({
                      ...draft,
                      scenes: [...draft.scenes, createStoryScene(draft.scenes.length)],
                    })
                  }
                >
                  <Plus className="size-4" />
                  添加场景
                </Button>
              </div>
              {draft.scenes.length === 0 ? (
                <EmptyBlock text="暂无场景" />
              ) : (
                draft.scenes.map((scene, index) => (
                  <StorySceneEditCard
                    key={scene.id}
                    draft={draft}
                    index={index}
                    onDraftChange={setDraft}
                    onUpdateScene={updateScene}
                    onUpdateSceneStatus={updateSceneStatus}
                    scene={scene}
                  />
                ))
              )}
            </div>
          </ScrollArea>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={close}>
              取消
            </Button>
            <Button type="button" className="gap-2" onClick={save}>
              <Save className="size-4" />
              保存
            </Button>
          </DialogFooter>
        </DialogContent>
      ) : null}
    </Dialog>
  );
};
