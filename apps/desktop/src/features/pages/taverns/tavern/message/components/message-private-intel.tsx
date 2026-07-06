import { KeyRound } from "lucide-react";
import { cn } from "@/lib/utils";
import type { TavernFactEvent } from "@/features/pages/taverns/manage/model";

type MessagePrivateIntelProps = {
  align: "left" | "right" | "center";
  factEvents?: TavernFactEvent[];
};

const formatFactType = (type: string) => type.replace(/[_-]+/g, " ").trim();

export const MessagePrivateIntel = ({ align, factEvents }: MessagePrivateIntelProps) => {
  if (!factEvents || factEvents.length === 0) {
    return null;
  }

  return (
    <div
      className={cn(
        "mt-2 flex w-full flex-col gap-1.5",
        align === "right" && "items-end",
        align === "center" && "items-center",
        align === "left" && "items-start",
      )}
    >
      {factEvents.map((factEvent) => (
        <div
          key={factEvent.id}
          className="w-fit max-w-full rounded-md border border-primary/25 bg-primary/10 px-2.5 py-2 text-xs leading-5 text-current shadow-sm"
          aria-label="我的情报"
        >
          <div className="mb-1 flex flex-wrap items-center gap-1.5 font-medium">
            <KeyRound className="size-3.5 shrink-0 text-primary" />
            <span>我的情报</span>
            {formatFactType(factEvent.type) && (
              <span className="rounded-[4px] bg-current/10 px-1.5 py-0.5 text-[10px] leading-none opacity-70">
                {formatFactType(factEvent.type)}
              </span>
            )}
          </div>
          <p className="whitespace-pre-wrap break-words opacity-85">{factEvent.evidence}</p>
        </div>
      ))}
    </div>
  );
};
