import { useCallback, useEffect, useRef, type UIEventHandler } from "react";

const BOTTOM_FOLLOW_THRESHOLD = 48;

export const useFollowBottom = (content: unknown, enabled = true, additionalContent?: unknown) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const shouldFollowBottomRef = useRef(true);

  useEffect(() => {
    if (!enabled || !shouldFollowBottomRef.current) {
      return undefined;
    }

    const frame = window.requestAnimationFrame(() => {
      const container = scrollRef.current;
      if (container && shouldFollowBottomRef.current) {
        container.scrollTop = container.scrollHeight;
      }
    });

    return () => window.cancelAnimationFrame(frame);
  }, [additionalContent, content, enabled]);

  const handleScroll = useCallback<UIEventHandler<HTMLDivElement>>((event) => {
    const container = event.currentTarget;
    const distanceToBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
    shouldFollowBottomRef.current = distanceToBottom <= BOTTOM_FOLLOW_THRESHOLD;
  }, []);

  return {
    scrollRef,
    handleScroll,
  };
};
