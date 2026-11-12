import { useCallback, useEffect, useRef, useState } from "react";
import type { BoardRecord } from "../records";
import type { BoardCommand } from "../runtime";
import {
  boardPresentationFrames,
  type BoardPresentationFrame,
} from "./presentation";

interface Presentation {
  recordId: string;
  frames: BoardPresentationFrame[];
  index: number;
}
export function useBoardPresentation(enabled: boolean, recordId?: string) {
  const [presentation, setPresentation] = useState<Presentation | null>(null);
  const active = useRef<Presentation | null>(null),
    timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const cancel = useCallback(() => {
    clearTimeout(timer.current);
    active.current = null;
    setPresentation(null);
  }, []);
  const play = useCallback(
    (before: BoardRecord, after: BoardRecord, command: BoardCommand) => {
      cancel();
      if (
        !enabled ||
        document.hidden ||
        window.matchMedia("(prefers-reduced-motion: reduce)").matches
      )
        return;
      const frames = boardPresentationFrames(
        after.model,
        before.final,
        after.final,
        command,
      );
      if (!frames.length) return;
      const next = { recordId: after.id, frames, index: 0 };
      active.current = next;
      setPresentation(next);
    },
    [cancel, enabled],
  );
  const current =
    enabled && presentation?.recordId === recordId ? presentation : null;
  useEffect(() => {
    if (!enabled || presentation?.recordId !== recordId) {
      if (active.current) cancel();
      return;
    }
    if (!presentation) return;
    timer.current = setTimeout(() => {
      if (active.current !== presentation) return;
      const index = presentation.index + 1;
      if (index >= presentation.frames.length) cancel();
      else {
        const next = { ...presentation, index };
        active.current = next;
        setPresentation(next);
      }
    }, presentation.frames[presentation.index].duration);
    return () => clearTimeout(timer.current);
  }, [enabled, presentation, recordId, cancel]);
  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    const visibility = () => {
      if (document.hidden) cancel();
    };
    const preference = () => {
      if (reduced.matches) cancel();
    };
    document.addEventListener("visibilitychange", visibility);
    reduced.addEventListener("change", preference);
    return () => {
      clearTimeout(timer.current);
      active.current = null;
      document.removeEventListener("visibilitychange", visibility);
      reduced.removeEventListener("change", preference);
    };
  }, [cancel]);
  return {
    frame: current?.frames[current.index] ?? null,
    running: !!current,
    pending: () => !!active.current,
    play,
    cancel,
  };
}
