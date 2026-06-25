import type { Ref } from "react";
import { useImperativeHandle, useState } from "react";
import { ArrowDown, ArrowUp, BookOpen, Plus, Save, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import type { StoryAsset, StoryContextScene } from "@/features/story";
import {
  createStoryScene,
  moveItem,
} from "../../story-form-utils";
import { EditorField, EmptyBlock } from "../../story-primitives";
import type { StoryModuleSave } from "../types";

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
                  <div key={scene.id} className="rounded-md border p-3">
                    <div className="mb-3 flex min-w-0 items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium">{scene.title}</div>
                        <div className="text-xs text-muted-foreground">{scene.id}</div>
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          className="size-8"
                          disabled={index === 0}
                          onClick={() =>
                            setDraft({ ...draft, scenes: moveItem(draft.scenes, index, -1) })
                          }
                          title="上移场景"
                          aria-label="上移场景"
                        >
                          <ArrowUp className="size-4" />
                        </Button>
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          className="size-8"
                          disabled={index === draft.scenes.length - 1}
                          onClick={() =>
                            setDraft({ ...draft, scenes: moveItem(draft.scenes, index, 1) })
                          }
                          title="下移场景"
                          aria-label="下移场景"
                        >
                          <ArrowDown className="size-4" />
                        </Button>
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          className="size-8 text-muted-foreground hover:text-destructive"
                          disabled={draft.scenes.length <= 1}
                          onClick={() =>
                            setDraft({
                              ...draft,
                              scenes: draft.scenes.filter((item) => item.id !== scene.id),
                              graph: {
                                ...draft.graph,
                                nodes: draft.graph.nodes.map((node) =>
                                  node.sceneId === scene.id ? { ...node, sceneId: undefined } : node
                                ),
                              },
                            })
                          }
                          title="删除场景"
                          aria-label="删除场景"
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                    </div>
                    <div className="grid gap-3 lg:grid-cols-2">
                      <EditorField label="标题">
                        <Input
                          value={scene.title}
                          onChange={(event) =>
                            updateScene(scene.id, (current) => ({
                              ...current,
                              title: event.target.value,
                            }))
                          }
                        />
                      </EditorField>
                      <EditorField label="目标">
                        <Input
                          value={scene.goal}
                          onChange={(event) =>
                            updateScene(scene.id, (current) => ({
                              ...current,
                              goal: event.target.value,
                            }))
                          }
                        />
                      </EditorField>
                      <EditorField label="场景描述">
                        <Textarea
                          className="min-h-28 resize-y"
                          value={scene.scene}
                          onChange={(event) =>
                            updateScene(scene.id, (current) => ({
                              ...current,
                              scene: event.target.value,
                            }))
                          }
                        />
                      </EditorField>
                      <EditorField label="剧情进展">
                        <Textarea
                          className="min-h-28 resize-y"
                          value={scene.plot}
                          onChange={(event) =>
                            updateScene(scene.id, (current) => ({
                              ...current,
                              plot: event.target.value,
                            }))
                          }
                        />
                      </EditorField>
                      <EditorField label="推进方向">
                        <Textarea
                          className="min-h-24 resize-y"
                          value={scene.direction}
                          onChange={(event) =>
                            updateScene(scene.id, (current) => ({
                              ...current,
                              direction: event.target.value,
                            }))
                          }
                        />
                      </EditorField>
                      <EditorField label="承接关系">
                        <Textarea
                          className="min-h-24 resize-y"
                          value={scene.transition}
                          onChange={(event) =>
                            updateScene(scene.id, (current) => ({
                              ...current,
                              transition: event.target.value,
                            }))
                          }
                        />
                      </EditorField>
                      <div className="lg:col-span-2">
                        <EditorField label="场景记忆">
                          <Textarea
                            className="min-h-24 resize-y"
                            value={scene.memory}
                            onChange={(event) =>
                              updateScene(scene.id, (current) => ({
                                ...current,
                                memory: event.target.value,
                              }))
                            }
                          />
                        </EditorField>
                      </div>
                    </div>
                    <div className="mt-3 grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                      <EditorField label="地点">
                        <Input
                          value={scene.status?.location ?? ""}
                          onChange={(event) => updateSceneStatus(scene.id, "location", event.target.value)}
                        />
                      </EditorField>
                      <EditorField label="时间">
                        <Input
                          value={scene.status?.timeLabel ?? ""}
                          onChange={(event) => updateSceneStatus(scene.id, "timeLabel", event.target.value)}
                        />
                      </EditorField>
                      <EditorField label="氛围">
                        <Input
                          value={scene.status?.atmosphere ?? ""}
                          onChange={(event) => updateSceneStatus(scene.id, "atmosphere", event.target.value)}
                        />
                      </EditorField>
                    </div>
                  </div>
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
