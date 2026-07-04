import type { Ref } from "react";
import { useImperativeHandle, useState } from "react";
import { Check, FileText, Loader2, Save, Sparkles, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type {
  StoryManuscriptDraft,
  StoryManuscriptDraftUpdateInput,
  StoryManuscriptSubmissionInput,
} from "./manuscript-inbox";
import type { StoryJson } from "../../model/types";
import {
  EditorField,
  StoryFormDialogContent,
  StoryFormHeader,
  selectClassName,
} from "../../../components/story-primitives";
import { manuscriptSourceLabels } from "../../../components/story-form-utils";

export type StoryManuscriptEditHandle = {
  create: () => void;
  edit: (draft: StoryManuscriptDraft) => void;
};

type StoryManuscriptEditProps = {
  bind: Ref<StoryManuscriptEditHandle>;
  story: StoryJson;
  onAccept: (draftId: string, patch?: StoryManuscriptDraftUpdateInput) => void;
  onCreate: (input: Omit<StoryManuscriptSubmissionInput, "storyId" | "source">) => void;
  onPolish: (input: { nodeId: string; title: string; summary?: string; content: string }) => Promise<string>;
  onSave: (draftId: string, patch: StoryManuscriptDraftUpdateInput) => void;
  onReject: (draftId: string) => void;
};

type ManuscriptForm = Pick<StoryManuscriptDraft, "title" | "summary" | "content" | "branchId" | "nodeId">;

type ManuscriptEditorState =
  | {
      mode: "create";
      form: ManuscriptForm;
    }
  | {
      mode: "edit";
      draft: StoryManuscriptDraft;
      form: ManuscriptForm;
    };

const createFormFromDraft = (draft: StoryManuscriptDraft): ManuscriptForm => ({
  title: draft.title,
  summary: draft.summary,
  content: draft.content,
  branchId: draft.branchId,
  nodeId: draft.nodeId,
});

const createDraftPatch = (form: ManuscriptForm): StoryManuscriptDraftUpdateInput => ({
  title: form.title,
  summary: form.summary,
  content: form.content,
  branchId: form.branchId,
});

const createSubmission = (form: ManuscriptForm): Omit<StoryManuscriptSubmissionInput, "storyId" | "source"> => ({
  nodeId: form.nodeId,
  branchId: form.branchId,
  title: form.title,
  summary: form.summary,
  content: form.content,
});

const StoryManuscriptEditForm = ({
  form,
  isCreate,
  onChange,
  story,
}: {
  form: ManuscriptForm;
  isCreate: boolean;
  onChange: (form: ManuscriptForm) => void;
  story: StoryJson;
}) => (
  <>
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_16rem]">
      <div className="space-y-4">
        <EditorField label="标题">
          <Input
            value={form.title}
            onChange={(event) =>
              onChange({
                ...form,
                title: event.target.value,
              })
            }
          />
        </EditorField>
        <EditorField label="摘要">
          <Textarea
            className="min-h-24 resize-y"
            value={form.summary}
            onChange={(event) =>
              onChange({
                ...form,
                summary: event.target.value,
              })
            }
          />
        </EditorField>
      </div>
      <div className="space-y-4">
        {isCreate ? (
          <EditorField label="节点">
            <select
              className={selectClassName}
              value={form.nodeId}
              onChange={(event) =>
                onChange({
                  ...form,
                  nodeId: event.target.value,
                })
              }
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
            value={form.branchId ?? ""}
            onChange={(event) =>
              onChange({
                ...form,
                branchId: event.target.value,
              })
            }
            placeholder="可选"
          />
        </EditorField>
      </div>
    </div>
    <EditorField label="正文">
      <Textarea
        className="min-h-[18rem] resize-y font-mono text-sm leading-6"
        value={form.content}
        onChange={(event) =>
          onChange({
            ...form,
            content: event.target.value,
          })
        }
      />
    </EditorField>
  </>
);

const StoryManuscriptEditFooter = ({
  form,
  isCreate,
  isPendingDraft,
  isPolishing,
  onAccept,
  onClose,
  onPolish,
  onReject,
}: {
  form: ManuscriptForm;
  isCreate: boolean;
  isPendingDraft: boolean;
  isPolishing: boolean;
  onAccept: () => void;
  onClose: () => void;
  onPolish: () => void;
  onReject: () => void;
}) => (
  <DialogFooter>
    <Button type="button" variant="outline" onClick={onClose}>
      关闭
    </Button>
    <Button type="button" variant="outline" className="gap-2" disabled={isPolishing || !form.nodeId} onClick={onPolish}>
      {isPolishing ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
      {isPolishing ? "润色中" : "AI 润色"}
    </Button>
    {isCreate ? (
      <Button type="submit" className="gap-2" disabled={isPolishing || !form.nodeId || !form.content.trim()}>
        <Save className="size-4" />
        加入收稿箱
      </Button>
    ) : isPendingDraft ? (
      <>
        <Button type="button" variant="outline" className="gap-2" disabled={isPolishing} onClick={onReject}>
          <X className="size-4" />
          退回
        </Button>
        <Button type="submit" variant="outline" className="gap-2" disabled={isPolishing || !form.content.trim()}>
          <Save className="size-4" />
          保存
        </Button>
        <Button type="button" className="gap-2" disabled={isPolishing || !form.content.trim()} onClick={onAccept}>
          <Check className="size-4" />
          保存并收稿
        </Button>
      </>
    ) : null}
  </DialogFooter>
);

export const StoryManuscriptEdit = ({
  bind,
  story,
  onAccept,
  onCreate,
  onPolish,
  onSave,
  onReject,
}: StoryManuscriptEditProps) => {
  const [editor, setEditor] = useState<ManuscriptEditorState | null>(null);
  const [isPolishing, setIsPolishing] = useState(false);
  const [error, setError] = useState("");

  const defaultNodeId = story.graph.activeNodeId || story.graph.entryNodeId || story.graph.nodes[0]?.id || "";

  const create = () => {
    setEditor({
      mode: "create",
      form: {
        title: "手写稿件",
        summary: "",
        content: "",
        branchId: "",
        nodeId: defaultNodeId,
      },
    });
    setError("");
  };

  const edit = (nextDraft: StoryManuscriptDraft) => {
    setEditor({
      mode: "edit",
      draft: nextDraft,
      form: createFormFromDraft(nextDraft),
    });
    setError("");
  };

  useImperativeHandle(bind, () => ({
    create,
    edit,
  }));

  const close = () => {
    setEditor(null);
    setIsPolishing(false);
    setError("");
  };

  const updateForm = (form: ManuscriptForm) => {
    setEditor((current) => (current ? { ...current, form } : current));
  };

  const polish = async () => {
    if (!editor?.form.nodeId) {
      return;
    }

    const form = editor.form;
    setIsPolishing(true);
    setError("");
    try {
      const polishedContent = await onPolish({
        nodeId: form.nodeId,
        title: form.title,
        summary: form.summary,
        content: form.content,
      });
      setEditor((current) =>
        current
          ? {
              ...current,
              form: {
                ...current.form,
                content: polishedContent,
              },
            }
          : current,
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setIsPolishing(false);
    }
  };

  const submit = () => {
    if (!editor) {
      return;
    }
    if (editor.mode === "create") {
      onCreate(createSubmission(editor.form));
      close();
      return;
    }
    onSave(editor.draft.id, createDraftPatch(editor.form));
    close();
  };

  const acceptDraft = () => {
    if (editor?.mode !== "edit") {
      return;
    }
    onAccept(editor.draft.id, createDraftPatch(editor.form));
    close();
  };

  const rejectDraft = () => {
    if (editor?.mode !== "edit") {
      return;
    }
    onReject(editor.draft.id);
    close();
  };

  return (
    <Dialog
      open={Boolean(editor)}
      onOpenChange={(openState) => {
        if (!openState) {
          close();
        }
      }}
    >
      {editor ? (
        <StoryFormDialogContent className="sm:max-w-3xl">
          <StoryFormHeader
            icon={FileText}
            title={editor.mode === "create" ? "手写稿件" : "编辑稿件"}
            description="维护候选稿件内容，可保存、润色、收稿或退回。"
          />
          <form
            className="space-y-4 overflow-y-auto px-5 py-4"
            onSubmit={(event) => {
              event.preventDefault();
              submit();
            }}
          >
            {editor.mode === "edit" ? (
              <div className="flex flex-wrap gap-2">
                <Badge variant="secondary">{manuscriptSourceLabels[editor.draft.source]}</Badge>
                <Badge variant="outline">{editor.draft.status}</Badge>
                <Badge variant="outline">节点：{editor.draft.nodeId}</Badge>
              </div>
            ) : null}
            {error ? (
              <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {error}
              </div>
            ) : null}
            <StoryManuscriptEditForm
              form={editor.form}
              isCreate={editor.mode === "create"}
              onChange={updateForm}
              story={story}
            />
            <StoryManuscriptEditFooter
              form={editor.form}
              isCreate={editor.mode === "create"}
              isPendingDraft={editor.mode === "edit" && editor.draft.status === "pending"}
              isPolishing={isPolishing}
              onAccept={acceptDraft}
              onClose={close}
              onPolish={() => void polish()}
              onReject={rejectDraft}
            />
          </form>
        </StoryFormDialogContent>
      ) : null}
    </Dialog>
  );
};
