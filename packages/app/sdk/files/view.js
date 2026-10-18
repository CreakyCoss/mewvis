import { renderImage } from "./renderers/image.js";
import { renderMedia } from "./renderers/media.js";
import { renderText } from "./renderers/text.js";
import { renderUnsupported } from "./renderers/unsupported.js";

const renderers = {
  image: renderImage,
  video: renderMedia,
  audio: renderMedia,
  text: renderText,
  unsupported: renderUnsupported,
  pdf: async (...args) =>
    (await import("./renderers/pdf.js")).renderPdf(...args),
};
/** Shared renderer used by the SDK React components, imperative API and host UI. */
export function renderFilePreview(container, resource, options = {}) {
  const document = container?.ownerDocument;
  if (
    !document?.defaultView ||
    !(container instanceof document.defaultView.HTMLElement)
  )
    throw new Error("文件预览需要有效的 HTML 容器");
  const root = document.createElement("div");
  root.dataset.filePreview = resource.id;
  Object.assign(root.style, {
    position: "relative",
    display: "flex",
    width: "100%",
    height: "100%",
    minWidth: "0",
    minHeight: "0",
    alignItems: "center",
    justifyContent: "center",
    overflow: "auto",
    font: "inherit",
  });
  container.replaceChildren(root);
  const controller = new AbortController();
  let cleanup;
  const showError = (error) => {
    if (controller.signal.aborted) return;
    const node = document.createElement("p");
    node.setAttribute("role", "alert");
    node.textContent = String(error?.message ?? error);
    Object.assign(node.style, {
      fontSize: "14px",
      color: "var(--destructive, #b91c1c)",
      padding: "16px",
      overflowWrap: "anywhere",
    });
    root.replaceChildren(node);
    options.onError?.(new Error(node.textContent));
  };
  const ready = (async () => {
    if (typeof resource.resourceUrl !== "string")
      throw new Error("当前宿主未提供受限文件资源地址");
    cleanup = await (renderers[resource.kind] ?? renderUnsupported)(
      root,
      resource,
      { ...options, signal: controller.signal, onError: showError },
    );
    if (controller.signal.aborted) cleanup?.();
    else options.onReady?.(resource);
  })().catch((error) => {
    showError(error);
    throw error;
  });
  void ready.catch(() => {});
  return {
    ready,
    close() {
      controller.abort();
      cleanup?.();
      root.remove();
    },
    fail: showError,
  };
}

/** Owns a scoped lease and closes it on explicit close, expiry, revocation or DOM removal. */
export function mountFilePreview(container, input, files, options = {}) {
  const document = container?.ownerDocument;
  if (
    !document?.defaultView ||
    !(container instanceof document.defaultView.HTMLElement) ||
    !container.isConnected
  )
    throw new Error("文件预览容器必须已挂载到页面");
  let disposed = false,
    stopped = false,
    resource,
    renderer,
    timer,
    release;
  const loading = document.createElement("p");
  loading.setAttribute("role", "status");
  loading.textContent = "正在加载预览";
  container.replaceChildren(loading);
  let statusNode = loading;
  const observer = new document.defaultView.MutationObserver(() => {
    if (
      !container.isConnected ||
      !container.contains(renderer ? rendererRoot : statusNode)
    )
      void close();
  });
  let rendererRoot;
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
  });
  const unsubscribe = files.preview.subscribe((event) => {
    if (resource?.id === event.id) stop("预览已关闭或过期，请重新打开。");
  });
  function releaseResource() {
    if (resource) release ??= files.preview.close(resource.id).catch(() => {});
    return release;
  }
  function stop(message) {
    if (disposed || stopped) return;
    stopped = true;
    clearTimeout(timer);
    renderer?.close();
    renderer = undefined;
    statusNode = document.createElement("p");
    statusNode.setAttribute("role", "alert");
    statusNode.textContent = message;
    container.replaceChildren(statusNode);
    void releaseResource();
  }
  async function close() {
    if (disposed) return;
    disposed = true;
    clearTimeout(timer);
    observer.disconnect();
    unsubscribe();
    renderer?.close();
    if (container.contains(statusNode)) statusNode.remove();
    await releaseResource();
  }
  const ready = (async () => {
    resource = await files.preview.create(input);
    if (disposed) {
      await releaseResource();
      return;
    }
    timer = setTimeout(
      () => stop("预览已关闭或过期，请重新打开。"),
      Math.max(0, resource.expiresAt - Date.now()),
    );
    renderer = renderFilePreview(container, resource, {
      ...options,
      onError: (error) => stop(error.message),
    });
    rendererRoot = container.firstElementChild;
    await renderer.ready;
  })().catch((error) => {
    if (!disposed) stop(String(error?.message ?? error));
    throw error;
  });
  void ready.catch(() => {});
  return { ready, close };
}
