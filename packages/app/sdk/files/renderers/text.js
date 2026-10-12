const limit = 2 * 1024 * 1024;
export async function renderText(root, resource, { signal }) {
  let text = "";
  if (resource.size) {
    const response = await fetch(resource.resourceUrl, {
      credentials: "omit",
      signal,
      headers: { range: `bytes=0-${limit - 1}` },
    });
    if (!response.ok) throw new Error("文本预览已失效，请重新打开。");
    text = await response.text();
  }
  if (signal.aborted) return;
  const pre = root.ownerDocument.createElement("pre");
  Object.assign(pre.style, {
    width: "100%",
    height: "100%",
    margin: "0",
    whiteSpace: "pre-wrap",
    overflowWrap: "anywhere",
    fontSize: "14px",
  });
  pre.textContent =
    text + (resource.size > limit ? "\n\n（仅预览前 2 MiB）" : "");
  root.append(pre);
}
