export function renderMedia(
  root,
  resource,
  { signal, onError, mediaControls = true, onMediaReady, onMediaStateChange },
) {
  const media = root.ownerDocument.createElement(
    resource.kind === "audio" ? "audio" : "video",
  );
  media.controls = mediaControls;
  media.muted = !mediaControls;
  media.preload = "metadata";
  let closed = false;
  const publish = () => {
    if (!closed && !signal.aborted)
      onMediaStateChange?.({
        currentTime: media.currentTime,
        duration: Number.isFinite(media.duration) ? media.duration : 0,
        paused: media.paused,
        ended: media.ended,
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
  ];
  for (const event of events) media.addEventListener(event, publish);
  Object.assign(
    media.style,
    resource.kind === "audio"
      ? { width: "100%", maxWidth: "576px" }
      : { maxHeight: "100%", maxWidth: "100%" },
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
    for (const event of events) media.removeEventListener(event, publish);
    media.onerror = null;
    media.pause();
    media.removeAttribute("src");
    media.load();
    onMediaReady?.(null);
  };
}
