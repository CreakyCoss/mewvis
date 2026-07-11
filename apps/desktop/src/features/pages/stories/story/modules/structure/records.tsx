import { ClipboardCheck, FileInput, ScanSearch } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { StoryProject } from "../../../story-contract";
import { StructureCard, StructureHeader } from "./shared";

const emptyStateClassName = "rounded-lg border border-dashed p-5 text-sm leading-6 text-muted-foreground";

export const StoryCreationRecords = ({ project }: { project: StoryProject }) => (
  <div className="space-y-4">
    <StructureHeader
      icon={ClipboardCheck}
      title="创作记录"
      description="查看创作助手产生的拆文分析、导入记录和审稿结果。记录均为经过校验的结构化 JSON。"
    />

    <div className="grid gap-4 xl:grid-cols-3">
      <StructureCard title="拆文分析" description="长短篇对标、当前故事和导入源分析。">
        <div className="space-y-2">
          {project.analyses.length === 0 ? (
            <p className={emptyStateClassName}>暂无拆文分析。</p>
          ) : (
            project.analyses.map((analysis) => (
              <div key={analysis.id} className="rounded-lg border bg-background p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm font-semibold">{analysis.source.title || analysis.id}</span>
                  <Badge variant="outline">{analysis.status}</Badge>
                </div>
                <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                  <ScanSearch className="size-3.5" />
                  {analysis.analysisType === "long" ? "长篇" : "短篇"} · {analysis.target}
                </div>
                <p className="mt-2 line-clamp-3 text-xs leading-5 text-muted-foreground">
                  {analysis.summary || analysis.storyCore || "尚无分析摘要"}
                </p>
              </div>
            ))
          )}
        </div>
      </StructureCard>

      <StructureCard title="审稿与去 AI" description="保留问题证据、严重度、修法和处理状态。">
        <div className="space-y-2">
          {project.reviews.length === 0 ? (
            <p className={emptyStateClassName}>暂无审稿记录。</p>
          ) : (
            project.reviews.map((review) => {
              const openCount = review.findings.filter((finding) => finding.status === "open").length;
              return (
                <div key={review.id} className="rounded-lg border bg-background p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold">
                      {review.reviewType === "deslop" ? "去 AI 味" : "故事审查"}
                    </span>
                    <Badge variant={review.verdict === "approve" ? "secondary" : "outline"}>{review.verdict}</Badge>
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {review.mode} · {review.findings.length} 项 · {openCount} 项待处理
                  </p>
                  <p className="mt-2 line-clamp-3 text-xs leading-5 text-muted-foreground">
                    {review.summary || "尚无审查摘要"}
                  </p>
                </div>
              );
            })
          )}
        </div>
      </StructureCard>

      <StructureCard title="导入记录" description="追踪导入源、篇幅分流、生成范围和警告。">
        <div className="space-y-2">
          {project.imports.length === 0 ? (
            <p className={emptyStateClassName}>暂无导入记录。</p>
          ) : (
            project.imports.map((record) => (
              <div key={record.id} className="rounded-lg border bg-background p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm font-semibold">{record.sourceTitle || record.id}</span>
                  <Badge variant="outline">{record.status}</Badge>
                </div>
                <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                  <FileInput className="size-3.5" />
                  {record.lengthType === "long" ? "长篇" : "短篇"} · {record.chapterCount} 章 · {record.wordCount} 字
                </div>
                {record.warnings.length > 0 ? (
                  <p className="mt-2 line-clamp-3 text-xs leading-5 text-amber-700 dark:text-amber-300">
                    {record.warnings.join("；")}
                  </p>
                ) : null}
              </div>
            ))
          )}
        </div>
      </StructureCard>
    </div>
  </div>
);
