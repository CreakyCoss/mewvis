import { ArrowDown, ArrowUp, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { StoryAsset, StoryContextScene } from "@/features/story";
import { moveItem } from "../../story-form-utils";
import { EditorField } from "../../story-primitives";

type StorySceneEditCardProps = {
  draft: StoryAsset;
  index: number;
  onDraftChange: (draft: StoryAsset) => void;
  onUpdateScene: (
    sceneId: string,
    updater: (scene: StoryContextScene) => StoryContextScene,
  ) => void;
  onUpdateSceneStatus: (
    sceneId: string,
    field: keyof NonNullable<StoryContextScene["status"]>,
    value: string,
  ) => void;
  scene: StoryContextScene;
};

export const StorySceneEditCard = ({
  draft,
  index,
  onDraftChange,
  onUpdateScene,
  onUpdateSceneStatus,
  scene,
}: StorySceneEditCardProps) => (
  <div className="rounded-md border p-3">
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
            onDraftChange({ ...draft, scenes: moveItem(draft.scenes, index, -1) })
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
            onDraftChange({ ...draft, scenes: moveItem(draft.scenes, index, 1) })
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
            onDraftChange({
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
            onUpdateScene(scene.id, (current) => ({
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
            onUpdateScene(scene.id, (current) => ({
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
            onUpdateScene(scene.id, (current) => ({
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
            onUpdateScene(scene.id, (current) => ({
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
            onUpdateScene(scene.id, (current) => ({
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
            onUpdateScene(scene.id, (current) => ({
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
              onUpdateScene(scene.id, (current) => ({
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
          onChange={(event) => onUpdateSceneStatus(scene.id, "location", event.target.value)}
        />
      </EditorField>
      <EditorField label="时间">
        <Input
          value={scene.status?.timeLabel ?? ""}
          onChange={(event) => onUpdateSceneStatus(scene.id, "timeLabel", event.target.value)}
        />
      </EditorField>
      <EditorField label="氛围">
        <Input
          value={scene.status?.atmosphere ?? ""}
          onChange={(event) => onUpdateSceneStatus(scene.id, "atmosphere", event.target.value)}
        />
      </EditorField>
    </div>
  </div>
);
