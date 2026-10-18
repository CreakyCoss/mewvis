import { useEffect, useRef, useState } from "react";
import { Eye, Image, Upload, Video } from "lucide-react";
import type { ChatSnapshot } from "@mewvis/app-sdk/chat";
import {
  getApplicationDataClient,
  type ApplicationWorkspace,
} from "@mewvis/app-sdk/data";
import { getApplicationFileClient } from "@mewvis/app-sdk/files";
import { FilePreview } from "@mewvis/app-sdk/files/react";
import {
  imageInputExamples,
  mediaExampleUnavailableReason,
  type ChatPreset,
} from "../examples";
import {
  IMAGE_ACCEPT,
  imageInputCode,
  importWorkspaceImage,
  type WorkspaceImage,
} from "../image-inputs";
import { CodeExample, errorText } from "./Example";

const icons = { understanding: Eye, editing: Image, video: Video };

export function ImageInputExamples({
  state,
  workspaceId,
  active,
  disabled,
  onApply,
}: {
  state: Readonly<ChatSnapshot>;
  workspaceId: string;
  active: boolean;
  disabled: boolean;
  onApply(example: ChatPreset, image: WorkspaceImage): void;
}) {
  const upload = useRef<HTMLInputElement>(null);
  const controller = useRef<AbortController | undefined>(undefined);
  const [workspace, setWorkspace] = useState<ApplicationWorkspace>();
  const [workspaceError, setWorkspaceError] = useState("");
  const [image, setImage] = useState<WorkspaceImage>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
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
    if (controller.current || disabled || !active) return;
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
  return (
    <section className="lab-image-inputs" aria-label="图片输入示例">
      <h3>导入一张图片，体验三种用途</h3>
      <p className="lab-help">
        支持 PNG、JPEG、WebP、GIF，最大 16 MiB。导入副本保存到当前聊天工作区的
        media-inputs，选择示例后确认发送。
      </p>
      <p className="lab-help lab-media-path">
        当前聊天工作区：{workspace?.path ?? "正在读取…"}
      </p>
      {workspaceError && (
        <p className="lab-error" role="alert">
          工作区不可用：{workspaceError}
        </p>
      )}
      <input
        ref={upload}
        type="file"
        accept={IMAGE_ACCEPT}
        hidden
        aria-label="选择参考图片"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) void importImage(file);
        }}
      />
      <div className="lab-media-example-heading">
        <button
          type="button"
          className="lab-button"
          disabled={disabled || busy || !workspace || !!workspaceError}
          onClick={() => upload.current?.click()}
        >
          <Upload aria-hidden="true" />
          {busy ? "正在保存图片…" : image ? "更换参考图片" : "导入参考图片"}
        </button>
        {busy && (
          <button
            type="button"
            className="lab-button lab-quiet"
            onClick={() => {
              controller.current?.abort();
              controller.current = undefined;
              setBusy(false);
              setError("已取消导入。");
            }}
          >
            取消导入
          </button>
        )}
        {image && !busy && (
          <button
            type="button"
            className="lab-button lab-quiet"
            disabled={disabled}
            onClick={() => {
              setImage(undefined);
              setError("");
            }}
          >
            清除引用
          </button>
        )}
      </div>
      {error && (
        <p className="lab-error" role="alert">
          {error}
        </p>
      )}
      {image && (
        <div className="lab-image-reference">
          {active && (
            <FilePreview
              filePath={image.file.filePath}
              style={{ height: 180 }}
            />
          )}
          <p className="lab-media-path">
            <strong>{image.file.name}</strong> ·{" "}
            {(image.file.size / 1024).toFixed(1)} KiB
            <br />
            <code>{image.file.filePath}</code>
          </p>
          <p className="lab-help">
            清除引用只移除当前选择，工作区内的副本会保留。
          </p>
        </div>
      )}
      <div className="lab-media-example-list">
        {imageInputExamples.map((example) => {
          const reason = mediaExampleUnavailableReason(state, example);
          const Icon = icons[example.imageInput];
          return (
            <section
              className="lab-media-example"
              key={example.imageInput}
              aria-label={`${example.label}示例`}
            >
              <div className="lab-section-heading">
                <h3>
                  <Icon aria-hidden="true" />
                  {example.label}
                </h3>
                <span
                  className={reason ? "lab-media-unavailable" : "lab-badge"}
                >
                  {reason ? "暂不可用" : "能力已就绪"}
                </span>
              </div>
              <p>{example.description}</p>
              <p className="lab-help">
                {reason ||
                  (!image ? "请先导入参考图片。" : "将引用上方工作区图片。")}
              </p>
              <button
                type="button"
                className="lab-button"
                disabled={
                  disabled || busy || !image || !!reason || !!workspaceError
                }
                onClick={() => {
                  if (image) onApply(example, image);
                }}
              >
                填入{example.label}示例
              </button>
            </section>
          );
        })}
      </div>
      <CodeExample code={imageInputCode} title="图片输入接入代码" />
    </section>
  );
}
