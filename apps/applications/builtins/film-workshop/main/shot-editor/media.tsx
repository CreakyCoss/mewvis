import { useRef, useState } from "react";
import { FilePreview, FilePreviewDialog } from "@mewvis/app-sdk/files/react";
import { getApplicationFileClient } from "@mewvis/app-sdk/files";
import { Expand, Image, Mic, Upload, Video, Volume2 } from "lucide-react";
import type {
  FilmGeneration,
  FilmMedia,
  FilmProject,
  FilmShot,
} from "../model";
import { GENERATION_TYPES, importMedia, mediaPath } from "../media";
import { ShotArtwork } from "../artwork";
import { Waveform } from "../components/Waveform";

const formats = {
  image: ".png,.jpg,.jpeg,.webp,.gif,.avif,.bmp",
  video: ".mp4,.webm,.mov",
  audio: ".mp3,.wav,.ogg,.m4a",
};
export function ShotMedia({
  project,
  shot,
  purpose,
  onImport,
  selected,
}: {
  project: FilmProject;
  shot: FilmShot;
  purpose: FilmGeneration["purpose"];
  onImport(media: FilmMedia): void;
  selected?: FilmMedia;
}) {
  const type = GENERATION_TYPES[purpose];
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [preview, setPreview] = useState<FilmMedia>();
  const [audioDuration, setAudioDuration] = useState(0);
  const upload = useRef<HTMLInputElement>(null);
  const image = project.media?.find(
    (media) => media.id === shot.imageMediaId && media.kind === "image",
  );
  const audio = type.kind === "audio";
  const reference =
    image ??
    (audio
      ? project.media?.find(
          (media) => media.id === shot.videoMediaId && media.kind === "video",
        )
      : undefined);
  const visual = audio
    ? reference
    : (selected ?? (type.kind === "video" ? image : undefined));
  const Icon = audio ? Mic : type.kind === "video" ? Video : Image;
  const description = audio
    ? "画面参考"
    : selected
      ? type.label
      : type.kind === "video"
        ? "首帧参考"
        : "分镜示意";
  return (
    <section className="film-shot-media" aria-label={`${type.label}工作区`}>
      <header className="film-shot-media-toolbar">
        <strong>
          <Icon size={14} />
          {type.label}
        </strong>
        <span className="film-shot-media-filename" title={selected?.name}>
          {selected?.name}
        </span>
        <div>
          {type.kind === "video" && image && (
            <button
              className="film-shot-frame-button"
              onClick={() => setPreview(image)}
            >
              <Image size={13} />
              首帧参考
            </button>
          )}
          <button
            className="film-icon-button"
            disabled={!selected}
            aria-label={selected ? `预览 ${selected.name}` : "展开素材预览"}
            title="独立预览"
            onClick={() => setPreview(selected)}
          >
            <Expand size={14} />
          </button>
          <button
            disabled={busy || !project.workspace}
            onClick={() => upload.current?.click()}
          >
            <Upload size={13} />
            {busy ? "导入中…" : "导入文件"}
          </button>
        </div>
      </header>
      <input
        ref={upload}
        className="film-visually-hidden"
        type="file"
        multiple
        accept={formats[type.kind]}
        aria-label={`导入${type.label}`}
        onChange={(event) => {
          const files = [...(event.target.files ?? [])];
          event.target.value = "";
          if (!files.length) return;
          setBusy(true);
          setError("");
          void (async () => {
            for (const file of files) {
              if (
                !formats[type.kind]
                  .split(",")
                  .some((extension) =>
                    file.name.toLowerCase().endsWith(extension),
                  )
              )
                throw new Error(`请选择${type.label}支持的文件格式`);
              const media = await importMedia(
                project,
                file,
                getApplicationFileClient(),
              );
              onImport(media);
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
      <div
        className={`film-shot-media-canvas ${audio ? "is-audio" : ""}`}
        aria-label={audio ? "配音画面参考" : `当前${type.label}预览`}
      >
        {visual && project.workspace ? (
          <FilePreview
            key={visual.id}
            filePath={mediaPath(project, visual)}
            mediaControls={!audio}
          />
        ) : (
          <ShotArtwork project={project} shot={shot} />
        )}
        {(audio || !selected) && (
          <span className="film-shot-media-note">
            {description}
            {!audio && ` · 尚无${type.kind === "video" ? "视频" : "图片"}素材`}
          </span>
        )}
      </div>
      {audio && (
        <div className="film-shot-audio" aria-label="当前角色配音预览">
          {selected ? (
            <>
              <div className="film-shot-audio-wave">
                <Waveform
                  key={selected.id}
                  filePath={mediaPath(project, selected)}
                  revision={`${selected.size}:${selected.createdAt}`}
                  duration={audioDuration || shot.duration}
                />
              </div>
              <FilePreview
                key={selected.id}
                filePath={mediaPath(project, selected)}
                style={{ height: 54 }}
                onMediaReady={(controls) => {
                  if (!controls) setAudioDuration(0);
                }}
                onMediaStateChange={(state) => {
                  if (state.duration > 0) setAudioDuration(state.duration);
                }}
              />
            </>
          ) : (
            <p>
              <Volume2 size={16} />
              选择一个素材版本，或生成角色配音。
            </p>
          )}
        </div>
      )}
      {error && (
        <p className="film-error" role="alert">
          {error}
        </p>
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
    </section>
  );
}
