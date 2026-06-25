import type { Ref } from "react";
import { useImperativeHandle, useState } from "react";
import { FileText } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Dialog } from "@/components/ui/dialog";
import type {
  StoryAsset,
  StoryManuscriptDraft,
  StoryManuscriptDraftUpdateInput,
  StoryManuscriptSubmissionInput,
} from "@/features/story";
import {
  StoryFormDialogContent,
  StoryFormHeader,
} from "../../story-primitives";
import { manuscriptSourceLabels } from "../../story-form-utils";
import { StoryManuscriptEditFooter } from "./edit-footer";
import { StoryManuscriptEditForm } from "./edit-form";
import {
  createManuscriptDraftPatch,
  createManuscriptEditDraft,
  createManuscriptSubmission,
  type ManuscriptEditDraft,
  type ManuscriptEditMode,
} from "./edit-types";

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
    setEditDraft(createManuscriptEditDraft(nextDraft));
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

  const submit = () => {
    if (mode === "create") {
      const submission = createManuscriptSubmission(editDraft);
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
    const patch = createManuscriptDraftPatch(editDraft);
    if (!patch) {
      return;
    }
    onSave(draft.id, patch);
    close();
  };

  const acceptDraft = () => {
    const patch = createManuscriptDraftPatch(editDraft);
    if (!patch || !draft) {
      return;
    }
    onAccept(draft.id, patch);
    close();
  };

  const rejectDraft = () => {
    if (!draft) {
      return;
    }
    onReject(draft.id);
    close();
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
        <StoryFormDialogContent className="sm:max-w-3xl">
          <StoryFormHeader
            icon={FileText}
            title={mode === "create" ? "手写稿件" : "编辑稿件"}
            description="维护候选稿件内容，可保存、润色、收稿或退回。"
          />
          <form
            className="space-y-4 overflow-y-auto px-5 py-4"
            onSubmit={(event) => {
              event.preventDefault();
              submit();
            }}
          >
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
            <StoryManuscriptEditForm
              draft={editDraft}
              mode={mode}
              onChange={setEditDraft}
              story={story}
            />
            <StoryManuscriptEditFooter
              draft={draft}
              editDraft={editDraft}
              isPolishing={isPolishing}
              mode={mode}
              onAcceptDraft={acceptDraft}
              onClose={close}
              onPolish={() => void polish()}
              onRejectDraft={rejectDraft}
            />
          </form>
        </StoryFormDialogContent>
      ) : null}
    </Dialog>
  );
};
