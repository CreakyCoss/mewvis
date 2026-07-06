import { BookOpen, Download, FilePlus2, Loader2, RefreshCcw, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MarkdownContent } from "@/features/ai/components/markdown";
import type { VisualPresetDefinition } from "@/features/pages/taverns/tavern/visual-presets";
import { cn } from "@/lib/utils";
import type {
  QuickNovelExportFormat,
  QuickSummaryTab,
} from "./types";

type QuickSummaryDialogProps = {
  open: boolean;
  tab: QuickSummaryTab;
  visualPreset: VisualPresetDefinition;
  summaryContent: string;
  novelContent: string;
  summaryGeneratedAtText: string;
  novelGeneratedAtText: string;
  isSummaryFresh: boolean;
  isNovelFresh: boolean;
  isGeneratingSummary: boolean;
  isGeneratingNovel: boolean;
  isSubmittingNovelToStory: boolean;
  isSending: boolean;
  error: string;
  exportFormat: QuickNovelExportFormat;
  canSubmitNovelToStory: boolean;
  onOpenChange: (open: boolean) => void;
  onTabChange: (tab: QuickSummaryTab) => void;
  onExportFormatChange: (format: QuickNovelExportFormat) => void;
  onRegenerateSummary: () => void;
  onGenerateNovel: () => void;
  onExportNovel: () => void;
  onSubmitNovelToStory: () => void;
};

