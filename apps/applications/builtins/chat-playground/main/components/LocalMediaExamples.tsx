import { useEffect, useRef, useState } from "react";
import {
  Check,
  CheckCircle2,
  CircleAlert,
  Code2,
  Crop,
  Film,
  Folder,
  Image,
  Info,
  LoaderCircle,
  Maximize,
  Monitor,
  Music2,
  Play,
  RefreshCw,
  Smartphone,
  Square,
  Upload,
  Video,
  X,
} from "lucide-react";
import { FilePreview } from "@mewvis/app-sdk/files/react";
import {
  getApplicationMediaClient,
  type MediaInfo,
  type MediaJob,
} from "@mewvis/app-sdk/media";
import { CodeExample, Feedback, PageHeading, errorText } from "./Example";
import { LabDialog } from "./LabDialog";
import {
  MEDIA_SIZES,
  isMediaJobActive,
  localMediaCode,
  mediaExtension,
  supportsMedia,
} from "../local-media";
import { useLocalMedia } from "../use-local-media";
import "../local-media.css";

const statuses: Record<MediaJob["status"], string> = {
  queued: "排队中",
  running: "处理中",
  cancelling: "正在取消",
  completed: "已完成",
  failed: "失败",
  cancelled: "已取消",
};
const phases: Record<MediaJob["phase"], string> = {
  queued: "等待处理",
  preparing: "准备素材",
  rendering: "合成画面与声音",
  saving: "保存成片",
  done: "处理结束",
};
const nameOf = (path: string) => path.split(/[\\/]/).at(-1) || path;
const bytesText = (size: number) =>
  size < 1024 * 1024
    ? `${(size / 1024).toFixed(1)} KiB`
    : `${(size / 1024 / 1024).toFixed(1)} MiB`;
const sizeIcons = [Monitor, Smartphone, Maximize];
const sizeLabels = ["横屏", "竖屏", "小尺寸"];

function MediaDetails({ info, still }: { info: MediaInfo; still?: boolean }) {
  return (
    <dl className="showcase-result-table">
      <div>
        <dt>文件大小</dt>
        <dd>{bytesText(info.size)}</dd>
      </div>
      {!still && (
        <div>
          <dt>时长</dt>
          <dd>
            {info.duration === undefined
              ? "未提供"
              : `${info.duration.toFixed(2)} 秒`}
          </dd>
        </div>
      )}
      {info.video && (
        <>
          <div>
            <dt>画面编码</dt>
            <dd>{info.video.codec}</dd>
          </div>
          <div>
            <dt>分辨率</dt>
            <dd>
              {info.video.width} × {info.video.height}
            </dd>
          </div>
        </>
      )}
      {info.audio && (
        <>
          <div>
            <dt>音频编码</dt>
            <dd>{info.audio.codec}</dd>
          </div>
          <div>
            <dt>采样率 / 声道</dt>
            <dd>
              {info.audio.sampleRate} Hz / {info.audio.channels}
            </dd>
          </div>
        </>
      )}
    </dl>
  );
}

function MaterialRow({
  kind,
  info,
  disabled,
  onChoose,
  onInspect,
}: {
  kind: "image" | "audio";
  info?: MediaInfo;
  disabled: boolean;
  onChoose(): void;
  onInspect(): void;
}) {
  const Icon = kind === "image" ? Image : Music2;
  const label = kind === "image" ? "图片" : "配音";
  return (
    <div className="local-media-material">
      <div className="local-media-material-art">
        {kind === "image" && info ? (
          <FilePreview key={info.filePath} filePath={info.filePath} />
        ) : (
          <Icon aria-hidden="true" />
        )}
      </div>
      <div className="local-media-material-copy">
        <strong title={info ? nameOf(info.filePath) : undefined}>
          {info
            ? nameOf(info.filePath)
            : kind === "image"
              ? "选择一张图片"
              : "添加配音（可选）"}
        </strong>
        <span>
          {info
            ? [
                kind === "image" && info.video
                  ? `${info.video.width} × ${info.video.height}`
                  : info.duration !== undefined
                    ? `${info.duration.toFixed(1)} 秒`
                    : "音频素材",
                mediaExtension(info.filePath).toUpperCase(),
              ].join(" · ")
            : kind === "image"
              ? "导入本地图片作为画面"
              : "未添加时生成静音视频"}
        </span>
      </div>
      <button
        type="button"
        className="showcase-text-button"
        disabled={disabled}
        onClick={onChoose}
        aria-label={info ? `替换${label}` : `选择${label}`}
      >
        {info ? "替换" : "选择"}
      </button>
      <button
        type="button"
        className="local-media-icon"
        disabled={!info || disabled}
        onClick={onInspect}
        aria-label={`查看${label}详情`}
      >
        <Info aria-hidden="true" />
      </button>
    </div>
  );
}

