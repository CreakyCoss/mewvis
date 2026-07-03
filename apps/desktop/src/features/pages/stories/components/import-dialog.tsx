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
  type StoryJson,
  type StoryImportSourceKind,
} from "@/features/story";
import { StoryImportSourcePanel } from "./import-dialog/source-panel";
import { StoryJsonImportReview } from "./import-dialog/story-json-review";

type StoryImportDialogProps = {
  open: boolean;
  activeStory: StoryJson | null;
  importSourceKind: StoryImportSourceKind;
  importRaw: string;
  importStory: StoryJson | null;
  isConvertingImport: boolean;
  setImportSourceKind: (kind: StoryImportSourceKind) => void;
  setImportRaw: (raw: string) => void;
  setImportStory: (story: StoryJson | null) => void;
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
  importStory,
  isConvertingImport,
  setImportSourceKind,
  setImportRaw,
  setImportStory,
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
          标准 JSON 会直接读取；非标准来源会由 AI 转换为 story.json。
        </DialogDescription>
      </DialogHeader>

      <div className="min-h-0 flex-1 overflow-y-auto pr-1 lg:overflow-hidden">
        <div className="grid min-h-0 gap-4 lg:h-full lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
          <div className="min-h-0 lg:overflow-y-auto lg:pr-1">
            <StoryImportSourcePanel
              importRaw={importRaw}
              importSourceKind={importSourceKind}
              isConverting={isConvertingImport}
              onConvert={onConvert}
              setImportRaw={setImportRaw}
              setImportSourceKind={setImportSourceKind}
              setImportStory={setImportStory}
            />
          </div>
          <div className="min-h-0 lg:flex">
            <StoryJsonImportReview story={importStory} />
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
          disabled={isConvertingImport || (!importStory && !importRaw.trim()) || !activeStory}
        >
          合并到当前故事
        </Button>
        <Button
          type="button"
          onClick={onImportNewStory}
          disabled={isConvertingImport || !importStory}
        >
          导入为新故事
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
);