export const QuickSummaryDialog = ({
  open,
  tab,
  visualPreset,
  summaryContent,
  novelContent,
  summaryGeneratedAtText,
  novelGeneratedAtText,
  isSummaryFresh,
  isNovelFresh,
  isGeneratingSummary,
  isGeneratingNovel,
  isSubmittingNovelToStory,
  isSending,
  error,
  exportFormat,
  canSubmitNovelToStory,
  onOpenChange,
  onTabChange,
  onExportFormatChange,
  onRegenerateSummary,
  onGenerateNovel,
  onExportNovel,
  onSubmitNovelToStory,
}: QuickSummaryDialogProps) => {
  const summaryDescription = summaryGeneratedAtText
    ? isSummaryFresh
      ? `生成于 ${summaryGeneratedAtText}`
      : `生成于 ${summaryGeneratedAtText}，内容已有变化，可手动重新生成。`
    : isGeneratingSummary
      ? "正在生成当前进展..."
      : "基于当前酒馆内容生成。";
  const novelDescription = novelGeneratedAtText
    ? isNovelFresh
      ? `生成于 ${novelGeneratedAtText}`
      : `生成于 ${novelGeneratedAtText}，内容已有变化，可重新生成。`
    : "";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          "flex max-h-[min(780px,calc(100vh-2rem))] flex-col gap-0 overflow-hidden p-0 sm:max-w-5xl",
          visualPreset.tavern.sidePanel,
        )}
        overlayClassName="bg-black/35 backdrop-blur-sm"
      >
        <DialogHeader
          className={cn(
            "shrink-0 border-b px-5 py-4 pr-12",
            visualPreset.tavern.header,
          )}
        >
          <div className="flex items-center gap-3">
            <span
              className={cn(
                "flex size-9 shrink-0 items-center justify-center rounded-md border",
                visualPreset.tavern.headerIcon,
              )}
            >
              <Sparkles className="size-4" />
            </span>
            <div className="min-w-0">
              <DialogTitle className="truncate text-base text-current">
                当前进展总结
              </DialogTitle>
              <DialogDescription className="mt-1 text-xs text-current opacity-65">
                {summaryDescription}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-5 py-4 text-current">
          {error && (
            <div className="mb-3 shrink-0 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </div>
          )}
          <Tabs
            value={tab}
            onValueChange={(value) => onTabChange(value === "novel" ? "novel" : "summary")}
            className="min-h-0 flex-1 overflow-hidden"
          >
            <TabsList className="grid w-full grid-cols-2 bg-current/10 text-current/65">
              <TabsTrigger value="summary">总结</TabsTrigger>
              <TabsTrigger value="novel">写作</TabsTrigger>
            </TabsList>

            <TabsContent value="summary" className="mt-3 min-h-0 flex-1 overflow-y-auto pr-1">
              {summaryContent ? (
                <section className="rounded-md border border-current/10 bg-current/5 px-4 py-3 text-current shadow-sm">
                  <div className="mb-2 flex flex-wrap items-center gap-2 text-xs font-medium opacity-70">
                    <span>当前进展总结</span>
                    {summaryGeneratedAtText && <span>{summaryDescription}</span>}
                  </div>
                  <MarkdownContent content={summaryContent} />
                </section>
              ) : (
                <div className="flex min-h-56 items-center justify-center rounded-md border border-current/10 bg-current/5 px-4 py-6 text-sm opacity-70">
                  {isGeneratingSummary ? "正在生成当前进展..." : "暂无可显示的总结。"}
                </div>
              )}
            </TabsContent>

            <TabsContent value="novel" className="mt-3 min-h-0 flex-1 overflow-y-auto pr-1">
              <div className="mb-3 flex flex-wrap items-center justify-end gap-2">
                <NativeSelect
                  size="sm"
                  value={exportFormat}
                  className="w-24 bg-current/5 text-xs text-current"
                  aria-label="小说导出格式"
                  disabled={!novelContent.trim()}
                  onChange={(event) => onExportFormatChange(event.target.value === "txt" ? "txt" : "md")}
                >
                  <NativeSelectOption value="md">MD</NativeSelectOption>
                  <NativeSelectOption value="txt">TXT</NativeSelectOption>
                </NativeSelect>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-8 border-current/20 bg-current/5 text-xs text-current hover:bg-current/10 hover:text-current focus-visible:text-current dark:hover:bg-current/10 dark:hover:text-current"
                  disabled={!novelContent.trim()}
                  onClick={onExportNovel}
                >
                  <Download className="size-3.5" />
                  导出小说
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-8 border-current/20 bg-current/5 text-xs text-current hover:bg-current/10 hover:text-current focus-visible:text-current dark:hover:bg-current/10 dark:hover:text-current"
                  disabled={!canSubmitNovelToStory || isSubmittingNovelToStory}
                  onClick={onSubmitNovelToStory}
                >
                  {isSubmittingNovelToStory ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <FilePlus2 className="size-3.5" />
                  )}
                  收为稿件
                </Button>
              </div>
              {novelContent ? (
                <section className="rounded-md border border-current/10 bg-current/5 px-4 py-3 text-current shadow-sm">
                  <div className="mb-2 flex flex-wrap items-center gap-2 text-xs font-medium opacity-70">
                    <span>小说正文</span>
                    {novelDescription && <span>{novelDescription}</span>}
                  </div>
                  <MarkdownContent content={novelContent} />
                </section>
              ) : (
                <div className="flex min-h-56 items-center justify-center rounded-md border border-current/10 bg-current/5 px-4 py-6 text-sm opacity-70">
                  {isGeneratingNovel ? "正在按小说口吻写作..." : "暂无小说正文。"}
                </div>
              )}
            </TabsContent>
          </Tabs>
        </div>

        <DialogFooter
          className={cn(
            "shrink-0 border-t px-5 py-4",
            visualPreset.tavern.header,
          )}
        >
          <Button
            type="button"
            variant="outline"
            className="border-current/20 bg-current/5 text-current hover:bg-current/10 hover:text-current focus-visible:text-current dark:hover:bg-current/10 dark:hover:text-current"
            disabled={isGeneratingSummary || isGeneratingNovel || isSending}
            onClick={onRegenerateSummary}
          >
            <RefreshCcw className="size-4" />
            重新生成
          </Button>
          <Button
            type="button"
            variant="outline"
            className="border-current/20 bg-current/5 text-current hover:bg-current/10 hover:text-current focus-visible:text-current dark:hover:bg-current/10 dark:hover:text-current"
            disabled={isGeneratingSummary || isGeneratingNovel || isSending}
            onClick={onGenerateNovel}
          >
            <BookOpen className="size-4" />
            {isGeneratingNovel ? "写作中" : novelContent ? "重新写作" : "生成小说"}
          </Button>
          <Button
            type="button"
            onClick={() => onOpenChange(false)}
          >
            关闭
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