function JobRow({
  job,
  disabled,
  onPreview,
  onDetails,
  onCancel,
}: {
  job: MediaJob;
  disabled: boolean;
  onPreview(): void;
  onDetails(): void;
  onCancel(): void;
}) {
  const active = isMediaJobActive(job);
  const Icon = active
    ? LoaderCircle
    : job.status === "completed"
      ? CheckCircle2
      : job.status === "failed"
        ? CircleAlert
        : Square;
  return (
    <li className="local-media-job-row">
      <span className={`local-media-job-icon is-${job.status}`}>
        <Icon
          aria-hidden="true"
          className={active ? "is-spinning" : undefined}
        />
      </span>
      <button
        type="button"
        className="local-media-job-copy"
        onClick={onDetails}
        aria-label={`查看任务详情：${statuses[job.status]}，${new Date(job.createdAt).toLocaleTimeString()}`}
      >
        <strong>图片配音合成</strong>
        <span>
          {active
            ? `${phases[job.phase]} · ${Math.round(job.progress * 100)}%`
            : statuses[job.status]}{" "}
          ·{" "}
          {new Date(job.createdAt).toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          })}
        </span>
      </button>
      {active && (
        <progress
          max="1"
          value={job.progress}
          aria-label={`任务进度 ${Math.round(job.progress * 100)}%`}
        />
      )}
      {active ? (
        <button
          type="button"
          className="showcase-text-button"
          disabled={disabled || job.status === "cancelling"}
          onClick={onCancel}
          aria-label="取消此任务"
        >
          取消
        </button>
      ) : job.status === "completed" && job.output ? (
        <button
          type="button"
          className="showcase-text-button"
          onClick={onPreview}
        >
          <Play aria-hidden="true" />
          播放
        </button>
      ) : (
        <button
          type="button"
          className="showcase-text-button"
          onClick={onDetails}
        >
          详情
        </button>
      )}
    </li>
  );
}

