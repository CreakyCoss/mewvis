import { useEffect, useRef, type RefObject } from "react";
export interface ContentFocus {
  key: string;
  sequence: number;
}
/** Resolve the rendered editor after navigation, without interpolating user IDs into CSS selectors. */
export function useContentFocus(
  root: RefObject<HTMLElement | null>,
  view: string,
  request: ContentFocus | null,
) {
  const applied = useRef(-1);
  useEffect(() => {
    if (!request?.key || applied.current === request.sequence) return;
    const frame = requestAnimationFrame(() => {
      const target = Array.from(
        root.current?.querySelectorAll<HTMLElement>("[data-content-key]") ?? [],
      ).find((element) => element.dataset.contentKey === request.key);
      if (target) applied.current = request.sequence;
      target?.scrollIntoView({ block: "center" });
      target?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [root, view, request]);
}
