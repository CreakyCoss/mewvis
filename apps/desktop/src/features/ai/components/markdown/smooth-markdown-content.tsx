import { memo, useCallback, useEffect, useRef, useState } from "react";
import { MarkdownContent } from "./markdown-content";
import {
  getMarkdownInputContent,
  getMarkdownMessageContent,
  isMarkdownMessageStreaming,
} from "./message";
import type { SmoothMarkdownContentProps, SmoothPlainTextProps } from "./types";

const MIN_CHARS_PER_FRAME = 2;
const MAX_CHARS_PER_FRAME = 16;
const TARGET_FRAMES_TO_CATCH_UP = 18;

const getNextChunkSize = (remainingLength: number) =>
  Math.min(
    remainingLength,
    Math.max(
      MIN_CHARS_PER_FRAME,
      Math.min(
        MAX_CHARS_PER_FRAME,
        Math.ceil(remainingLength / TARGET_FRAMES_TO_CATCH_UP),
      ),
    ),
  );

const useSmoothedStreamText = (content: string, isStreaming: boolean) => {
  const [visibleContent, setVisibleContent] = useState(content);
  const visibleContentRef = useRef(content);
  const targetContentRef = useRef(content);
  const isStreamingRef = useRef(isStreaming);
  const shouldFinishSmoothlyRef = useRef(false);
  const frameRef = useRef<number | null>(null);

  const cancelFrame = useCallback(() => {
    if (frameRef.current !== null) {
      window.cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    }
  }, []);

  useEffect(() => () => {
    cancelFrame();
  }, [cancelFrame]);

  useEffect(() => {
    isStreamingRef.current = isStreaming;
    if (isStreaming) {
      shouldFinishSmoothlyRef.current = true;
    }
    targetContentRef.current = content;
    const shouldSmoothAppend =
      content.startsWith(visibleContentRef.current) &&
      (isStreaming || shouldFinishSmoothlyRef.current);

    if (!shouldSmoothAppend) {
      cancelFrame();
      shouldFinishSmoothlyRef.current = false;
      visibleContentRef.current = content;
      setVisibleContent(content);
      return undefined;
    }

    if (visibleContentRef.current === targetContentRef.current) {
      if (!isStreaming) {
        shouldFinishSmoothlyRef.current = false;
      }
      return undefined;
    }

    const step = () => {
      frameRef.current = null;
      const currentContent = visibleContentRef.current;
      const targetContent = targetContentRef.current;

      if (currentContent === targetContent) {
        if (!isStreamingRef.current) {
          shouldFinishSmoothlyRef.current = false;
        }
        return;
      }

      if (!targetContent.startsWith(currentContent)) {
        shouldFinishSmoothlyRef.current = false;
        visibleContentRef.current = targetContent;
        setVisibleContent(targetContent);
        return;
      }

      const remainingLength = targetContent.length - currentContent.length;
      const nextLength = currentContent.length + getNextChunkSize(remainingLength);
      const nextContent = targetContent.slice(0, nextLength);

      visibleContentRef.current = nextContent;
      setVisibleContent(nextContent);

      if (nextContent !== targetContentRef.current) {
        frameRef.current = window.requestAnimationFrame(step);
      } else if (!isStreamingRef.current) {
        shouldFinishSmoothlyRef.current = false;
      }
    };

    if (visibleContentRef.current !== targetContentRef.current && frameRef.current === null) {
      frameRef.current = window.requestAnimationFrame(step);
    }
  }, [cancelFrame, content, isStreaming]);

  const shouldRenderSmoothContent =
    content.startsWith(visibleContentRef.current) &&
    (isStreaming || shouldFinishSmoothlyRef.current);

  return shouldRenderSmoothContent ? visibleContent : content;
};

const SmoothMarkdownContentComponent = (props: SmoothMarkdownContentProps) => {
  const {
    className,
    emClassName,
    inverted,
    isStreaming,
    separateEmphasisBlocks,
    variant,
  } = props;
  const content = getMarkdownInputContent(props);
  const shouldStream = isStreaming ?? (
    props.message ? isMarkdownMessageStreaming(props.message) : false
  );
  const visibleContent = useSmoothedStreamText(content, shouldStream);

  return (
    <MarkdownContent
      className={className}
      content={visibleContent}
      emClassName={emClassName}
      inverted={inverted}
      separateEmphasisBlocks={separateEmphasisBlocks}
      variant={variant}
    />
  );
};

export const SmoothMarkdownContent = memo(SmoothMarkdownContentComponent);

const SmoothPlainTextComponent = ({
  content,
  message,
  fallback,
  isStreaming,
}: SmoothPlainTextProps) => {
  const sourceContent = content ?? (
    message ? getMarkdownMessageContent(message) : ""
  );
  const shouldStream = isStreaming ?? (
    message ? isMarkdownMessageStreaming(message) : false
  );
  const visibleContent = useSmoothedStreamText(sourceContent, shouldStream);
  const renderedContent = visibleContent.trim() || fallback || "";

  return <>{renderedContent}</>;
};

export const SmoothPlainText = memo(SmoothPlainTextComponent);
