import { Check, FileText, Plus, ScrollText, X } from "lucide-react";
import { useRef } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type {
  StoryAsset,
  StoryManuscriptDraftUpdateInput,
  StoryManuscriptSubmissionInput,
} from "@/features/story";
import { manuscriptSourceLabels } from "../../story-form-utils";
import {
  EmptyBlock,
  StorySection,
  editorHeaderActionButtonClassName,
  editorIconActionButtonClassName,
  editorDangerIconActionButtonClassName,
  editorListEntryBodyClassName,
  editorListEntryTitleClassName,
} from "../../story-primitives";
import { StoryManuscriptEdit, type StoryManuscriptEditHandle } from "./edit";

type StoryManuscriptsModuleProps = {
  story: StoryAsset;
  onAccept: (draftId: string, patch?: StoryManuscriptDraftUpdateInput) => void;
  onCreateDraft: (input: Omit<StoryManuscriptSubmissionInput, "storyId" | "source">) => void;
  onPolishDraft: (input: {
    nodeId: string;
    title: string;
    summary?: string;
    content: string;
  }) => Promise<string>;
  onSaveDraft: (draftId: string, patch: StoryManuscriptDraftUpdateInput) => void;
  onReject: (draftId: string) => void;
};

export const StoryManuscriptsModule = ({
  story,
  onAccept,
  onCreateDraft,
  onPolishDraft,
  onSaveDraft,
  onReject,
}: StoryManuscriptsModuleProps) => {
  const editRef = useRef<StoryManuscriptEditHandle>(null);
  const pendingDrafts = story.manuscriptInbox.drafts.filter((draft) => draft.status === "pending");

  return (
    <>
      <div className="space-y-5">
        <StorySection
          icon={FileText}
          title="待收稿"
          description="来自酒馆、聊天框、手写或其他呈现端的候选稿件。"
          meta={`${pendingDrafts.length} 待处理`}
          action={(
            <Button
              type="button"
              size="sm"
              variant="outline"
              className={editorHeaderActionButtonClassName}
              onClick={() => editRef.current?.create()}
            >
              <Plus className="size-3.5" />
              手写
            </Button>
          )}
        >
          {pendingDrafts.length === 0 ? (
            <EmptyBlock text="暂无待收稿内容" />
          ) : (
            <div className="space-y-3">
              {pendingDrafts.map((draft) => (
                <div key={draft.id} className="rounded-md border bg-background/80 p-3">
                  <div className="mb-2 flex min-w-0 items-start justify-between gap-3">
                    <button
                      type="button"
                      className="min-w-0 text-left"
                      onClick={() => editRef.current?.edit(draft)}
                    >
                      <div className="flex min-w-0 flex-wrap items-center gap-2">
                        <div className={editorListEntryTitleClassName}>{draft.title}</div>
                        <Badge variant="secondary">{manuscriptSourceLabels[draft.source]}</Badge>
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        节点：{draft.nodeId} · {new Date(draft.createdAt).toLocaleString()}
                      </div>
                    </button>
                    <div className="flex shrink-0 items-center gap-1">
                      <Button
                        type="button"
                        size="icon-xs"
                        variant="ghost"
                        className={editorIconActionButtonClassName}
                        onClick={() => onAccept(draft.id)}
                        title="收稿"
                        aria-label="收稿"
                      >
                        <Check className="size-4" />
                      </Button>
                      <Button
                        type="button"
                        size="icon-xs"
                        variant="ghost"
                        className={editorDangerIconActionButtonClassName}
                        onClick={() => onReject(draft.id)}
                        title="退回"
                        aria-label="退回"
                      >
                        <X className="size-4" />
                      </Button>
                    </div>
                  </div>
                  <div className={`line-clamp-2 ${editorListEntryBodyClassName}`}>
                    {draft.summary || draft.content}
                  </div>
                </div>
              ))}
            </div>
          )}
        </StorySection>

        <StorySection
          icon={ScrollText}
          title="收稿记录"
          meta={`${story.manuscriptInbox.accepted.length} 已收稿`}
        >
          {story.manuscriptInbox.accepted.length === 0 ? (
            <EmptyBlock text="暂无已收稿内容" />
          ) : (
            <div className="space-y-3">
              {story.manuscriptInbox.accepted.map((accepted) => (
                <div key={accepted.id} className="rounded-md border bg-background/80 p-3">
                  <div className="flex min-w-0 flex-wrap items-center gap-2">
                    <div className={editorListEntryTitleClassName}>{accepted.title}</div>
                    <Badge variant="outline">{manuscriptSourceLabels[accepted.source]}</Badge>
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    节点：{accepted.nodeId} · {new Date(accepted.acceptedAt).toLocaleString()}
                  </div>
                  <div className={`mt-2 line-clamp-2 ${editorListEntryBodyClassName}`}>
                    {accepted.summary || accepted.content}
                  </div>
                </div>
              ))}
            </div>
          )}
        </StorySection>
      </div>

      <StoryManuscriptEdit
        bind={editRef}
        story={story}
        onAccept={onAccept}
        onCreate={onCreateDraft}
        onPolish={onPolishDraft}
        onSave={onSaveDraft}
        onReject={onReject}
      />
    </>
  );
};
