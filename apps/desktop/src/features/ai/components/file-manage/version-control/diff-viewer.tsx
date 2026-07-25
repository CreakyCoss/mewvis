import type { RefObject } from "react";
import { cn } from "@/lib/utils";
import type { SideBySideDiffRow } from "./types";

type SideBySideDiffViewerProps = {
  rows: SideBySideDiffRow[];
  activeRowIndex?: number;
  rowRefs?: RefObject<Map<number, HTMLDivElement>>;
};

export const SideBySideDiffViewer = ({ rows, activeRowIndex = -1, rowRefs }: SideBySideDiffViewerProps) => (
  <div className="min-w-0 p-3 text-[12px] leading-5">
    <div className="sticky top-0 z-10 grid grid-cols-[2.65rem_minmax(0,1fr)_2.65rem_minmax(0,1fr)] overflow-hidden rounded-t-md border border-border/60 bg-muted/70 text-xs font-medium text-muted-foreground">
      <div className="border-r border-border/60 px-2 py-1.5 text-right">行</div>
      <div className="border-r border-border/60 px-3 py-1.5">变更前</div>
      <div className="border-r border-border/60 px-2 py-1.5 text-right">行</div>
      <div className="px-3 py-1.5">变更后</div>
    </div>
    <div className="overflow-hidden rounded-b-md border-x border-b border-border/60">
      {rows.map((row, index) => {
        if ("text" in row) {
          return (
            <div
              key={`${row.kind}-${index}`}
              className="border-b border-border/50 bg-muted/45 px-3 py-1.5 font-mono text-xs text-muted-foreground last:border-b-0"
            >
              {row.text}
            </div>
          );
        }

        const oldChanged = row.kind === "removed" || row.kind === "changed";
        const newChanged = row.kind === "added" || row.kind === "changed";
        const oldEmpty = row.kind === "added";
        const newEmpty = row.kind === "removed";
        const isActiveChangeRow = index === activeRowIndex;

        return (
          <div
            key={`${row.kind}-${index}`}
            ref={(node) => {
              if (!rowRefs) {
                return;
              }
              if (node) {
                rowRefs.current.set(index, node);
              } else {
                rowRefs.current.delete(index);
              }
            }}
            className={cn(
              "grid grid-cols-[2.65rem_minmax(0,1fr)_2.65rem_minmax(0,1fr)] border-b border-border/40 last:border-b-0",
              isActiveChangeRow && "ring-2 ring-primary/45 ring-inset",
            )}
          >
            <div
              className={cn(
                "border-r border-border/50 px-2 py-1 text-right font-mono text-xs text-muted-foreground",
                oldChanged && "bg-destructive/10 text-destructive",
                oldEmpty && "bg-muted/25",
              )}
            >
              {row.oldLine ?? ""}
            </div>
            <pre
              className={cn(
                "min-h-5 whitespace-pre-wrap break-words border-r border-border/50 px-3 py-1 font-mono text-xs text-foreground",
                oldChanged && "bg-destructive/10 text-destructive",
                oldEmpty && "bg-muted/25 text-muted-foreground",
              )}
            >
              {oldChanged ? "- " : "  "}
              {row.oldText || " "}
            </pre>
            <div
              className={cn(
                "border-r border-border/50 px-2 py-1 text-right font-mono text-xs text-muted-foreground",
                newChanged && "bg-success/10 text-success",
                newEmpty && "bg-muted/25",
              )}
            >
              {row.newLine ?? ""}
            </div>
            <pre
              className={cn(
                "min-h-5 whitespace-pre-wrap break-words px-3 py-1 font-mono text-xs text-foreground",
                newChanged && "bg-success/10 text-success",
                newEmpty && "bg-muted/25 text-muted-foreground",
              )}
            >
              {newChanged ? "+ " : "  "}
              {row.newText || " "}
            </pre>
          </div>
        );
      })}
    </div>
  </div>
);
