export function renderMedia(
  root,
  resource,
  {
    signal,
    onError,
    mediaControls = true,
    onMediaReady,
    onMediaStateChange,
    layout,
  },
) {
  const media = root.ownerDocument.createElement(
    resource.kind === "audio" ? "audio" : "video",
  );
  const showControls =
    typeof mediaControls === "object"
      ? (mediaControls[resource.kind] ?? true)
      : mediaControls;
  media.controls = showControls;
  media.muted = !showControls && resource.kind === "video";
  media.preload = resource.kind === "video" ? "auto" : "metadata";
  if (resource.kind === "video") media.playsInline = true;
  let closed = false;
  const showFirstFrame = () => {
    if (closed || signal.aborted || !media.paused || media.currentTime !== 0)
      return;
    // A tiny seek asks WebKit to paint the first decoded frame without autoplay.
    try {
      media.currentTime = Math.min(
        0.001,
        Number.isFinite(media.duration) && media.duration > 0
          ? media.duration / 2
          : 0.001,
      );
    } catch {
      /* Keep native playback available when a format cannot seek yet. */
    }
  };
  if (resource.kind === "video")
    media.addEventListener("loadedmetadata", showFirstFrame, { once: true });
  const publish = () => {
    if (!closed && !signal.aborted)
      onMediaStateChange?.({
        currentTime: media.currentTime,
        duration: Number.isFinite(media.duration) ? media.duration : 0,
        paused: media.paused,
        ended: media.ended,
        muted: media.muted,
      });
  };
  const events = [
    "loadedmetadata",
    "durationchange",
    "timeupdate",
    "play",
    "pause",
    "ended",
    "seeked",
    "volumechange",
  ];
  for (const event of events) media.addEventListener(event, publish);
  Object.assign(
    media.style,
    resource.kind === "audio"
      ? { width: "100%", maxWidth: "576px" }
      : {
          display: "block",
          maxHeight:
            layout === "intrinsic"
              ? "var(--file-preview-max-height, 28rem)"
              : "100%",
          maxWidth: "100%",
        },
  );
  media.onerror = () => {
    if (!signal.aborted)
      onError(
        new Error("音视频无法播放，文件可能损坏或当前播放器不支持其编码。"),
      );
  };
  media.src = resource.resourceUrl;
  root.append(media);
  onMediaReady?.({
    async play() {
      if (!closed && !signal.aborted) await media.play();
    },
    pause() {
      if (!closed) media.pause();
    },
    setMuted(muted) {
      if (!closed && !signal.aborted) {
        media.muted = Boolean(muted);
        publish();
      }
    },
    seek(seconds) {
      if (
        closed ||
        signal.aborted ||
        !Number.isFinite(seconds) ||
        !Number.isFinite(media.duration)
      )
        return;
      media.currentTime = Math.max(0, Math.min(media.duration, seconds));
      publish();
    },
  });
  return () => {
    if (closed) return;
    closed = true;
    media.removeEventListener("loadedmetadata", showFirstFrame);
    for (const event of events) media.removeEventListener(event, publish);
    media.onerror = null;
    media.pause();
    media.removeAttribute("src");
    media.load();
    onMediaReady?.(null);
  };
}
