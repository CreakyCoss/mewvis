export function renderImage(
  root,
  resource,
  { signal, onError, layout, imageScale },
) {
  const image = root.ownerDocument.createElement("img");
  image.alt = resource.name;
  Object.assign(image.style, {
    display: "block",
    flexShrink: "0",
    maxHeight:
      imageScale === undefined
        ? layout === "intrinsic"
          ? "var(--file-preview-max-height, 28rem)"
          : "100%"
        : "none",
    maxWidth: imageScale === undefined ? "100%" : "none",
    objectFit: "contain",
  });
  image.onload = () => {
    if (!signal.aborted && Number.isFinite(imageScale) && imageScale > 0)
      image.style.width = `${image.naturalWidth * imageScale}px`;
  };
  image.onerror = () => {
    if (!signal.aborted) onError(new Error("图片无法显示，请检查文件格式。"));
  };
  image.referrerPolicy = "no-referrer";
  image.src = resource.resourceUrl;
  root.append(image);
  return () => {
    image.onload = null;
    image.onerror = null;
    image.removeAttribute("src");
  };
}
