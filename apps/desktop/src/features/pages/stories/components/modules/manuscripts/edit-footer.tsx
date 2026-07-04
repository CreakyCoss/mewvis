import { Check, Loader2, Save, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DialogFooter } from "@/components/ui/dialog";
import type { StoryManuscriptDraft } from "@/features/story/model/manuscript-inbox";
import type {
  ManuscriptEditDraft,
  ManuscriptEditMode,
} from "./edit-types";

type StoryManuscriptEditFooterProps = {
  draft: StoryManuscriptDraft | null;
  editDraft: ManuscriptEditDraft;
  isPolishing: boolean;
  mode: ManuscriptEditMode;
  onAcceptDraft: () => void;
  onClose: () => void;
  onPolish: () => void;
  onRejectDraft: () => void;
};

export const StoryManuscriptEditFooter = ({
  draft,
  editDraft,
  isPolishing,
  mode,
  onAcceptDraft,
  onClose,
  onPolish,
  onRejectDraft,
}: StoryManuscriptEditFooterProps) => (
  <DialogFooter>
    <Button type="button" variant="outline" onClick={onClose}>
      关闭
    </Button>
    <Button
      type="button"
      variant="outline"
      className="gap-2"
      disabled={isPolishing || !editDraft.nodeId}
      onClick={onPolish}
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
          onClick={onRejectDraft}
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
          onClick={onAcceptDraft}
        >
          <Check className="size-4" />
          保存并收稿
        </Button>
      </>
    ) : null}
  </DialogFooter>
);
