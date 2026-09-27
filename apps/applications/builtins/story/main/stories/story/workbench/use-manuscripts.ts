import { useEffect, useRef, useState } from "react";
import type { Chapter } from "./model";
import { createManuscriptDrafts } from "./manuscript-drafts";
import { useStoryState } from "../use-story-state";

export function useManuscripts(chapters: Chapter[]) {
  const [version, refresh] = useState(0);
  const controller = useRef<ReturnType<typeof createManuscriptDrafts> | null>(
    null,
  );
  if (!controller.current)
    controller.current = createManuscriptDrafts(
      (build) => useStoryState.getState().writeDocuments(build),
      () => useStoryState.getState().storyWorkspace?.path,
      () => refresh((v) => v + 1),
    );
  const drafts = controller.current;
  drafts.sync(chapters);
  useEffect(() => {
    if (!drafts.pending) return;
    const timer = setTimeout(() => void drafts.flush(), 900);
    return () => clearTimeout(timer);
  }, [version, drafts]);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (drafts.dirty) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [drafts]);
  return drafts;
}
