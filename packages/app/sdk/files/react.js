import { createElement, useEffect, useRef } from "react";
import { getApplicationFileClient } from "./index.js";

const errorNotice = (container, reason) => {
  if (!container) return;
  const node = container.ownerDocument.createElement("p");
  node.setAttribute("role", "alert");
  node.textContent = String(reason?.message ?? reason);
  container.replaceChildren(node);
};
/** Renders inside the application DOM; no position or visibility bridge. */
export function FilePreview({
  filePath,
  className,
  style,
  mediaControls = true,
  layout,
  imageScale,
  onMediaReady,
  onMediaStateChange,
}) {
  const container = useRef(null);
  const callbacks = useRef({ onMediaReady, onMediaStateChange });
  callbacks.current = { onMediaReady, onMediaStateChange };
  useEffect(() => {
    let disposed = false,
      view;
    void Promise.resolve()
      .then(() => {
        if (disposed) return;
        return getApplicationFileClient().preview.open(
          container.current,
          {
            filePath,
          },
          {
            mediaControls,
            layout,
            imageScale,
            onMediaReady: (controls) => {
              if (!disposed) callbacks.current.onMediaReady?.(controls);
            },
            onMediaStateChange: (state) => {
              if (!disposed) callbacks.current.onMediaStateChange?.(state);
            },
          },
        );
      })
      .then((result) => {
        if (!result) return;
        view = result;
        if (disposed) void view.close();
      })
      .catch((reason) => {
        if (!disposed) errorNotice(container.current, reason);
      });
    return () => {
      disposed = true;
      callbacks.current.onMediaReady?.(null);
      void view?.close();
    };
  }, [filePath, mediaControls, layout, imageScale]);
  return createElement("div", {
    ref: container,
    className,
    style: {
      height: layout === "intrinsic" ? "auto" : "100%",
      minHeight: 0,
      ...style,
    },
    "aria-label": "文件预览",
  });
}
/** Declarative wrapper for the host dialog; shares FilePreviewInput with inline previews. */
export function FilePreviewDialog({ filePath, open, onOpenChange }) {
  const error = useRef(null),
    changed = useRef(onOpenChange);
  changed.current = onOpenChange;
  useEffect(() => {
    error.current?.replaceChildren();
    if (!open) return;
    let disposed = false,
      id,
      files,
      unsubscribe;
    void (async () => {
      files = getApplicationFileClient();
      unsubscribe = files.preview.subscribe((event) => {
        if (!disposed && event.id === id) changed.current?.(false);
      });
      id = (await files.preview.openDialog({ filePath })).id;
      if (disposed) await files.preview.close(id);
    })().catch((reason) => {
      if (!disposed) errorNotice(error.current, reason);
    });
    return () => {
      disposed = true;
      unsubscribe?.();
      if (id) void files.preview.close(id).catch(() => {});
    };
  }, [filePath, open]);
  return createElement("div", { ref: error });
}
