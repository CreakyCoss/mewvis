export function renderMedia(root, resource, { signal, onError }) {
  const media = root.ownerDocument.createElement(
    resource.kind === "audio" ? "audio" : "video",
  );
  media.controls = true;
  media.preload = "metadata";
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
  return () => {
    media.onerror = null;
    media.pause();
    media.removeAttribute("src");
    media.load();
  };
}