export function LocalMediaExamples() {
  const media = useLocalMedia();
  const [dialog, setDialog] = useState<
    "source" | "capability" | "code" | "jobs" | "job"
  >();
  const [detailsJobId, setDetailsJobId] = useState<string>();
  const [previewClosed, setPreviewClosed] = useState(false);
  const [outputInfo, setOutputInfo] = useState<MediaInfo>();
  const [outputError, setOutputError] = useState("");
  const importTarget = useRef<"image" | "audio" | undefined>(undefined);
  const pathInput = useRef<HTMLInputElement>(null);
  const selected = media.jobs.find((job) => job.id === media.selectedId);
  const completed =
    selected?.status === "completed" && selected.output
      ? selected
      : media.jobs.find((job) => job.status === "completed" && job.output);
  const preview = previewClosed ? undefined : completed;
  const detailsJob = media.jobs.find((job) => job.id === detailsJobId);
  const recentJobs = [
    ...media.jobs.filter(isMediaJobActive),
    ...media.jobs.filter((job) => !isMediaJobActive(job)),
  ].slice(0, 3);

  useEffect(() => {
    let disposed = false;
    setOutputInfo(undefined);
    setOutputError("");
    if (preview?.output) {
      void Promise.resolve()
        .then(() => getApplicationMediaClient().probe(preview.output!.filePath))
        .then((info) => {
          if (!disposed) setOutputInfo(info);
        })
        .catch((reason) => {
          if (!disposed) setOutputError(errorText(reason));
        });
    }
    return () => {
      disposed = true;
    };
  }, [preview?.output?.filePath]);

  const chooseFile = (target?: "image" | "audio") => {
    importTarget.current = target;
    const input = media.upload.current;
    if (!input) return;
    input.accept =
      target && media.capabilities
        ? media.capabilities.inputs[target]
            .map((extension) => `.${extension}`)
            .join(",")
        : (media.accept ?? "");
    input.click();
  };
  const inspect = (info?: MediaInfo) => {
    if (info) {
      media.setInfo(info);
      media.setPath(info.filePath);
    }
    setDialog("source");
  };
  const playJob = (job: MediaJob) => {
    media.setSelectedId(job.id);
    setPreviewClosed(false);
    setDialog(undefined);
  };
  const inspectJob = (job: MediaJob) => {
    setDetailsJobId(job.id);
    setDialog("job");
  };
  const renderJob = (job: MediaJob) => (
    <JobRow
      key={job.id}
      job={job}
      disabled={media.disabled}
      onPreview={() => playJob(job)}
      onDetails={() => inspectJob(job)}
      onCancel={() => void media.cancel(job.id)}
    />
  );
  const assign = (kind: "image" | "audio") => {
    if (!media.info) return;
    if (kind === "image") media.setImage(media.info);
    else media.setAudio(media.info);
    media.setMessage(
      kind === "image" ? "已选为合成画面。" : "已选为合成配音。",
    );
    setDialog(undefined);
  };
  const dialogTitles = {
    source: "探测素材与文件详情",
    capability: "本地媒体能力",
    code: "本地媒体接入代码",
    jobs: "全部媒体任务",
    job: "媒体任务详情",
  };

  return (
    <div className="local-media-page">
      <header className="local-media-heading">
        <PageHeading
          title="本地媒体"
          description="探测素材，把图片与配音合成为视频。"
        />
        <div className="local-media-header-actions">
          <button
            type="button"
            className={`local-media-service ${media.loading ? "is-loading" : media.unavailable ? "is-unavailable" : "is-available"}`}
            onClick={() => setDialog("capability")}
          >
            {media.loading ? (
              <LoaderCircle className="is-spinning" aria-hidden="true" />
            ) : media.unavailable ? (
              <CircleAlert aria-hidden="true" />
            ) : (
              <CheckCircle2 aria-hidden="true" />
            )}
            {media.loading
              ? "检查本地服务"
              : media.unavailable
                ? "本地服务不可用"
                : "本地处理可用"}
          </button>
          <button
            type="button"
            className="showcase-text-button"
            onClick={() => setDialog("code")}
          >
            <Code2 aria-hidden="true" />
            接入代码
          </button>
        </div>
      </header>
      {!media.loading && media.unavailable && (
        <p className="local-media-unavailable" role="status">
          {media.capabilities?.reason ||
            media.error ||
            "请检查宿主媒体服务、FFmpeg / FFprobe 与文件权限。"}
          <button
            type="button"
            className="showcase-text-button"
            disabled={media.disabled}
            onClick={() => void media.run("刷新能力与任务", media.load)}
          >
            重新检查
          </button>
        </p>
      )}
      <div className="local-media-workbench">
        <section className="local-media-controls" aria-label="素材与合成设置">
          <div className="local-media-materials">
            <h2>素材</h2>
            <MaterialRow
              kind="image"
              info={media.image}
              disabled={media.disabled || media.unavailable}
              onChoose={() => chooseFile("image")}
              onInspect={() => inspect(media.image)}
            />
            <MaterialRow
              kind="audio"
              info={media.audio}
              disabled={media.disabled || media.unavailable}
              onChoose={() => chooseFile("audio")}
              onInspect={() => inspect(media.audio)}
            />
            <div className="local-media-import-actions">
              <button
                type="button"
                className="showcase-button"
                disabled={media.disabled || media.unavailable}
                onClick={() => chooseFile()}
              >
                <Upload aria-hidden="true" />
                导入素材
              </button>
              <button
                type="button"
                className="showcase-text-button"
                disabled={media.disabled || media.unavailable}
                onClick={() => inspect()}
              >
                <Folder aria-hidden="true" />
                使用已有路径
              </button>
            </div>
            <input
              ref={media.upload}
              type="file"
              hidden
              aria-label="选择本地媒体素材"
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                const target = importTarget.current;
                if (file)
                  void media.importFile(file, target).then((saved) => {
                    if (saved && !target) setDialog("source");
                  });
              }}
            />
          </div>
          <div className="local-media-settings">
            <h2>合成设置</h2>
            <div className="local-media-setting-row">
              <label htmlFor="local-media-duration">成片时长</label>
              <div className="local-media-duration-controls">
                <div className="local-media-duration-input">
                  <input
                    id="local-media-duration"
                    type="number"
                    min="0.1"
                    max={media.maxDuration}
                    step="0.1"
                    value={media.duration}
                    disabled={media.disabled}
                    onChange={(event) => media.setDuration(event.target.value)}
                  />
                  <span>秒</span>
                </div>
                <button
                  type="button"
                  className="showcase-button"
                  disabled={
                    media.disabled ||
                    media.audio?.duration === undefined ||
                    media.audio.duration < 0.1 ||
                    media.audio.duration > media.maxDuration
                  }
                  onClick={() =>
                    media.setDuration(
                      String(Math.ceil(media.audio!.duration! * 10) / 10),
                    )
                  }
                >
                  按配音时长
                </button>
              </div>
            </div>
            <fieldset
              className="local-media-setting-row"
              disabled={media.disabled}
            >
              <legend>输出尺寸</legend>
              <div>
                <div className="local-media-segments">
                  {MEDIA_SIZES.map((option, index) => {
                    const Icon = sizeIcons[index];
                    return (
                      <label key={option.label}>
                        <input
                          type="radio"
                          name="local-media-size"
                          checked={media.size === index}
                          disabled={
                            !media.capabilities ||
                            option.width > media.capabilities.limits.width ||
                            option.height > media.capabilities.limits.height
                          }
                          onChange={() => media.setSize(index)}
                        />
                        <Icon aria-hidden="true" />
                        <span>{sizeLabels[index]}</span>
                      </label>
                    );
                  })}
                </div>
                <p className="local-media-setting-note">
                  {MEDIA_SIZES[media.size].width} ×{" "}
                  {MEDIA_SIZES[media.size].height} ·{" "}
                  {Math.min(24, media.capabilities?.limits.fps ?? 24)} fps
                </p>
              </div>
            </fieldset>
            <fieldset
              className="local-media-setting-row"
              disabled={media.disabled}
            >
              <legend>图片显示</legend>
              <div className="local-media-segments">
                <label>
                  <input
                    type="radio"
                    name="local-media-fit"
                    checked={media.fit === "contain"}
                    onChange={() => media.setFit("contain")}
                  />
                  <Image aria-hidden="true" />
                  <span>保留整图</span>
                </label>
                <label>
                  <input
                    type="radio"
                    name="local-media-fit"
                    checked={media.fit === "cover"}
                    onChange={() => media.setFit("cover")}
                  />
                  <Crop aria-hidden="true" />
                  <span>裁切铺满</span>
                </label>
              </div>
            </fieldset>
            <label className="local-media-trim">
              <input
                type="checkbox"
                checked={media.trimAudio}
                disabled={media.disabled || !media.audio}
                onChange={(event) => media.setTrimAudio(event.target.checked)}
              />
              允许裁剪超长配音
            </label>
            <p className="local-media-setting-note">
              {media.trimAudio
                ? "超出时长的配音会被裁剪，结尾不足时补静音。"
                : "配音超长时需调整时长或允许裁剪。"}
            </p>
          </div>
          <div className="local-media-submit">
            <div className="local-media-feedback" aria-live="polite">
              {!!media.busy && (
                <p role="status">
                  <LoaderCircle className="is-spinning" aria-hidden="true" />
                  正在{media.busy}…
                </p>
              )}
              {media.busy === "导入并探测素材" && (
                <button
                  type="button"
                  className="showcase-text-button"
                  onClick={media.stopImport}
                >
                  停止导入
                </button>
              )}
              <Feedback error={media.error} message={media.message} />
            </div>
            <button
              type="button"
              className="showcase-button is-primary local-media-compose"
              disabled={
                media.disabled ||
                media.unavailable ||
                !media.image ||
                !!media.activeIds
              }
              onClick={() => {
                setPreviewClosed(false);
                void media.compose();
              }}
            >
              {media.busy === "提交合成任务" ? (
                <LoaderCircle className="is-spinning" aria-hidden="true" />
              ) : (
                <Play aria-hidden="true" />
              )}
              开始合成
            </button>
            <p className="local-media-output-note">
              {media.activeIds
                ? "任务结束或取消后可再次合成"
                : "MP4 · 保存到应用数据目录"}
            </p>
          </div>
        </section>
        <section
          className="local-media-results"
          aria-label="成片预览与最近任务"
        >
          <div className="local-media-preview-heading">
            <h2>成片预览</h2>
            {preview && (
              <span className="local-media-completed">
                <Check aria-hidden="true" />
                {selected && isMediaJobActive(selected)
                  ? "上次合成 · 已完成"
                  : "已完成"}
              </span>
            )}
            <button
              type="button"
              className="local-media-icon"
              disabled={!preview}
              onClick={() => setPreviewClosed(true)}
              aria-label="关闭成片预览"
            >
              <X aria-hidden="true" />
            </button>
          </div>
          <div className={`local-media-player${preview ? " has-output" : ""}`}>
            {preview?.output ? (
              <FilePreview
                key={preview.id}
                filePath={preview.output.filePath}
              />
            ) : (
              <div className="showcase-empty">
                <Video aria-hidden="true" />
                <strong>
                  {previewClosed
                    ? "预览已关闭"
                    : media.activeIds
                      ? "正在合成视频"
                      : "在这里预览你的成片"}
                </strong>
                <p>
                  {previewClosed
                    ? "点击最近任务中的播放可重新打开。"
                    : media.activeIds
                      ? "任务完成后即可播放，离开页面也会继续处理。"
                      : "选择图片与配音，点击开始合成。"}
                </p>
                {previewClosed && (
                  <button
                    type="button"
                    className="showcase-text-button"
                    onClick={() => setDialog("jobs")}
                  >
                    查看最近任务
                  </button>
                )}
              </div>
            )}
          </div>
          {preview?.output && (
            <div className="local-media-output-summary">
              <span className="local-media-output-icon">
                <Film aria-hidden="true" />
              </span>
              <div>
                <strong>{nameOf(preview.output.filePath)}</strong>
                <p>
                  {outputInfo
                    ? [
                        outputInfo.video
                          ? `${outputInfo.video.width} × ${outputInfo.video.height}`
                          : "",
                        [outputInfo.video?.codec, outputInfo.audio?.codec]
                          .filter(Boolean)
                          .join(" / ")
                          .toUpperCase(),
                        outputInfo.duration !== undefined
                          ? `${outputInfo.duration.toFixed(1)} 秒`
                          : "",
                      ]
                        .filter(Boolean)
                        .join(" · ")
                    : bytesText(preview.output.size)}
                </p>
              </div>
              <details className="local-media-output-path">
                <summary>
                  <Folder aria-hidden="true" />
                  查看保存位置
                </summary>
                <code>{preview.output.filePath}</code>
              </details>
            </div>
          )}
          {outputError && (
            <p className="local-media-setting-note">
              成片信息读取失败：{outputError}
            </p>
          )}
          <div className="local-media-history">
            <div className="local-media-history-heading">
              <h2>最近任务</h2>
              <button
                type="button"
                className="showcase-text-button"
                onClick={() => setDialog("jobs")}
              >
                查看全部
              </button>
              <button
                type="button"
                className="local-media-icon"
                disabled={media.disabled}
                onClick={() => void media.run("刷新能力与任务", media.load)}
                aria-label="刷新能力与任务"
              >
                <RefreshCw aria-hidden="true" />
              </button>
            </div>
            <Feedback error={media.pollError} />
            {recentJobs.length ? (
              <ul className="local-media-jobs">{recentJobs.map(renderJob)}</ul>
            ) : (
              <div className="local-media-no-jobs">
                <p>还没有本地合成任务。</p>
                <span>完成的成片和处理中任务会显示在这里。</span>
              </div>
            )}
          </div>
        </section>
      </div>
      <LabDialog
        open={!!dialog}
        title={dialog ? dialogTitles[dialog] : "本地媒体"}
        onClose={() => setDialog(undefined)}
        className="local-media-dialog"
        initialFocus={dialog === "source" ? pathInput : undefined}
      >
        {dialog === "source" && (
          <>
            <p className="showcase-muted">
              导入素材后查看探测信息，或输入应用数据目录、已登记工作区中的完整路径。
            </p>
            <label className="showcase-field-label" htmlFor="local-media-path">
              素材完整路径
            </label>
            <input
              ref={pathInput}
              id="local-media-path"
              value={media.path}
              disabled={media.disabled}
              onChange={(event) => {
                media.setPath(event.target.value);
                media.setInfo(undefined);
              }}
              onKeyDown={(event) => {
                if (
                  event.key === "Enter" &&
                  media.path.trim() &&
                  !media.disabled &&
                  !media.unavailable
                )
                  void media.run("探测素材", (signal) =>
                    media.probe(media.path.trim(), signal).then(() => {}),
                  );
              }}
            />
            <div className="showcase-actions">
              <button
                type="button"
                className="showcase-button"
                disabled={
                  media.disabled || media.unavailable || !media.path.trim()
                }
                onClick={() =>
                  void media.run("探测素材", (signal) =>
                    media.probe(media.path.trim(), signal).then(() => {}),
                  )
                }
              >
                <RefreshCw aria-hidden="true" />
                探测信息
              </button>
            </div>
            <Feedback error={media.error} />
            {media.info && (
              <>
                <MediaDetails
                  info={media.info}
                  still={
                    !!media.capabilities &&
                    supportsMedia(
                      media.capabilities,
                      "image",
                      media.info.filePath,
                    )
                  }
                />
                <div className="showcase-actions">
                  <button
                    type="button"
                    className="showcase-button"
                    disabled={
                      media.disabled ||
                      !media.capabilities ||
                      !supportsMedia(
                        media.capabilities,
                        "image",
                        media.info.filePath,
                      ) ||
                      !media.info.video
                    }
                    onClick={() => assign("image")}
                  >
                    用作图片
                  </button>
                  <button
                    type="button"
                    className="showcase-button"
                    disabled={
                      media.disabled ||
                      !media.capabilities ||
                      !supportsMedia(
                        media.capabilities,
                        "audio",
                        media.info.filePath,
                      ) ||
                      !media.info.audio
                    }
                    onClick={() => assign("audio")}
                  >
                    用作配音
                  </button>
                  {media.image?.filePath === media.info.filePath && (
                    <button
                      type="button"
                      className="showcase-text-button"
                      disabled={media.disabled}
                      onClick={() => {
                        media.setImage(undefined);
                        setDialog(undefined);
                      }}
                    >
                      清除图片引用
                    </button>
                  )}
                  {media.audio?.filePath === media.info.filePath && (
                    <button
                      type="button"
                      className="showcase-text-button"
                      disabled={media.disabled}
                      onClick={() => {
                        media.setAudio(undefined);
                        setDialog(undefined);
                      }}
                    >
                      清除配音引用
                    </button>
                  )}
                </div>
                <div className="local-media-source-preview">
                  <FilePreview
                    key={media.info.filePath}
                    filePath={media.info.filePath}
                  />
                </div>
              </>
            )}
          </>
        )}
        {dialog === "capability" && (
          <>
            <p className="showcase-muted">
              {media.capabilities?.available
                ? `本地输出 MP4 · H.264 / AAC；本示例时长 0.1–${media.maxDuration} 秒。`
                : media.capabilities?.reason ||
                  media.error ||
                  "当前宿主未提供媒体处理服务。"}
            </p>
            <button
              type="button"
              className="showcase-button"
              disabled={media.disabled}
              onClick={() => void media.run("刷新能力与任务", media.load)}
            >
              <RefreshCw aria-hidden="true" />
              刷新能力与任务
            </button>
            {media.capabilities && (
              <dl className="showcase-result-table">
                {(["image", "video", "audio"] as const).map((kind, index) => (
                  <div key={kind}>
                    <dt>{["图片格式", "视频格式", "音频格式"][index]}</dt>
                    <dd>{media.capabilities!.inputs[kind].join("、")}</dd>
                  </div>
                ))}
              </dl>
            )}
            {media.roots && (
              <div className="showcase-file-summary">
                <strong>应用数据目录</strong>
                <code>{media.roots.dataPath}</code>
                <strong>已登记工作区</strong>
                {media.roots.workspacePaths.map((path) => (
                  <code key={path}>{path}</code>
                ))}
              </div>
            )}
            <Feedback error={media.error} />
          </>
        )}
        {dialog === "code" && <CodeExample code={localMediaCode} open />}
        {dialog === "jobs" && (
          <>
            <p className="showcase-muted">
              本应用最近 20 项任务。离开页面会继续合成，返回时恢复任务状态。
            </p>
            <button
              type="button"
              className="showcase-text-button"
              disabled={media.disabled}
              onClick={() => void media.run("刷新能力与任务", media.load)}
            >
              <RefreshCw aria-hidden="true" />
              刷新任务
            </button>
            <Feedback error={media.pollError || media.error} />
            <ul className="local-media-jobs">{media.jobs.map(renderJob)}</ul>
            {!media.jobs.length && (
              <p className="showcase-muted">还没有本地合成任务。</p>
            )}
          </>
        )}
        {dialog === "job" && detailsJob && (
          <>
            <p>
              <strong>{statuses[detailsJob.status]}</strong> ·{" "}
              {phases[detailsJob.phase]} ·{" "}
              {Math.round(detailsJob.progress * 100)}%
            </p>
            <dl className="showcase-result-table">
              <div>
                <dt>创建时间</dt>
                <dd>{new Date(detailsJob.createdAt).toLocaleString()}</dd>
              </div>
              <div>
                <dt>任务 ID</dt>
                <dd className="showcase-mono">{detailsJob.id}</dd>
              </div>
              <div>
                <dt>输出路径</dt>
                <dd className="showcase-mono">{detailsJob.outputFilePath}</dd>
              </div>
            </dl>
            <Feedback
              error={
                detailsJob.error
                  ? `${detailsJob.error.code}：${detailsJob.error.message}`
                  : undefined
              }
            />
            {isMediaJobActive(detailsJob) && (
              <button
                type="button"
                className="showcase-text-button"
                disabled={media.disabled || detailsJob.status === "cancelling"}
                onClick={() => void media.cancel(detailsJob.id)}
              >
                取消此任务
              </button>
            )}
            {detailsJob.status === "completed" && detailsJob.output && (
              <button
                type="button"
                className="showcase-button"
                onClick={() => playJob(detailsJob)}
              >
                <Play aria-hidden="true" />
                播放成片
              </button>
            )}
          </>
        )}
      </LabDialog>
    </div>
  );
}
