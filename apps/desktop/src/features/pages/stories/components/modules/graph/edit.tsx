import type { Ref } from "react";
import { useImperativeHandle, useState } from "react";
import { GitBranch, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import type {
  StoryAsset,
  StoryContextEdge,
  StoryContextNode,
  StoryContextStage,
} from "@/features/story";
import type { StoryModuleSave } from "../types";
import { StoryGraphEdgeSection } from "./edge-section";
import { StoryGraphNodeSection } from "./node-section";
import { StoryGraphStageSection } from "./stage-section";

export type StoryGraphEditHandle = (story?: StoryAsset) => void;

type StoryGraphEditProps = {
  bind: Ref<StoryGraphEditHandle>;
  story: StoryAsset;
  onSave: StoryModuleSave;
};

export const StoryGraphEdit = ({
  bind,
  story,
  onSave,
}: StoryGraphEditProps) => {
  const [draft, setDraft] = useState<StoryAsset | null>(null);

  const open = (nextStory = story) => setDraft(nextStory);

  useImperativeHandle(bind, () => open);

  const close = () => setDraft(null);

  const updateStage = (
    stageId: string,
    updater: (stage: StoryContextStage) => StoryContextStage,
  ) => {
    setDraft((current) =>
      current
        ? {
            ...current,
            graph: {
              ...current.graph,
              stages: current.graph.stages.map((stage) =>
                stage.id === stageId ? updater(stage) : stage
              ),
            },
          }
        : current
    );
  };

  const updateNode = (
    nodeId: string,
    updater: (node: StoryContextNode) => StoryContextNode,
  ) => {
    setDraft((current) =>
      current
        ? {
            ...current,
            graph: {
              ...current.graph,
              nodes: current.graph.nodes.map((node) => node.id === nodeId ? updater(node) : node),
            },
          }
        : current
    );
  };

  const updateEdge = (
    edgeId: string,
    updater: (edge: StoryContextEdge) => StoryContextEdge,
  ) => {
    setDraft((current) =>
      current
        ? {
            ...current,
            graph: {
              ...current.graph,
              edges: current.graph.edges.map((edge) => edge.id === edgeId ? updater(edge) : edge),
            },
          }
        : current
    );
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
              <GitBranch className="size-4" />
              编辑故事结构
            </DialogTitle>
          </DialogHeader>
          <ScrollArea className="max-h-[min(68vh,40rem)] pr-3">
            <div className="space-y-5">
              <StoryGraphStageSection
                draft={draft}
                onDraftChange={setDraft}
                onUpdateStage={updateStage}
              />
              <StoryGraphNodeSection
                draft={draft}
                onDraftChange={setDraft}
                onUpdateNode={updateNode}
              />
              <StoryGraphEdgeSection
                draft={draft}
                onDraftChange={setDraft}
                onUpdateEdge={updateEdge}
              />
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
