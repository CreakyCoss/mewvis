import { ArrowRight, GitBranch, Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import type {
  StoryJson,
  StoryEdgeJson,
  StoryNodeJson,
} from "@/features/story/model/story-types";
import {
  EditorField,
  editorControlClassName,
  editorDangerActionButtonClassName,
  editorPrimaryActionButtonClassName,
  editorQuietActionButtonClassName,
  emptyValueText,
} from "../../story-primitives";

type StoryGraphNodeEditDialogProps = {
  canChooseMainPath: boolean;
  node: StoryNodeJson | null;
  open: boolean;
  story: StoryJson;
  onCreateNextNode: (node: StoryNodeJson) => void;
  onDeleteEdge: (edgeId: string) => void;
  onOpenChange: (open: boolean) => void;
  onUpdateEdge: (edgeId: string, patch: Partial<StoryEdgeJson>) => void;
  onUpdateNode: (nodeId: string, patch: Partial<StoryNodeJson>) => void;
};

const getNodeSelectLabel = (node: StoryNodeJson) =>
  node.title.trim() || node.id;

const isNormalNode = (node: StoryNodeJson | undefined) =>
  !node || node.type === "normal" || node.type.trim() === "";

export const StoryGraphNodeEditDialog = ({
  canChooseMainPath,
  node,
  open,
  story,
  onCreateNextNode,
  onDeleteEdge,
  onOpenChange,
  onUpdateEdge,
  onUpdateNode,
}: StoryGraphNodeEditDialogProps) => {
  const graph = story.graph;
  const renderEdgeEditor = (
    edge: StoryEdgeJson,
    direction: "outgoing" | "incoming",
  ) => {
    const isOutgoing = direction === "outgoing";
    const selectValue = isOutgoing ? edge.toNodeId : edge.fromNodeId;
    const blockedNodeId = isOutgoing ? edge.fromNodeId : edge.toNodeId;

    return (
      <div key={edge.id} className="rounded-md border bg-muted/15 p-2">
        <NativeSelect
          value={selectValue}
          size="sm"
          className="w-full"
          onChange={(event) =>
            onUpdateEdge(edge.id, isOutgoing
              ? { toNodeId: event.target.value }
              : { fromNodeId: event.target.value })}
        >
          {graph.nodes
            .filter((candidate) => candidate.id !== blockedNodeId)
            .filter((candidate) => isOutgoing || isNormalNode(candidate))
            .map((candidate) => (
              <NativeSelectOption key={candidate.id} value={candidate.id}>
                {getNodeSelectLabel(candidate)}
              </NativeSelectOption>
            ))}
        </NativeSelect>
        {isOutgoing ? (
          <Input
            value={edge.reason ?? ""}
            placeholder="出口原因"
            className="mt-2 h-8 bg-background/80 text-xs"
            onChange={(event) => onUpdateEdge(edge.id, { reason: event.target.value })}
          />
        ) : (
          <div className="mt-2 rounded-md bg-background/80 px-2 py-1.5 text-xs text-muted-foreground">
            <span className="font-medium">入口原因：</span>
            {edge.reason?.trim() || emptyValueText}
          </div>
        )}
        <Input
          value={edge.label}
          placeholder="分支标签"
          className="mt-2 h-8 bg-background/80 text-xs"
          onChange={(event) => onUpdateEdge(edge.id, { label: event.target.value })}
        />
        <div className="mt-2 flex justify-between gap-2">
          <Button
            type="button"
            size="xs"
            variant="outline"
            className={edge.isDefault
              ? editorPrimaryActionButtonClassName
              : editorQuietActionButtonClassName}
            onClick={() => onUpdateEdge(edge.id, { isDefault: true })}
          >
            默认
          </Button>
          <Button
            type="button"
            size="icon-xs"
            variant="ghost"
            className={editorDangerActionButtonClassName}
            title="删除分支"
            aria-label="删除分支"
            onClick={() => onDeleteEdge(edge.id)}
          >
            <Trash2 className="size-3" />
          </Button>
        </div>
      </div>
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {node ? (
        <DialogContent className="max-h-[min(760px,calc(100vh-2rem))] overflow-hidden p-0 sm:max-w-6xl">
          <div className="border-b px-5 py-4">
            <DialogHeader className="gap-1.5">
              <div className="flex items-center gap-2">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                  <Pencil className="size-3.5" />
                </span>
                <div className="min-w-0">
                  <DialogTitle className="truncate text-base">编辑节点</DialogTitle>
                  <DialogDescription className="mt-1 text-xs">
                    编辑节点内容，以及入口/出口分支关系。
                  </DialogDescription>
                </div>
              </div>
            </DialogHeader>
          </div>

          <div className="min-h-0 overflow-y-auto px-5 py-4">
            <div className="space-y-4">
              <div className="grid gap-3 md:grid-cols-3">
                <EditorField label="节点标题" htmlFor="story-node-dialog-title">
                  <Input
                    id="story-node-dialog-title"
                    value={node.title}
                    className={editorControlClassName}
                    onChange={(event) => onUpdateNode(node.id, { title: event.target.value })}
                  />
                </EditorField>
                <EditorField label="节点类型" htmlFor="story-node-dialog-type">
                  <NativeSelect
                    id="story-node-dialog-type"
                    value={node.type || "normal"}
                    className="w-full"
                    onChange={(event) => onUpdateNode(node.id, { type: event.target.value })}
                  >
                    <NativeSelectOption value="normal">普通</NativeSelectOption>
                    <NativeSelectOption value="failure">失败</NativeSelectOption>
                    <NativeSelectOption value="ending">结局</NativeSelectOption>
                  </NativeSelect>
                </EditorField>
                <EditorField label="路径角色" htmlFor="story-node-dialog-path-role">
                  <NativeSelect
                    id="story-node-dialog-path-role"
                    value={node.pathRole || "main"}
                    className="w-full"
                    onChange={(event) => {
                      const pathRole = event.target.value;
                      if (pathRole === "main" && !canChooseMainPath) {
                        return;
                      }
                      onUpdateNode(node.id, { pathRole });
                    }}
                  >
                    <NativeSelectOption value="main" disabled={!canChooseMainPath}>
                      主线
                    </NativeSelectOption>
                    <NativeSelectOption value="branch">支线</NativeSelectOption>
                  </NativeSelect>
                </EditorField>
              </div>

              <div className="grid gap-3 xl:grid-cols-2">
                <section className="rounded-md border bg-background/70 p-3">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 text-sm font-medium">
                      <ArrowRight className="size-4 text-primary" />
                      出口分支
                    </div>
                    <Button
                      type="button"
                      size="xs"
                      variant="outline"
                      className={editorQuietActionButtonClassName}
                      disabled={!isNormalNode(node)}
                      onClick={() => onCreateNextNode(node)}
                    >
                      <Plus className="size-3" />
                      新增节点
                    </Button>
                  </div>
                  <div className="space-y-2">
                    {graph.edges
                      .filter((edge) => edge.fromNodeId === node.id)
                      .map((edge) => renderEdgeEditor(edge, "outgoing"))}
                    {graph.edges.every((edge) => edge.fromNodeId !== node.id) ? (
                      <div className="rounded-md border bg-muted/15 px-3 py-4 text-center text-xs text-muted-foreground">
                        暂无出口分支。
                      </div>
                    ) : null}
                  </div>
                </section>

                <section className="rounded-md border bg-background/70 p-3">
                  <div className="mb-2 flex items-center gap-2 text-sm font-medium">
                    <GitBranch className="size-4 text-primary" />
                    入口分支
                  </div>
                  <div className="space-y-2">
                    {graph.edges
                      .filter((edge) => edge.toNodeId === node.id)
                      .map((edge) => renderEdgeEditor(edge, "incoming"))}
                    {graph.edges.every((edge) => edge.toNodeId !== node.id) ? (
                      <div className="rounded-md border bg-muted/15 px-3 py-4 text-center text-xs text-muted-foreground">
                        暂无入口分支。
                      </div>
                    ) : null}
                  </div>
                </section>
              </div>
            </div>
          </div>

          <DialogFooter className="border-t bg-muted/10 px-5 py-3">
            <div className="mr-auto text-xs leading-8 text-muted-foreground">
              修改会立即保存到故事结构。
            </div>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              关闭
            </Button>
          </DialogFooter>
        </DialogContent>
      ) : null}
    </Dialog>
  );
};
