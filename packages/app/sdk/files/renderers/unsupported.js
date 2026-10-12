export function renderUnsupported(root) {
  const text = root.ownerDocument.createElement("p");
  text.textContent = "此格式暂不支持内容预览，可以下载原文件查看。";
  Object.assign(text.style, {
    fontSize: "14px",
    textAlign: "center",
    color: "var(--muted-foreground, GrayText)",
  });
  root.append(text);
}
