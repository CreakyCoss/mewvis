export { MarkdownContent } from "./markdown-content";
export { SmoothMarkdownContent, SmoothPlainText } from "./smooth-markdown-content";
export { getMarkdownInputContent, getMarkdownMessageContent, isMarkdownMessageStreaming } from "./message";
export type {
  MarkdownContentInput,
  MarkdownContentMessage,
  MarkdownContentProps,
  MarkdownMessageStatus,
  MarkdownMessageVariant,
  SmoothMarkdownContentProps,
  SmoothPlainTextProps,
} from "./types";

export const isMarkdownPath = (path: string) => /\.(md|markdown|mdown)$/i.test(path);
