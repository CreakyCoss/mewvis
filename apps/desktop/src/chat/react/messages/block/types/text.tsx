import type { ChatAssistantMessageBlock, ChatUserMessageBlock } from "@/chat/core";

export type TextBlockValue =
  Extract<ChatAssistantMessageBlock, { type: "text" }> | Extract<ChatUserMessageBlock, { type: "text" }>;

type TextBlockProps = {
  block: TextBlockValue;
};

export const TextBlock = ({ block }: TextBlockProps) => <span>{block.content}</span>;
