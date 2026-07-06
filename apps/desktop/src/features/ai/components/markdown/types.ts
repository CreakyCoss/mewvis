export type MarkdownMessageVariant = "chat" | "tavern";
export type MarkdownMessageStatus = "loading" | "streaming" | "done" | "error";

export type MarkdownContentMessage =
  | {
      text: string;
      content?: undefined;
      status?: MarkdownMessageStatus;
    }
  | {
      content: string;
      text?: undefined;
      status?: MarkdownMessageStatus;
    };

export type MarkdownContentInput =
  | {
      content: string;
      message?: undefined;
    }
  | {
      content?: undefined;
      message: MarkdownContentMessage;
    };

type MarkdownRenderOptions = {
  className?: string;
  emClassName?: string;
  inverted?: boolean;
  separateEmphasisBlocks?: boolean;
  variant?: MarkdownMessageVariant;
};

export type MarkdownContentProps = MarkdownRenderOptions & MarkdownContentInput;

export type SmoothMarkdownContentProps = MarkdownContentProps & {
  isStreaming?: boolean;
};

export type SmoothPlainTextProps = {
  content?: string;
  message?: MarkdownContentMessage;
  fallback?: string;
  isStreaming?: boolean;
};
