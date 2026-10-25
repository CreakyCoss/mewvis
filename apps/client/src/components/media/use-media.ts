import { useEffect, useRef, useState, type RefObject } from "react";
import type { ApplicationFilePreview, FilePreviewMediaControls, FilePreviewMediaState } from "@mewvis/app-sdk/files";
import { renderFilePreview } from "@mewvis/app-sdk/files/view";
import { useMediaRuntime } from "./runtime";
import { errorText } from "./util";
import type { MediaContentProps } from "./types";

const initialPlayback: FilePreviewMediaState = { currentTime: 0, duration: 0, paused: true, ended: false };

export function useMediaPreview(props: MediaContentProps, root: RefObject<HTMLElement | null>, revision: number) {
  const { filePath, resource, presentation = "inline", layout = "intrinsic", imageScale, mediaControls } = props;
  const sourceKey = resource?.id ?? filePath ?? "";
  const getRuntime = useMediaRuntime();
  const container = useRef<HTMLDivElement>(null);
  const controls = useRef<FilePreviewMediaControls | null>(null);
  const [visible, setVisible] = useState(presentation === "preview");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [playback, setPlayback] = useState(initialPlayback);
  const [metadata, setMetadata] = useState<{ key: string; file: ApplicationFilePreview }>();
  const callbacks = useRef(props);
  callbacks.current = props;

  useEffect(() => {
    if (presentation === "preview" || !root.current || typeof IntersectionObserver === "undefined") {
      setVisible(true);
      return;
    }
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), { rootMargin: "200px" });
    observer.observe(root.current);
    return () => observer.disconnect();
  }, [root, presentation]);

  useEffect(() => {
    if (!visible || !container.current) return;
    const target = container.current;
    let disposed = false;
    let reportedError = "";
    let view: { ready: Promise<void>; close(): void | Promise<void> } | undefined;
    setLoading(true);
    setError("");
    setPlayback(initialPlayback);
    const fail = (reason: unknown) => {
      if (disposed) return;
      const message = errorText(reason);
      if (message === reportedError) return;
      reportedError = message;
      setLoading(false);
      setError(message);
      callbacks.current.onError?.(message);
    };
    // The SDK also reports lease expiry/revocation in its DOM. Surface those errors
    // outside the hidden native audio element, without acquiring another lease.
    const observer = new MutationObserver(() => {
      const message = target.querySelector('[role="alert"]')?.textContent;
      if (message) fail(message);
    });
    observer.observe(target, { subtree: true, childList: true, characterData: true });
    const options = {
      layout,
      imageScale,
      mediaControls: { audio: false, video: mediaControls ?? true },
      onMetadata(file: ApplicationFilePreview) {
        if (disposed) return;
        setMetadata({ key: sourceKey, file });
        callbacks.current.onMetadata?.(file);
      },
      onMediaReady(value: FilePreviewMediaControls | null) {
        if (disposed) return;
        controls.current = value;
        callbacks.current.onMediaReady?.(value);
      },
      onMediaStateChange(value: FilePreviewMediaState) {
        if (disposed) return;
        setPlayback(value);
        callbacks.current.onMediaStateChange?.(value);
      },
      onError: fail,
    };
    void (async () => {
      view = resource
        ? renderFilePreview(target, resource, options)
        : await getRuntime().open(target, { filePath: filePath! }, options);
      if (disposed) {
        await view.close();
        return;
      }
      await view.ready;
      if (!disposed) setLoading(false);
    })().catch(fail);
    return () => {
      disposed = true;
      observer.disconnect();
      controls.current = null;
      callbacks.current.onMediaReady?.(null);
      void view?.close();
    };
  }, [filePath, resource, sourceKey, visible, revision, getRuntime, layout, imageScale, mediaControls]);
  return {
    container,
    controls,
    playback,
    visible,
    loading,
    error,
    metadata: resource ?? (metadata?.key === sourceKey ? metadata.file : undefined),
  };
}
