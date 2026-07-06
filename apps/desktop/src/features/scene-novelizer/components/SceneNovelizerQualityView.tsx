import { AlertTriangle, CheckCircle2, FileText } from "lucide-react";
import { cn } from "@/lib/utils";
import type { SceneNovelDraftQuality } from "../types";

const verdictLabel: Record<SceneNovelDraftQuality["verdict"], string> = {
  pass: "可用",
  warn: "待修",
  fail: "需重写",
};

export const SceneNovelizerQualityView = ({ quality }: { quality: SceneNovelDraftQuality }) => {
  const Icon = quality.verdict === "pass" ? CheckCircle2 : AlertTriangle;

  return (
    <div className="space-y-2 rounded-md border border-current/10 bg-current/[0.045] p-3 text-current shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <Icon className={cn("size-4 shrink-0", quality.verdict === "pass" ? "text-emerald-500" : "text-amber-500")} />
          <span className="text-xs font-semibold">{verdictLabel[quality.verdict]}</span>
        </div>
        <span className="rounded-md bg-current/10 px-2 py-0.5 text-[11px] tabular-nums">{quality.score}</span>
      </div>

      <div className="grid grid-cols-2 gap-1.5 text-[11px] leading-4 opacity-75">
        <span>字数 {quality.charCount}</span>
        <span>段落 {quality.paragraphCount}</span>
        <span>均段 {quality.averageParagraphChars}</span>
        <span>最长 {quality.maxParagraphChars}</span>
      </div>

      {(quality.issues.length > 0 || quality.strengths.length > 0) && (
        <div className="space-y-1.5 border-t border-current/10 pt-2">
          {[...quality.issues.slice(0, 3), ...quality.strengths.slice(0, 2)].map((item) => (
            <div key={item} className="flex gap-1.5 text-[11px] leading-4 opacity-75">
              <FileText className="mt-0.5 size-3 shrink-0" />
              <span>{item}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
