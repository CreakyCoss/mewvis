import { FileTextIcon } from "lucide-react";
import type { ChatUserMessageBlock } from "../../../type";

type FileReferenceBlockProps = {
  block: Extract<ChatUserMessageBlock, { type: "file-reference" }>;
};

export const FileReferenceBlock = ({ block }: FileReferenceBlockProps) => (
  <span
    className="mx-0.5 inline-flex min-w-0 max-w-full items-center gap-1 overflow-hidden rounded-sm bg-primary-foreground/15 px-1.5 py-0.5 text-xs align-middle"
    title={block.path}
  >
    <FileTextIcon aria-hidden="true" className="size-3 shrink-0" />
    <span className="min-w-0 flex-1 truncate">{block.path.split(/[\\/]/).at(-1) || block.path}</span>
  </span>
);
