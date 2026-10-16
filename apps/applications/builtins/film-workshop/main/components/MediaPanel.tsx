import { useEffect, useRef, useState } from "react";
import { FilePreview, FilePreviewDialog } from "@mewvis/app-sdk/files/react";
import { getApplicationFileClient } from "@mewvis/app-sdk/files";
import { Check, Expand, File, Upload, X } from "lucide-react";
import { importMedia, mediaPath } from "../media";
import type { FilmMedia, FilmProject } from "../model";
import { Dialog } from "./Dialog";

export function LocalPreview({ filePath }: { filePath: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (!ref.current || typeof IntersectionObserver === "undefined") {
      setVisible(true);
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => setVisible(entry.isIntersecting),
      { rootMargin: "100px" },
    );
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);
  return (
    <div ref={ref} className="film-local-preview">
      {visible ? <FilePreview filePath={filePath} /> : <File size={20} />}
    </div>
  );
}

export function MediaPanel({
  project,
  ids,
  activeId,
  imagesOnly,
  onImport,
  onSelect,
  onDetach,
}: {
  project: FilmProject;
  ids: string[];
  activeId?: string;
  imagesOnly?: boolean;
  onImport: (media: FilmMedia) => void;
  onSelect?: (id: string) => void;
  onDetach: (id: string) => void;
}) {
  const upload = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [preview, setPreview] = useState<FilmMedia>(),
    [removing, setRemoving] = useState<FilmMedia>();
  const media = (project.media ?? []).filter((item) => ids.includes(item.id));
  return (
    <section
      className="film-media-panel"
      aria-label={imagesOnly ? "分镜图片版本" : "参考素材文件"}
    >
      <header>
        <strong>
          {imagesOnly ? "分镜图片" : "参考素材"}
          {media.length ? ` · ${media.length}` : ""}
        </strong>
        <button
          type="button"
          disabled={busy || !project.workspace}
          onClick={() => upload.current?.click()}
        >
          <Upload size={14} />
          {busy ? "导入中…" : "导入文件"}
        </button>
      </header>
      <input
        ref={upload}
        type="file"
        multiple
        className="film-visually-hidden"
        aria-label={imagesOnly ? "导入分镜图片" : "导入参考素材"}
        accept={
          imagesOnly
            ? ".png,.jpg,.jpeg,.webp,.gif,.avif,.bmp"
            : ".png,.jpg,.jpeg,.webp,.gif,.avif,.bmp,.mp4,.webm,.mov,.mp3,.wav,.ogg,.m4a,.pdf,.txt,.md"
        }
        onChange={(event) => {
          const files = [...(event.target.files ?? [])];
          event.target.value = "";
          if (!files.length) return;
          setBusy(true);
          setError("");
          void (async () => {
            for (const file of files) {
              if (
                imagesOnly &&
                !/\.(png|jpe?g|webp|gif|avif|bmp)$/i.test(file.name)
              )
                throw new Error("分镜图片请选择图片文件");
              const imported = await importMedia(
                project,
                file,
                getApplicationFileClient(),
              );
              onImport(imported);
            }
          })()
            .catch((reason) =>
              setError(
                reason instanceof Error ? reason.message : String(reason),
              ),
            )
            .finally(() => setBusy(false));
        }}
      />
      {!project.workspace && (
        <p className="film-muted">选择工作目录后即可导入素材。</p>
      )}
      {error && (
        <p className="film-error" role="alert">
          {error}
        </p>
      )}
      {!!media.length && (
        <div className="film-media-grid">
          {media.map((item) => (
            <article
              key={item.id}
              className={item.id === activeId ? "is-active" : ""}
            >
              <div className="film-media-thumbnail">
                {item.kind === "image" ? (
                  <LocalPreview filePath={mediaPath(project, item)} />
                ) : (
                  <File size={28} />
                )}
              </div>
              <div className="film-media-caption">
                <span title={item.name}>{item.name}</span>
                <small>
                  {item.source === "generated" ? "生成" : "导入"} ·{" "}
                  {item.size >= 1048576
                    ? `${(item.size / 1048576).toFixed(1)} MB`
                    : `${Math.ceil(item.size / 1024)} KB`}
                </small>
              </div>
              <div className="film-media-actions">
                <button
                  type="button"
                  aria-label={`预览 ${item.name}`}
                  onClick={() => setPreview(item)}
                >
                  <Expand size={13} />
                  预览
                </button>
                {onSelect && (
                  <button
                    type="button"
                    aria-pressed={activeId === item.id}
                    onClick={() => onSelect(item.id)}
                  >
                    {activeId === item.id ? (
                      <>
                        <Check size={13} />
                        当前
                      </>
                    ) : (
                      "使用"
                    )}
                  </button>
                )}
                <button
                  type="button"
                  className="film-icon-button"
                  aria-label={`解除关联 ${item.name}`}
                  onClick={() => setRemoving(item)}
                >
                  <X size={13} />
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
      {preview && (
        <FilePreviewDialog
          filePath={mediaPath(project, preview)}
          open
          onOpenChange={(open) => {
            if (!open) setPreview(undefined);
          }}
        />
      )}
      {removing && (
        <Dialog title="解除素材关联" onClose={() => setRemoving(undefined)}>
          <p>解除「{removing.name}」的关联？文件仍保留在项目工作目录中。</p>
          <footer>
            <button onClick={() => setRemoving(undefined)}>取消</button>
            <button
              onClick={() => {
                onDetach(removing.id);
                setRemoving(undefined);
              }}
            >
              确认解除
            </button>
          </footer>
        </Dialog>
      )}
    </section>
  );
}
