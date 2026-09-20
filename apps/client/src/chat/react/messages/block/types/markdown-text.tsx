import { Markdown } from "design-system/components/markdown";
import type { TextBlockValue } from "./text";

type MarkdownTextBlockProps = {
  block: TextBlockValue;
};

export const MarkdownTextBlock = ({ block }: MarkdownTextBlockProps) => (
  <div className="min-w-0 max-w-full overflow-hidden">
    <Markdown content={block.content} />
  </div>
);
