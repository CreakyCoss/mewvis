import { Eye, FileText, FileType, Loader2, Maximize2, Minimize2, Save, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import type { WorkspaceFile } from "../../types";
import { MarkdownContent } from "../markdown-content";

type FilePanelProps = {
  activeFile: WorkspaceFile | null;
  filePath: string;
  fileContent: string;
  fileError: string;
  fileViewMode: "source" | "preview";
  isMarkdownFile: boolean;
  isFileSaving: boolean;
  previewMode: "side" | "expanded";
  onFilePathChange: (path: string) => void;
  onFileContentChange: (content: string) => void;
  onFileViewModeChange: (mode: "source" | "preview") => void;
  onExpandPreview: () => void;
  onCollapsePreview: () => void;
  onClosePreview: () => void;
  onSaveFile: () => void;
};

export const FilePanel = ({
  activeFile,
  filePath,
  fileContent,
  fileError,
  fileViewMode,
  isMarkdownFile,
  isFileSaving,
  previewMode,
  onFilePathChange,
  onFileContentChange,
  onFileViewModeChange,
  onExpandPreview,
  onCollapsePreview,
  onClosePreview,
  onSaveFile,
}: FilePanelProps) => (
  <section className="flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-background">
    <div className="flex flex-wrap items-center justify-between gap-3 bg-card/70 px-5 py-3 shadow-[0_10px_28px_-30px_rgb(15_23_42_/_0.35)]">
      <div className="flex min-w-0 items-center gap-3">
        <div className="flex size-8 items-center justify-center rounded-md bg-accent text-primary shadow-xs">
          <FileText className="size-4" />
        </div>
        <div className="min-w-0">
          <h3 className="text-sm font-semibold">文件预览</h3>
          <p className="truncate text-xs text-muted-foreground">
            {filePath || "选择或新建一个文件"}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2">
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
        placeholder="例如：chapters/01.md"
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

    <div className="flex justify-end bg-card/80 px-5 py-3 shadow-[0_-10px_28px_-30px_rgb(15_23_42_/_0.35)]">
      <Button
        type="button"
        onClick={onSaveFile}
        disabled={isFileSaving || !filePath.trim()}
      >
        {isFileSaving ? (
          <Loader2 className="size-4 animate-spin" />
        ) : (
          <Save className="size-4" />
        )}
        <span>{activeFile ? "保存修改" : "创建文件"}</span>
      </Button>
    </div>
  </section>
);
