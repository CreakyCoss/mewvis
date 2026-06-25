import type { Ref } from "react";
import { useImperativeHandle, useState } from "react";
import { Check, FileText, Loader2, Save, Sparkles, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type {
  StoryAsset,
  StoryManuscriptDraft,
  StoryManuscriptDraftUpdateInput,
  StoryManuscriptSubmissionInput,
} from "@/features/story";
import { EditorField, manuscriptSourceLabels, selectClassName } from "../../shared";

export type StoryManuscriptEditHandle = {
  create: () => void;
  edit: (draft: StoryManuscriptDraft) => void;
};

type StoryManuscriptEditProps = {
  bind: Ref<StoryManuscriptEditHandle>;
  story: StoryAsset;
  onAccept: (draftId: string, patch?: StoryManuscriptDraftUpdateInput) => void;
  onCreate: (input: Omit<StoryManuscriptSubmissionInput, "storyId" | "source">) => void;
  onPolish: (input: {
    nodeId: string;
    title: string;
    summary?: string;
    content: string;
  }) => Promise<string>;
  onSave: (draftId: string, patch: StoryManuscriptDraftUpdateInput) => void;
  onReject: (draftId: string) => void;
};

type ManuscriptEditMode = "create" | "edit";

type ManuscriptEditDraft = Pick<
  StoryManuscriptDraft,
  "title" | "summary" | "content" | "branchId" | "nodeId"
>;

const createEditDraft = (draft: StoryManuscriptDraft): ManuscriptEditDraft => ({
  title: draft.title,
  summary: draft.summary,
  content: draft.content,
  branchId: draft.branchId,
  nodeId: draft.nodeId,
});

export const StoryManuscriptEdit = ({
  bind,
  story,
  onAccept,
  onCreate,
  onPolish,
  onSave,
  onReject,
}: StoryManuscriptEditProps) => {
  const [mode, setMode] = useState<ManuscriptEditMode>("edit");
  const [draft, setDraft] = useState<StoryManuscriptDraft | null>(null);
  const [editDraft, setEditDraft] = useState<ManuscriptEditDraft | null>(null);
  const [isPolishing, setIsPolishing] = useState(false);
  const [error, setError] = useState("");

  const defaultNodeId = story.graph.activeNodeId ||
    story.graph.entryNodeId ||
    story.graph.nodes[0]?.id ||
    "";

  const create = () => {
    setMode("create");
    setDraft(null);
    setEditDraft({
      title: "手写稿件",
      summary: "",
      content: "",
      branchId: "",
      nodeId: defaultNodeId,
    });
    setError("");
  };

  const edit = (nextDraft: StoryManuscriptDraft) => {
    setMode("edit");
    setDraft(nextDraft);
    setEditDraft(createEditDraft(nextDraft));
    setError("");
  };

  useImperativeHandle(bind, () => ({
    create,
    edit,
  }));

  const close = () => {
    setDraft(null);
    setEditDraft(null);
    setIsPolishing(false);
    setError("");
  };

  const createPatch = (): StoryManuscriptDraftUpdateInput | null =>
    editDraft
      ? {
          title: editDraft.title,
          summary: editDraft.summary,
          content: editDraft.content,
          branchId: editDraft.branchId,
        }
      : null;

  const createSubmission = (): Omit<StoryManuscriptSubmissionInput, "storyId" | "source"> | null =>
    editDraft
      ? {
          nodeId: editDraft.nodeId,
          branchId: editDraft.branchId,
          title: editDraft.title,
          summary: editDraft.summary,
          content: editDraft.content,
        }
      : null;

  const polish = async () => {
    if (!editDraft || !editDraft.nodeId) {
      return;
    }

    setIsPolishing(true);
    setError("");
    try {
      const polishedContent = await onPolish({
        nodeId: editDraft.nodeId,
        title: editDraft.title,
        summary: editDraft.summary,
        content: editDraft.content,
      });
      setEditDraft((current) =>
        current
          ? {
              ...current,
              content: polishedContent,
            }
          : current
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setIsPolishing(false);
    }
  };

  return (
    <Dialog
      open={Boolean(editDraft)}
      onOpenChange={(openState) => {
        if (!openState) {
          close();
        }
      }}
    >
      {editDraft ? (
        <DialogContent className="max-h-[min(90vh,48rem)] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="size-4" />
              {mode === "create" ? "手写稿件" : "编辑稿件"}
            </DialogTitle>
          </DialogHeader>
          {draft ? (
            <div className="flex flex-wrap gap-2">
              <Badge variant="secondary">{manuscriptSourceLabels[draft.source]}</Badge>
              <Badge variant="outline">{draft.status}</Badge>
              <Badge variant="outline">节点：{draft.nodeId}</Badge>
            </div>
          ) : null}
          {error ? (
            <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </div>
          ) : null}
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              if (mode === "create") {
                const submission = createSubmission();
                if (!submission) {
                  return;
                }
                onCreate(submission);
                close();
                return;
              }
              if (!draft) {
                return;
              }
              const patch = createPatch();
              if (!patch) {
                return;
              }
              onSave(draft.id, patch);
              close();
            }}
          >
            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_16rem]">
              <div className="space-y-4">
                <EditorField label="标题">
                  <Input
                    value={editDraft.title}
                    onChange={(event) => setEditDraft({
                      ...editDraft,
                      title: event.target.value,
                    })}
                  />
                </EditorField>
                <EditorField label="摘要">
                  <Textarea
                    className="min-h-24 resize-y"
                    value={editDraft.summary}
                    onChange={(event) => setEditDraft({
                      ...editDraft,
                      summary: event.target.value,
                    })}
                  />
                </EditorField>
              </div>
              <div className="space-y-4">
                {mode === "create" ? (
                  <EditorField label="节点">
                    <select
                      className={selectClassName}
                      value={editDraft.nodeId}
                      onChange={(event) => setEditDraft({
                        ...editDraft,
                        nodeId: event.target.value,
                      })}
                    >
                      {story.graph.nodes.map((node) => (
                        <option key={node.id} value={node.id}>
                          {node.title}
                        </option>
                      ))}
                    </select>
                  </EditorField>
                ) : null}
                <EditorField label="分支 ID">
                  <Input
                    value={editDraft.branchId ?? ""}
                    onChange={(event) => setEditDraft({
                      ...editDraft,
                      branchId: event.target.value,
                    })}
                    placeholder="可选"
                  />
                </EditorField>
              </div>
            </div>
            <EditorField label="正文">
              <Textarea
                className="min-h-[18rem] resize-y font-mono text-sm leading-6"
                value={editDraft.content}
                onChange={(event) => setEditDraft({
                  ...editDraft,
                  content: event.target.value,
                })}
              />
            </EditorField>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={close}>
                关闭
              </Button>
              <Button
                type="button"
                variant="outline"
                className="gap-2"
                disabled={isPolishing || !editDraft.nodeId}
                onClick={() => void polish()}
              >
                {isPolishing ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Sparkles className="size-4" />
                )}
                {isPolishing ? "润色中" : "AI 润色"}
              </Button>
              {mode === "create" ? (
                <Button
                  type="submit"
                  className="gap-2"
                  disabled={isPolishing || !editDraft.nodeId || !editDraft.content.trim()}
                >
                  <Save className="size-4" />
                  加入收稿箱
                </Button>
              ) : draft?.status === "pending" ? (
                <>
                  <Button
                    type="button"
                    variant="outline"
                    className="gap-2"
                    disabled={isPolishing}
                    onClick={() => {
                      onReject(draft.id);
                      close();
                    }}
                  >
                    <X className="size-4" />
                    退回
                  </Button>
                  <Button
                    type="submit"
                    variant="outline"
                    className="gap-2"
                    disabled={isPolishing || !editDraft.content.trim()}
                  >
                    <Save className="size-4" />
                    保存
                  </Button>
                  <Button
                    type="button"
                    className="gap-2"
                    disabled={isPolishing || !editDraft.content.trim()}
                    onClick={() => {
                      const patch = createPatch();
                      if (!patch || !draft) {
                        return;
                      }
                      onAccept(draft.id, patch);
                      close();
                    }}
                  >
                    <Check className="size-4" />
                    保存并收稿
                  </Button>
                </>
              ) : null}
            </DialogFooter>
          </form>
        </DialogContent>
      ) : null}
    </Dialog>
  );
};
