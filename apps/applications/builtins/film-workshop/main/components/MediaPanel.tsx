import { useEffect, useRef, useState } from "react";
import { FilePreview, FilePreviewDialog } from "@mewvis/app-sdk/files/react";
import { getApplicationFileClient } from "@mewvis/app-sdk/files";
import { Check, Expand, File, Film, Volume2, Upload, X } from "lucide-react";
import { importMedia, mediaPath } from "../media";
import type { FilmMedia, FilmProject } from "../model";
import { Dialog } from "./Dialog";

export function LocalPreview({
  filePath,
  eager = false,
}: {
  filePath: string;
  eager?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(eager);
  useEffect(() => {
    if (eager || !ref.current || typeof IntersectionObserver === "undefined") {
      setVisible(true);
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => setVisible(entry.isIntersecting),
      { rootMargin: "100px" },
    );
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, [eager]);
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
  kind,
  onImport,
  onSelect,
  onDetach,
}: {
  project: FilmProject;
  ids: string[];
  activeId?: string;
  kind?: "image" | "video" | "audio";
  onImport: (media: FilmMedia) => void;
  onSelect?: (id: string) => void;
  onDetach: (id: string) => void;
}) {
  const upload = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [preview, setPreview] = useState<FilmMedia>(),
    [removing, setRemoving] = useState<FilmMedia>();
  const media = (project.media ?? []).filter(
    (item) => ids.includes(item.id) && (!kind || item.kind === kind),
  );
  const label = kind
    ? { image: "分镜图片", video: "镜头视频", audio: "角色配音" }[kind]
    : "参考素材";
  const extensions = {
    image: "png|jpe?g|webp|gif|avif|bmp",
    video: "mp4|webm|mov",
    audio: "mp3|wav|ogg|m4a",
  };
  const selected = media.find((item) => item.id === activeId);
  const player = kind === "video" || kind === "audio";
  const versions = player
    ? media.filter((item) => item.id !== selected?.id)
    : media;
  const caption = (item: FilmMedia) => (
    <div className="film-media-caption">
      <span title={item.name}>{item.name}</span>
      <small>
        {player && `版本 ${media.indexOf(item) + 1} · `}
        {item.source === "generated" ? "生成" : "导入"} ·{" "}
        {item.size >= 1048576
          ? `${(item.size / 1048576).toFixed(1)} MB`
          : `${Math.ceil(item.size / 1024)} KB`}
      </small>
    </div>
  );
  const actions = (item: FilmMedia, selectable = true) => (
    <div className="film-media-actions">
      <button
        type="button"
        aria-label={`预览 ${item.name}`}
        onClick={() => setPreview(item)}
      >
        <Expand size={13} />
        {player ? "放大预览" : "预览"}
      </button>
      {onSelect && selectable && (
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
        title="解除关联"
        onClick={() => setRemoving(item)}
      >
        <X size={13} />
      </button>
    </div>
  );
  return (
    <section
      className="film-media-panel"
      aria-label={kind ? `${label}版本` : "参考素材文件"}
    >
      <header>
        <strong>
          {label}
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
        aria-label={`导入${label}`}
        accept={
          kind === "image"
            ? ".png,.jpg,.jpeg,.webp,.gif,.avif,.bmp"
            : kind === "video"
              ? ".mp4,.webm,.mov"
              : kind === "audio"
                ? ".mp3,.wav,.ogg,.m4a"
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
                kind &&
                !new RegExp(`\\.(${extensions[kind]})$`, "i").test(file.name)
              )
                throw new Error(`请选择${label}支持的文件格式`);
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
      {selected && player && (
        <div className="film-selected-media" aria-label={`当前${label}预览`}>
          <LocalPreview
            key={selected.id}
            filePath={mediaPath(project, selected)}
            eager
          />
          <div className="film-selected-media-footer">
            {caption(selected)}
            {actions(selected, false)}
          </div>
        </div>
      )}
      {!!versions.length && (
        <div className={player ? "film-media-versions" : "film-media-grid"}>
          {player && selected && (
            <p className="film-media-versions-label">其他版本</p>
          )}
          {versions.map((item) => (
            <article
              key={item.id}
              className={item.id === activeId ? "is-active" : ""}
            >
              {!player && (
                <div className="film-media-thumbnail">
                  {item.kind === "image" ? (
                    <LocalPreview filePath={mediaPath(project, item)} />
                  ) : item.kind === "video" ? (
                    <Film size={28} />
                  ) : item.kind === "audio" ? (
                    <Volume2 size={28} />
                  ) : (
                    <File size={28} />
                  )}
                </div>
              )}
              {caption(item)}
              {actions(item)}
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
