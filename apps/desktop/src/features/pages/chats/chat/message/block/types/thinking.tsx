import { memo, useEffect, useState } from "react";
import { BrainIcon, ChevronDownIcon, Loader2Icon } from "lucide-react";
import type { ChatAssistantMessageBlock } from "../../../type";
import { BLOCK_AUTO_COLLAPSE_DELAY } from "../constants";

type ThinkingBlockProps = {
  block: Extract<ChatAssistantMessageBlock, { type: "thinking" }>;
  isActive: boolean;
};

const ThinkingBlockComponent = ({ block, isActive }: ThinkingBlockProps) => {
  const [manualExpanded, setManualExpanded] = useState<boolean>();
  const [autoExpanded, setAutoExpanded] = useState(isActive);
  const isExpanded = manualExpanded ?? autoExpanded;

  useEffect(() => {
    if (isActive) {
      setAutoExpanded(true);
      return undefined;
    }

    const timer = window.setTimeout(() => setAutoExpanded(false), BLOCK_AUTO_COLLAPSE_DELAY);
    return () => window.clearTimeout(timer);
  }, [isActive]);

  return (
    <div className="app-process-block overflow-hidden rounded-xl">
      <button
        type="button"
        aria-expanded={isExpanded}
        className="app-process-trigger flex w-full cursor-pointer items-center gap-2 px-3 text-left text-xs font-medium text-muted-foreground outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/25 focus-visible:ring-inset"
        onClick={() => setManualExpanded(!isExpanded)}
      >
        <ChevronDownIcon
          aria-hidden="true"
          className={`size-3.5 shrink-0 transition-transform motion-reduce:transition-none ${
            isExpanded ? "" : "-rotate-90"
          }`}
        />
        <BrainIcon aria-hidden="true" className="size-3.5 shrink-0" />
        <span>思考过程</span>
        {isActive ? (
          <Loader2Icon aria-hidden="true" className="ml-auto size-3.5 animate-spin motion-reduce:animate-none" />
        ) : null}
      </button>
      <div
        className={`grid transition-[grid-template-rows,opacity] duration-200 ease-out motion-reduce:transition-none ${
          isExpanded ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
        }`}
      >
        <div className="min-h-0 overflow-hidden">
          <div className="app-process-content max-h-56 overflow-auto px-3 py-2.5 text-xs leading-5 whitespace-pre-wrap text-muted-foreground">
            {block.content}
          </div>
        </div>
      </div>
    </div>
  );
};

export const ThinkingBlock = memo(ThinkingBlockComponent);
