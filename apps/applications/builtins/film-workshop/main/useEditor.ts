import { useCallback, useEffect, useRef, useState } from "react";
import type { FilmProject } from "./model";
import type { createRepository } from "./repository";

export type FilmRepository = ReturnType<typeof createRepository>;
export function useEditor(
  initial: FilmProject,
  repository: FilmRepository,
  onSaved: (project: FilmProject) => void,
) {
  const [project, setProject] = useState(initial);
  const [status, setStatus] = useState<"saved" | "dirty" | "saving" | "error">(
    "saved",
  );
  const [error, setError] = useState("");
  const current = useRef(project),
    saved = useRef(initial),
    active = useRef(true);
  const callback = useRef(onSaved);
  callback.current = onSaved;
  const pending = useRef<
    { project: FilmProject; promise: Promise<void> } | undefined
  >(undefined);
  const edit = useCallback((update: (project: FilmProject) => FilmProject) => {
    const changed = update(current.current);
    if (changed === current.current) return;
    const next = { ...changed, updatedAt: Date.now() };
    current.current = next;
    setProject(next);
    setStatus("dirty");
    setError("");
  }, []);
  const save = useCallback(async () => {
    const snapshot = current.current;
    if (snapshot === saved.current) return;
    if (pending.current?.project === snapshot) return pending.current.promise;
    setStatus("saving");
    setError("");
    const promise = Promise.resolve()
      .then(() => repository.save(snapshot))
      .then(() => {
        saved.current = snapshot;
        callback.current(snapshot);
        if (active.current) {
          setStatus(current.current === snapshot ? "saved" : "dirty");
          setError("");
        }
      })
      .catch((reason: unknown) => {
        if (active.current && current.current === snapshot) {
          setStatus("error");
          setError(reason instanceof Error ? reason.message : String(reason));
        }
        throw reason;
      })
      .finally(() => {
        if (pending.current?.promise === promise) pending.current = undefined;
      });
    pending.current = { project: snapshot, promise };
    return promise;
  }, [repository]);
  const flush = useCallback(async () => {
    while (current.current !== saved.current) await save();
  }, [save]);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  useEffect(() => {
    if (project === saved.current) return;
    const timer = setTimeout(() => {
      void save().catch(() => {});
    }, 650);
    return () => clearTimeout(timer);
  }, [project, save]);
  useEffect(() => {
    const listener = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        void save().catch(() => {});
      }
    };
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, [save]);
  return { project, edit, save, flush, status, error, current };
}
