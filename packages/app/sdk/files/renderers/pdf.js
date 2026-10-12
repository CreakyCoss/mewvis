let runtime;
async function pdfRuntime(resource, win) {
  if (!resource.pdfSource) throw new Error("当前宿主未提供 PDF 预览运行时");
  if (!runtime) {
    const url = win.URL.createObjectURL(
      new win.Blob([resource.pdfSource], { type: "text/javascript" }),
    );
    runtime = import(/* @vite-ignore */ url)
      .finally(() => win.URL.revokeObjectURL(url))
      .catch((error) => {
        runtime = undefined;
        throw error;
      });
  }
  return runtime;
}

/** Canvas-only PDF rendering with one self-contained, host-supplied worker. */
export async function renderPdf(root, resource, { signal, onError }) {
  if (resource.size > 64 * 1024 * 1024)
    throw new Error("PDF 超过 64 MiB 预览上限，请打开原文件查看。");
  if (!resource.workerSource) throw new Error("当前宿主未提供 PDF 预览运行时");
  const owner = root.ownerDocument,
    win = owner.defaultView;
  const { AnnotationMode, GlobalWorkerOptions, getDocument } = await pdfRuntime(
    resource,
    win,
  );
  const workerUrl = win.URL.createObjectURL(
    new win.Blob([resource.workerSource], { type: "text/javascript" }),
  );
  GlobalWorkerOptions.workerSrc = workerUrl;
  let task,
    pdf,
    rendering,
    pageNumber = 1,
    generation = 0,
    disposed = false;
  const wrap = owner.createElement("div"),
    toolbar = owner.createElement("div"),
    body = owner.createElement("div");
  Object.assign(wrap.style, {
    display: "flex",
    flexDirection: "column",
    width: "100%",
    height: "100%",
    minWidth: "0",
    gap: "12px",
  });
  Object.assign(toolbar.style, {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "12px",
    flexShrink: "0",
  });
  Object.assign(body.style, {
    position: "relative",
    flex: "1",
    minHeight: "0",
    overflow: "auto",
    padding: "8px",
  });
  const previous = owner.createElement("button"),
    next = owner.createElement("button"),
    counter = owner.createElement("span");
  previous.type = next.type = "button";
  previous.textContent = "‹";
  next.textContent = "›";
  previous.setAttribute("aria-label", "PDF 上一页");
  next.setAttribute("aria-label", "PDF 下一页");
  for (const button of [previous, next])
    Object.assign(button.style, {
      width: "36px",
      height: "36px",
      border: "1px solid var(--border, #ddd)",
      borderRadius: "8px",
      background: "var(--background, Canvas)",
      color: "inherit",
      font: "inherit",
      cursor: "pointer",
    });
  counter.style.fontSize = "14px";
  counter.textContent = "正在加载 PDF";
  const canvas = owner.createElement("canvas"),
    text = owner.createElement("p");
  canvas.setAttribute("role", "img");
  Object.assign(canvas.style, {
    display: "block",
    margin: "0 auto",
    background: "white",
    boxShadow: "0 1px 4px #0002",
  });
  text.setAttribute("aria-label", "本页文字内容");
  Object.assign(text.style, {
    position: "absolute",
    width: "1px",
    height: "1px",
    overflow: "hidden",
    clipPath: "inset(50%)",
  });
  toolbar.append(previous, counter, next);
  body.append(canvas, text);
  wrap.append(toolbar, body);
  root.append(wrap);
  async function render() {
    const revision = ++generation;
    rendering?.cancel();
    previous.disabled = next.disabled = true;
    canvas.style.visibility = "hidden";
    text.textContent = "";
    try {
      const page = await pdf.getPage(pageNumber);
      if (disposed || revision !== generation) return;
      const base = page.getViewport({ scale: 1 });
      const width = Math.max(160, Math.min(1100, wrap.clientWidth - 32));
      const viewport = page.getViewport({
          scale: Math.min(width / base.width, 2048 / base.height),
        }),
        ratio = Math.min(win.devicePixelRatio || 1, 2);
      canvas.width = Math.max(1, Math.floor(viewport.width * ratio));
      canvas.height = Math.max(1, Math.floor(viewport.height * ratio));
      canvas.style.width = viewport.width + "px";
      canvas.style.height = viewport.height + "px";
      canvas.setAttribute("aria-label", `PDF 第 ${pageNumber} 页`);
      rendering = page.render({
        canvas,
        viewport,
        transform: ratio === 1 ? undefined : [ratio, 0, 0, ratio, 0, 0],
        annotationMode: AnnotationMode.DISABLE,
      });
      await rendering.promise;
      const contents = await page.getTextContent();
      if (disposed || revision !== generation) return;
      text.textContent = contents.items
        .map((item) => ("str" in item ? item.str : ""))
        .join(" ")
        .slice(0, 50_000);
      canvas.style.visibility = "visible";
      counter.textContent = `第 ${pageNumber} 页 / ${pdf.numPages} 页`;
      previous.disabled = pageNumber <= 1;
      next.disabled = pageNumber >= pdf.numPages;
    } catch (error) {
      if (
        !disposed &&
        revision === generation &&
        error?.name !== "RenderingCancelledException"
      )
        onError(error);
    }
  }
  previous.onclick = () => {
    if (pageNumber > 1) {
      pageNumber--;
      void render();
    }
  };
  next.onclick = () => {
    if (pageNumber < pdf.numPages) {
      pageNumber++;
      void render();
    }
  };
  const resize = new win.ResizeObserver(() => {
    if (pdf && !disposed) void render();
  });
  resize.observe(wrap);
  const cleanup = () => {
    if (disposed) return;
    disposed = true;
    generation++;
    resize.disconnect();
    rendering?.cancel();
    void task?.destroy().catch(() => {});
    win.URL.revokeObjectURL(workerUrl);
  };
  signal.addEventListener("abort", cleanup, { once: true });
  try {
    const response = await fetch(resource.resourceUrl, {
      credentials: "omit",
      signal,
    });
    if (!response.ok) throw new Error("PDF 预览已失效，请重新打开。");
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (signal.aborted) {
      cleanup();
      return cleanup;
    }
    task = getDocument({
      data: bytes,
      useSystemFonts: true,
      useWasm: false,
      isEvalSupported: false,
      maxImageSize: 25_000_000,
      enableXfa: false,
    });
    pdf = await task.promise;
    if (!disposed) await render();
    return cleanup;
  } catch (error) {
    cleanup();
    throw error;
  }
}
