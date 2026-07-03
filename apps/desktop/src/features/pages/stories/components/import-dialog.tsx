import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  type StoryAsset,
  type StoryImportDraft,
  type StoryImportSourceKind,
} from "@/features/story";
import { StoryImportDraftReview } from "./import-dialog/draft-review";
import { StoryImportSourcePanel } from "./import-dialog/source-panel";

type StoryImportDialogProps = {
  open: boolean;
  activeStory: StoryAsset | null;
  importSourceKind: StoryImportSourceKind;
  importRaw: string;
  importDraft: StoryImportDraft | null;
  setImportSourceKind: (kind: StoryImportSourceKind) => void;
  setImportRaw: (raw: string) => void;
  setImportDraft: (draft: StoryImportDraft | null) => void;
  onOpenChange: (open: boolean) => void;
  onConvert: () => void;
  onImportNewStory: () => void;
  onMergeIntoActiveStory: () => void;
};

export const StoryImportDialog = ({
  open,
  activeStory,
  importSourceKind,
  importRaw,
  importDraft,
  setImportSourceKind,
  setImportRaw,
  setImportDraft,
  onOpenChange,
  onConvert,
  onImportNewStory,
  onMergeIntoActiveStory,
}: StoryImportDialogProps) => (
  <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="!flex h-[min(90vh,52rem)] max-h-[calc(100vh-2rem)] flex-col overflow-hidden sm:max-w-5xl">
      <DialogHeader className="shrink-0">
        <DialogTitle>导入故事</DialogTitle>
        <DialogDescription>
          JSON、纯文本、角色卡和世界书会先转换为标准故事草稿，确认后再写入故事资产。
        </DialogDescription>
      </DialogHeader>

      <div className="min-h-0 flex-1 overflow-y-auto pr-1 lg:overflow-hidden">
        <div className="grid min-h-0 gap-4 lg:h-full lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
          <div className="min-h-0 lg:overflow-y-auto lg:pr-1">
            <StoryImportSourcePanel
              importRaw={importRaw}
              importSourceKind={importSourceKind}
              onConvert={onConvert}
              setImportDraft={setImportDraft}
              setImportRaw={setImportRaw}
              setImportSourceKind={setImportSourceKind}
            />
          </div>
          <div className="min-h-0 lg:flex">
            <StoryImportDraftReview
              importDraft={importDraft}
              setImportDraft={setImportDraft}
            />
          </div>
        </div>
      </div>

      <DialogFooter className="shrink-0">
        <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
          取消
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={onMergeIntoActiveStory}
          disabled={!importDraft || !activeStory}
        >
          合并到当前故事
        </Button>
        <Button
          type="button"
          onClick={onImportNewStory}
          disabled={!importDraft || importDraft.mode === "lorebookPatch"}
        >
          导入为新故事
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
);
