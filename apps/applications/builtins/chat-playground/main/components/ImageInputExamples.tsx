import { useEffect, useRef, useState } from "react";
import { FolderOpen, Image, Info, Trash2, Upload } from "lucide-react";
import {
  getApplicationDataClient,
  type ApplicationWorkspace,
} from "@mewvis/app-sdk/data";
import { getApplicationFileClient } from "@mewvis/app-sdk/files";
import { FilePreview } from "@mewvis/app-sdk/files/react";
import {
  IMAGE_ACCEPT,
  importWorkspaceImage,
  type WorkspaceImage,
} from "../image-inputs";
import { errorText } from "./Example";

export function useWorkspaceImage(workspaceId: string, active: boolean) {
  const upload = useRef<HTMLInputElement>(null);
  const controller = useRef<AbortController | undefined>(undefined);
  const [workspace, setWorkspace] = useState<ApplicationWorkspace>();
  const [workspaceError, setWorkspaceError] = useState("");
  const [image, setImage] = useState<WorkspaceImage>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    setImage(undefined);
    setWorkspace(undefined);
  }, [workspaceId]);
  useEffect(() => {
    let disposed = false;
    setBusy(false);
    if (active) {
      setWorkspaceError("");
      void getApplicationDataClient()
        .workspaces.get(workspaceId)
        .then(
          (value) => {
            if (!disposed) setWorkspace(value);
          },
          (reason) => {
            if (!disposed) {
              setWorkspace(undefined);
              setWorkspaceError(errorText(reason));
            }
          },
        );
    }
    return () => {
      disposed = true;
      controller.current?.abort();
      controller.current = undefined;
    };
  }, [workspaceId, active]);
  const importImage = async (file: File) => {
    if (controller.current || !active) return;
    const operation = new AbortController();
    controller.current = operation;
    setBusy(true);
    setError("");
    try {
      const current =
        await getApplicationDataClient().workspaces.get(workspaceId);
      operation.signal.throwIfAborted();
      const imported = await importWorkspaceImage(
        getApplicationFileClient(),
        current.path,
        file,
        operation.signal,
      );
      operation.signal.throwIfAborted();
      setWorkspace(current);
      setImage(imported);
    } catch (reason) {
      if (!operation.signal.aborted) setError(errorText(reason));
    } finally {
      if (controller.current === operation) {
        controller.current = undefined;
        setBusy(false);
      }
    }
  };
  const clearImage = () => {
    setImage(undefined);
    setError("");
  };
  return {
    upload,
    workspace,
    workspaceError,
    image,
    busy,
    error,
    importImage,
    clearImage,
    cancelImport: () => controller.current?.abort(),
  };
}

export function ImageInputExamples({
  input,
  active,
  disabled,
}: {
  input: ReturnType<typeof useWorkspaceImage>;
  active: boolean;
  disabled: boolean;
}) {
  const { upload, workspace, workspaceError, image, busy, error, importImage } =
    input;
  return (
    <section className="lab-image-inputs" aria-label="参考图片">
      <h3>参考图片</h3>
      <p className="lab-help">一张图片，可用于理解、编辑与生成视频。</p>
      <input
        ref={upload}
        type="file"
        accept={IMAGE_ACCEPT}
        hidden
        aria-label="选择参考图片"
        disabled={disabled || busy || !workspace || !!workspaceError}
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file && !disabled) void importImage(file);
        }}
      />
      {image ? (
        <div className="lab-image-reference">
          <div className="lab-reference-preview">
            {active && (
              <FilePreview
                filePath={image.file.filePath}
                style={{ height: "100%" }}
              />
            )}
          </div>
          <strong className="lab-reference-name" title={image.file.name}>
            {image.file.name}
          </strong>
          <p className="lab-help">
            {image.file.name.split(".").at(-1)?.toUpperCase() || "图片"} ·{" "}
            {(image.file.size / 1024 / 1024).toFixed(2)} MiB
          </p>
        </div>
      ) : (
        <button
          type="button"
          className="lab-reference-empty"
          disabled={disabled || busy || !workspace || !!workspaceError}
          onClick={() => upload.current?.click()}
        >
          <Image aria-hidden="true" />
          <strong>导入参考图片</strong>
          <span>为图片示例准备一份工作区素材</span>
        </button>
      )}
      <div className="lab-reference-actions">
        {image && (
          <button
            type="button"
            className="lab-button"
            disabled={disabled || busy || !workspace || !!workspaceError}
            onClick={() => upload.current?.click()}
          >
            <Upload aria-hidden="true" />
            更换图片
          </button>
        )}
        {image && !busy && (
          <button
            type="button"
            className="lab-button lab-quiet"
            disabled={disabled}
            onClick={input.clearImage}
          >
            <Trash2 aria-hidden="true" />
            清除引用
          </button>
        )}
        {busy && (
          <button
            type="button"
            className="lab-button"
            onClick={input.cancelImport}
          >
            取消导入
          </button>
        )}
      </div>
      {busy && (
        <p className="lab-help" role="status">
          正在保存图片…
        </p>
      )}
      {workspaceError && (
        <p className="lab-error" role="alert">
          工作区不可用：{workspaceError}
        </p>
      )}
      {error && (
        <p className="lab-error" role="alert">
          {error}
        </p>
      )}
      <p className="lab-reference-limit">
        <Info aria-hidden="true" />
        PNG / JPEG / WebP / GIF · 最大 16 MiB
      </p>
      <details className="lab-reference-location">
        <summary>
          <FolderOpen aria-hidden="true" />
          保存位置 · 当前聊天工作区
        </summary>
        <p className="lab-media-path">
          {image?.file.filePath || workspace?.path || "正在读取…"}
        </p>
        <p className="lab-help">
          导入副本保存到 media-inputs；清除引用后副本仍会保留。
        </p>
      </details>
    </section>
  );
}
