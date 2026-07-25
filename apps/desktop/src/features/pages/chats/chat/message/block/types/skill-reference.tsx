import { SparklesIcon } from "lucide-react";
import type { ChatUserMessageBlock } from "../../../type";

type SkillReferenceBlockProps = {
  block: Extract<ChatUserMessageBlock, { type: "skill-reference" }>;
};

export const SkillReferenceBlock = ({ block }: SkillReferenceBlockProps) => (
  <span
    className="inline-flex min-w-0 max-w-full items-center gap-1 overflow-hidden rounded-sm bg-primary-foreground/15 px-1.5 py-0.5 text-xs"
    title={block.name}
  >
    <SparklesIcon aria-hidden="true" className="size-3 shrink-0" />
    <span className="min-w-0 flex-1 truncate">{block.name}</span>
  </span>
);
