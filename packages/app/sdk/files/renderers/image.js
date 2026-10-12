export function renderImage(root, resource, { signal, onError }) {
  const image = root.ownerDocument.createElement("img");
  image.alt = resource.name;
  Object.assign(image.style, {
    maxHeight: "100%",
    maxWidth: "100%",
    objectFit: "contain",
  });
  image.onerror = () => {
    if (!signal.aborted) onError(new Error("图片无法显示，请检查文件格式。"));
  };
  image.referrerPolicy = "no-referrer";
  image.src = resource.resourceUrl;
  root.append(image);
  return () => {
    image.onerror = null;
    image.removeAttribute("src");
  };
}
