import { useCallback, useRef } from "react";

const NODE_SAVE_DEBOUNCE_DELAY = 5_000;
const STREAM_SAVE_THROTTLE_DELAY = 10_000;

export const useSaveScheduler = (save: () => Promise<void>) => {
  const nodeSaveTimerRef = useRef<number | null>(null);
  const streamSaveTimerRef = useRef<number | null>(null);

  const cancelScheduledSave = useCallback(() => {
    if (nodeSaveTimerRef.current !== null) {
      window.clearTimeout(nodeSaveTimerRef.current);
      nodeSaveTimerRef.current = null;
    }
    if (streamSaveTimerRef.current !== null) {
      window.clearTimeout(streamSaveTimerRef.current);
      streamSaveTimerRef.current = null;
    }
  }, []);

  const saveImmediately = useCallback(() => {
    cancelScheduledSave();
    return save();
  }, [cancelScheduledSave, save]);

  const nodeCompleted = useCallback(() => {
    if (nodeSaveTimerRef.current !== null) {
      window.clearTimeout(nodeSaveTimerRef.current);
    }

    nodeSaveTimerRef.current = window.setTimeout(() => {
      void saveImmediately();
    }, NODE_SAVE_DEBOUNCE_DELAY);
  }, [saveImmediately]);

  const streamChanged = useCallback(() => {
    if (streamSaveTimerRef.current !== null) {
      return;
    }

    streamSaveTimerRef.current = window.setTimeout(() => {
      void saveImmediately();
    }, STREAM_SAVE_THROTTLE_DELAY);
  }, [saveImmediately]);

  const flush = useCallback(() => {
    const hasScheduledSave = nodeSaveTimerRef.current !== null || streamSaveTimerRef.current !== null;
    cancelScheduledSave();
    return hasScheduledSave ? save() : Promise.resolve();
  }, [cancelScheduledSave, save]);

  return {
    saveImmediately,
    nodeCompleted,
    streamChanged,
    flush,
  };
};
