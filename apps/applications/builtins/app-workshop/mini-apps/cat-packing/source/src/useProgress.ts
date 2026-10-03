import { useEffect, useRef, useState } from "react";
import { getApplicationViewClient } from "@mewvis/app-sdk/views";
import { freshProgress, restoreProgress, type Progress } from "./progress";

const KEY = "cat-packing-v1";
export function useProgress() {
  const [progress, setProgress] = useState<Progress>(freshProgress);
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [status, setStatus] = useState<"saving" | "saved" | "error">("saved");
  const [attempt, setAttempt] = useState(0);
  const [retry, setRetry] = useState(0);
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const revision = useRef(0);
  useEffect(() => {
    let active = true;
    setLoadError(false);
    getApplicationViewClient()
      .request("state.read", { key: KEY })
      .then((value) => {
        if (!active) return;
        setProgress(restoreProgress(value));
        setReady(true);
      })
      .catch(() => {
        if (active) setLoadError(true);
      });
    return () => {
      active = false;
    };
  }, [attempt]);
  useEffect(() => {
    if (!ready) return;
    let active = true;
    const ownRevision = ++revision.current;
    setStatus("saving");
    // Serialize writes so a slower old board can never replace the newest one.
    queue.current = queue.current
      .catch(() => {})
      .then(() =>
        getApplicationViewClient().request("state.write", {
          key: KEY,
          value: progress,
        }),
      );
    queue.current
      .then(() => {
        if (active && ownRevision === revision.current) setStatus("saved");
      })
      .catch(() => {
        if (active && ownRevision === revision.current) setStatus("error");
      });
    return () => {
      active = false;
    };
  }, [progress, ready, retry]);
  return {
    progress,
    setProgress,
    ready,
    loadError,
    status,
    reload: () => setAttempt((n) => n + 1),
    retrySave: () => setRetry((n) => n + 1),
  };
}
