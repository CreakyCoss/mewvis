import { memo, useState } from "react";
import { BrainIcon, ChevronDownIcon, Loader2Icon } from "lucide-react";
import type { ChatAssistantMessageBlock } from "../../../type";

type ThinkingBlockProps = {
  block: Extract<ChatAssistantMessageBlock, { type: "thinking" }>;
  isActive: boolean;
};

const ThinkingBlockComponent = ({ block, isActive }: ThinkingBlockProps) => {
  const [manualExpanded, setManualExpanded] = useState<boolean>();
  const isExpanded = manualExpanded ?? !block.isCollapsed;

  return (
    <div className="overflow-hidden rounded-md bg-muted/35 shadow-xs">
      <button
        type="button"
        aria-expanded={isExpanded}
        className="flex w-full cursor-pointer items-center gap-2 px-2.5 py-1.5 text-left text-xs font-medium text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
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
          <Loader2Icon aria-hidden="true" className="ml-auto size-3 animate-spin motion-reduce:animate-none" />
        ) : null}
      </button>
      <div
        className={`grid transition-[grid-template-rows,opacity] duration-200 ease-out motion-reduce:transition-none ${
          isExpanded ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
        }`}
      >
        <div className="min-h-0 overflow-hidden">
          <div className="max-h-48 overflow-auto bg-background/45 px-2.5 py-2 text-xs leading-5 whitespace-pre-wrap text-muted-foreground">
            {block.content}
          </div>
        </div>
      </div>
    </div>
  );
};

export const ThinkingBlock = memo(ThinkingBlockComponent);
