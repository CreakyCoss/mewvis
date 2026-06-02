import {
  Eye,
  FileText,
  FileType,
  Loader2,
  Maximize2,
  Minimize2,
  RotateCcw,
  Save,
  Trash2,
  X,
} from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import type { WorkspaceFile, WorkspaceVersionFileStatus } from "../../types";
import { MarkdownContent } from "../markdown-content";

type FilePanelProps = {
  activeFile: WorkspaceFile | null;
  filePath: string;
  fileContent: string;
  fileError: string;
  fileViewMode: "source" | "preview";
  isMarkdownFile: boolean;
  isFileSaving: boolean;
  isFileDeleting: boolean;
  isFileDiscarding: boolean;
  fileVersionStatus: WorkspaceVersionFileStatus | null;
  previewMode: "side" | "expanded";
  onFilePathChange: (path: string) => void;
  onFileContentChange: (content: string) => void;
  onFileViewModeChange: (mode: "source" | "preview") => void;
  onExpandPreview: () => void;
  onCollapsePreview: () => void;
  onClosePreview: () => void;
  onSaveFile: () => void;
  onDeleteFile: () => void;
  onDiscardFileChanges: () => void;
};

export const FilePanel = ({
  activeFile,
  filePath,
  fileContent,
  fileError,
  fileViewMode,
  isMarkdownFile,
  isFileSaving,
  isFileDeleting,
  isFileDiscarding,
  fileVersionStatus,
  previewMode,
  onFilePathChange,
  onFileContentChange,
  onFileViewModeChange,
  onExpandPreview,
  onCollapsePreview,
  onClosePreview,
  onSaveFile,
  onDeleteFile,
  onDiscardFileChanges,
}: FilePanelProps) => {
  const isNewVersionFile =
    fileVersionStatus?.status === "added" || fileVersionStatus?.status === "untracked";
  const discardLabel = !fileVersionStatus
    ? "撤销修改"
    : isNewVersionFile
    ? "撤销新增"
    : fileVersionStatus.status === "deleted"
    ? "撤销删除"
    : "撤销修改";
  const saveLabel = activeFile ? "保存文件" : "创建文件";
  const isBusy = isFileSaving || isFileDeleting || isFileDiscarding;

  return (
    <section className="flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-background">
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-3 overflow-hidden bg-card/70 px-5 py-3 shadow-[0_10px_28px_-30px_rgb(15_23_42_/_0.35)]">
        <div className="flex min-w-0 flex-1 items-center gap-3 overflow-hidden">
          <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-accent text-primary shadow-xs">
            <FileText className="size-4" />
          </div>
          <div className="min-w-0 flex-1 overflow-hidden">
            <h3 className="text-sm font-semibold">文件预览</h3>
            <p className="truncate text-xs text-muted-foreground">
              {filePath || "选择或新建一个文件"}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {isMarkdownFile && (
            <div className="flex h-9 rounded-md bg-muted/70 p-0.5 shadow-xs">
              <Button
                type="button"
                size="sm"
                variant={fileViewMode === "source" ? "secondary" : "ghost"}
                className="h-7 px-2"
                onClick={() => onFileViewModeChange("source")}
              >
                <FileType className="size-3.5" />
                <span>原文</span>
              </Button>
              <Button
                type="button"
                size="sm"
                variant={fileViewMode === "preview" ? "secondary" : "ghost"}
                className="h-7 px-2"
                onClick={() => onFileViewModeChange("preview")}
              >
                <Eye className="size-3.5" />
                <span>预览</span>
              </Button>
            </div>
          )}
          <div className="flex h-9 rounded-md bg-muted/70 p-0.5 shadow-xs">
            <Button
              type="button"
              size="icon-sm"
              variant="ghost"
              title={previewMode === "expanded" ? "缩回右侧半屏" : "覆盖工作台区域"}
              onClick={previewMode === "expanded" ? onCollapsePreview : onExpandPreview}
            >
              {previewMode === "expanded" ? (
                <Minimize2 className="size-3.5" />
              ) : (
                <Maximize2 className="size-3.5" />
              )}
              <span className="sr-only">
                {previewMode === "expanded" ? "缩回右侧半屏" : "覆盖工作台区域"}
              </span>
            </Button>
            <Button
              type="button"
              size="icon-sm"
              variant="ghost"
              title="关闭文件预览"
              onClick={onClosePreview}
            >
              <X className="size-3.5" />
              <span className="sr-only">关闭文件预览</span>
            </Button>
          </div>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden p-5">
        <Input
          value={filePath}
          onChange={(event) => onFilePathChange(event.currentTarget.value)}
          placeholder="例如：章节/第一章.md"
        />
        {isMarkdownFile && fileViewMode === "preview" ? (
          <ScrollArea className="h-full min-h-0 flex-1 overflow-hidden rounded-md bg-card shadow-xs">
            <div className="mx-auto w-full max-w-4xl p-6">
              {fileContent.trim() ? (
                <MarkdownContent content={fileContent} />
              ) : (
                <div className="flex min-h-64 items-center justify-center text-sm text-muted-foreground">
                  暂无可预览内容
                </div>
              )}
            </div>
          </ScrollArea>
        ) : (
          <Textarea
            value={fileContent}
            onChange={(event) => onFileContentChange(event.currentTarget.value)}
            placeholder="选择文件或输入新文件内容"
            className="min-h-0 flex-1 resize-none overflow-auto bg-card font-mono text-sm leading-6 shadow-xs"
          />
        )}
        {fileError && (
          <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {fileError}
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 bg-card/80 px-5 py-3 shadow-[0_-10px_28px_-30px_rgb(15_23_42_/_0.35)]">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          {fileVersionStatus && (
            <Button
              type="button"
              variant="outline"
              className="border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100 hover:text-amber-800"
              title={
                isNewVersionFile
                  ? "撤销新增：删除这个未提交文件"
                  : `${discardLabel}：恢复到当前提交状态`
              }
              onClick={onDiscardFileChanges}
              disabled={isBusy}
            >
              {isFileDiscarding ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <RotateCcw className="size-4" />
              )}
              <span>{discardLabel}</span>
            </Button>
          )}
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                type="button"
                variant="outline"
                className="border-destructive/30 bg-destructive/5 text-destructive hover:bg-destructive/10 hover:text-destructive"
                title="从工作区删除当前文件"
                disabled={!activeFile || isBusy}
              >
                {isFileDeleting ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Trash2 className="size-4" />
                )}
                <span>删除文件</span>
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>删除当前文件？</AlertDialogTitle>
                <AlertDialogDescription>
                  将从工作区删除 {activeFile?.path ?? filePath}。如果已启用版本控制，
                  这会记录为未提交删除变更，提交后可在历史中查看和恢复。
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>取消</AlertDialogCancel>
                <AlertDialogAction variant="destructive" onClick={onDeleteFile}>
                  删除文件
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
        <Button
          type="button"
          className="min-w-28"
          title={activeFile ? "保存当前文件内容" : "创建并保存这个文件"}
          onClick={onSaveFile}
          disabled={isBusy || !filePath.trim()}
        >
          {isFileSaving ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Save className="size-4" />
          )}
          <span>{saveLabel}</span>
        </Button>
      </div>
    </section>
  );
};
