import { useCallback, useEffect, useState } from "react";
import { createApplicationFileClient } from "@mewvis/app-sdk/files";
import {
  createBackendApplicationFileTransport,
  getFilePreview,
  type FilePreview as FilePreviewResource,
} from "@/api/applications/files";
import { listen } from "@/transport";
import type { FilePreviewSource } from "./types";

type PreviewState = {
  sourceKey: string;
  resource?: FilePreviewResource;
  url: string;
  loading: boolean;
  error: string;
};

/** Path sources own their lease; ID sources borrow a lease from their container. */
export function useFilePreview({ filePath, applicationId, previewId }: FilePreviewSource) {
  const sourceKey = JSON.stringify([filePath, applicationId, previewId]);
  const [state, setState] = useState<PreviewState>({ sourceKey, url: "", loading: true, error: "" });
  useEffect(() => {
    let disposed = false;
    let revoked = false;
    let leaseId: string | undefined;
    let unlisten: (() => void) | undefined;
    const transport = previewId === undefined ? createBackendApplicationFileTransport(applicationId) : undefined;
    setState({ sourceKey, url: "", loading: true, error: "" });
    void (async () => {
      const stop = await listen<{ id: string }>("application-file-preview:close", ({ payload }) => {
        if (!disposed && payload.id === leaseId) {
          revoked = true;
          setState({ sourceKey, url: "", loading: false, error: "预览已关闭或过期，请重新打开。" });
        }
      });
      if (disposed) {
        stop();
        return;
      }
      unlisten = stop;
      const id =
        previewId ??
        (
          await createApplicationFileClient(transport!).preview.create({
            filePath: filePath!,
          })
        ).id;
      leaseId = id;
      if (disposed || revoked) return;
      const resource = await getFilePreview(id);
      if (disposed || revoked) return;
      if (!disposed && !revoked)
        setState({
          sourceKey,
          resource,
          url: resource.resourceUrl,
          loading: false,
          error: "",
        });
    })().catch((reason) => {
      if (!disposed && !revoked)
        setState({ sourceKey, url: "", loading: false, error: String(reason.message ?? reason) });
    });
    return () => {
      disposed = true;
      unlisten?.();
      transport?.dispose();
    };
  }, [sourceKey, filePath, applicationId, previewId]);
  const onError = useCallback(
    (error: string) => {
      setState((previous) => (previous.sourceKey === sourceKey ? { ...previous, error } : previous));
    },
    [sourceKey],
  );
  // A source switch must never show the previous file while the effect resets.
  const current = state.sourceKey === sourceKey ? state : { sourceKey, url: "", loading: true, error: "" };
  return { ...current, onError };
}
