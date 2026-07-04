import { ArrowDown, ArrowUp, BookOpen, Pencil, Plus, Trash2 } from "lucide-react";
import { useRef } from "react";
import { Button } from "@/components/ui/button";
import type { StoryJson } from "@/features/story/model/story-types";
import {
  EmptyBlock,
  StorySection,
  editorDangerActionButtonClassName,
  editorHeaderActionButtonClassName,
  editorListEntryBodyClassName,
  editorPrimaryActionButtonClassName,
  editorQuietActionButtonClassName,
  emptyValueText,
} from "../../story-primitives";
import { formatCount, moveItem } from "../../story-form-utils";
import type { StoryModuleSave } from "../types";
import { StoryScenesEdit, type StoryScenesEditHandle } from "./edit";

type StoryScenesModuleProps = {
  story: StoryJson;
  onSave: StoryModuleSave;
};

export const StoryScenesModule = ({
  story,
  onSave,
}: StoryScenesModuleProps) => {
  const editRef = useRef<StoryScenesEditHandle>(null);
  const activeNodeSceneId = story.graph.nodes.find((node) => node.id === story.graph.activeNodeId)?.sceneId ??
    story.graph.nodes.find((node) => node.id === story.graph.entryNodeId)?.sceneId ??
    story.scenes[0]?.id;
  const moveScene = (index: number, direction: -1 | 1) => {
    onSave({
      ...story,
      scenes: moveItem(story.scenes, index, direction),
      updatedAt: Date.now(),
    });
  };
  const deleteScene = (sceneId: string) => {
    if (story.scenes.length <= 1) {
      return;
    }

    onSave({
      ...story,
      scenes: story.scenes.filter((scene) => scene.id !== sceneId),
      graph: {
        ...story.graph,
        nodes: story.graph.nodes.map((node) =>
          node.sceneId === sceneId ? { ...node, sceneId: undefined } : node
        ),
      },
      updatedAt: Date.now(),
    });
  };

  return (
    <>
      <StorySection
        icon={BookOpen}
        title="故事场景"
        description="维护故事场景、剧情进展、推进方向和场景记忆。"
        meta={formatCount(story.scenes.length, "场景")}
        action={(
          <Button
            type="button"
            size="sm"
            variant="outline"
            className={editorHeaderActionButtonClassName}
            onClick={() => editRef.current?.(null)}
          >
            <Plus className="size-3.5" />
            新增场景
          </Button>
        )}
        contentClassName="space-y-2"
      >
        {story.scenes.length === 0 ? (
          <EmptyBlock text="暂无场景" />
        ) : (
          <div className="grid gap-2">
            {story.scenes.map((scene, index) => {
              const isActiveScene = scene.id === activeNodeSceneId;
              return (
                <div
                  key={scene.id}
                  className={[
                    "rounded-md border bg-background/80 p-3",
                    isActiveScene ? "border-primary/45 bg-primary/[0.06] ring-1 ring-primary/10" : "",
                  ].join(" ")}
                >
                  <div className="flex min-w-0 items-start gap-3">
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-md border bg-muted/50 text-xs font-medium text-muted-foreground">
                      {index + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                        <div className="min-w-0 truncate text-sm font-medium leading-5">
                          {scene.title || emptyValueText}
                        </div>
                        {isActiveScene ? (
                          <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
                            当前
                          </span>
                        ) : null}
                      </div>
                      <div className={["mt-1 line-clamp-2", editorListEntryBodyClassName].join(" ")}>
                        {scene.plot.trim() || scene.scene.trim() || emptyValueText}
                      </div>
                      <div className="mt-3 grid gap-1.5">
                        <SceneSummaryLine label="场景描述" value={scene.scene} />
                        <SceneSummaryLine label="场景剧情" value={scene.plot} />
                        <SceneSummaryLine label="场景目标" value={scene.goal} />
                        <SceneSummaryLine label="剧情走向" value={scene.direction} />
                        <SceneSummaryLine label="承接关系" value={scene.transition} />
                        <SceneSummaryLine label="场景记忆" value={scene.memory} />
                      </div>
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap justify-end gap-1.5 border-t pt-2">
                    <Button
                      type="button"
                      size="xs"
                      variant="outline"
                      className={editorQuietActionButtonClassName}
                      disabled={index === 0}
                      onClick={() => moveScene(index, -1)}
                    >
                      <ArrowUp className="size-3" />
                      上移
                    </Button>
                    <Button
                      type="button"
                      size="xs"
                      variant="outline"
                      className={editorQuietActionButtonClassName}
                      disabled={index === story.scenes.length - 1}
                      onClick={() => moveScene(index, 1)}
                    >
                      <ArrowDown className="size-3" />
                      下移
                    </Button>
                    <Button
                      type="button"
                      size="xs"
                      variant="outline"
                      className={editorPrimaryActionButtonClassName}
                      aria-label={`编辑${scene.title || "场景"}`}
                      onClick={() => editRef.current?.(scene)}
                    >
                      <Pencil className="size-3" />
                      编辑
                    </Button>
                    <Button
                      type="button"
                      size="xs"
                      variant="ghost"
                      className={editorDangerActionButtonClassName}
                      disabled={story.scenes.length <= 1}
                      onClick={() => deleteScene(scene.id)}
                    >
                      <Trash2 className="size-3" />
                      删除
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </StorySection>

      <StoryScenesEdit bind={editRef} story={story} onSave={onSave} />
    </>
  );
};

const SceneSummaryLine = ({
  label,
  value,
}: {
  label: string;
  value: string;
}) => {
  const normalizedValue = value.trim();

  return (
    <div className="flex min-w-0 items-start gap-1.5 text-xs leading-5">
      <span className="shrink-0 font-medium text-foreground/70">{label}：</span>
      <span className="min-w-0 flex-1 line-clamp-2 whitespace-pre-wrap text-muted-foreground">
        {normalizedValue || emptyValueText}
      </span>
    </div>
  );
};
