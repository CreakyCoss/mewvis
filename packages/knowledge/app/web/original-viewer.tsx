import { useEffect, useRef, useState } from "react";
import {
  getDocument,
  GlobalWorkerOptions,
  type PDFDocumentProxy,
} from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "design-system/components/ui/dialog";
import { Button } from "design-system/components/ui/button";
import { downloadOriginal, type OriginalFile } from "./original-file.js";
GlobalWorkerOptions.workerSrc = workerUrl;
export function OriginalViewer({
  file,
  onClose,
}: {
  file: OriginalFile;
  onClose: () => void;
}) {
  const [pdf, setPdf] = useState<PDFDocumentProxy>();
  const [page, setPage] = useState(1),
    [width, setWidth] = useState(760),
    [error, setError] = useState("");
  const canvas = useRef<HTMLCanvasElement>(null),
    container = useRef<HTMLDivElement>(null);
  const isPdf =
    file.mediaType === "application/pdf" || /\.pdf$/i.test(file.fileName);
  useEffect(() => {
    if (!isPdf) return;
    const task = getDocument({
      data: Uint8Array.from(file.bytes),
      cMapUrl: "/assets/pdf-cmaps/",
      cMapPacked: true,
      standardFontDataUrl: "/assets/pdf-fonts/",
      useWasm: false,
      maxImageSize: 16_000_000,
    });
    let disposed = false;
    void task.promise.then(
      (value) => {
        if (!disposed) setPdf(value);
      },
      () => {
        if (!disposed) setError("原件预览失败，可以下载文件查看。");
      },
    );
    return () => {
      disposed = true;
      void task.destroy();
    };
  }, [file, isPdf]);
  useEffect(() => {
    if (!container.current) return;
    const observer = new ResizeObserver((entries) =>
      setWidth(Math.max(200, Math.floor(entries[0]!.contentRect.width) - 40)),
    );
    observer.observe(container.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (!pdf || !canvas.current) return;
    let disposed = false;
    let rendering:
      | ReturnType<Awaited<ReturnType<PDFDocumentProxy["getPage"]>>["render"]>
      | undefined;
    void pdf
      .getPage(page)
      .then(async (item) => {
        if (disposed || !canvas.current) return;
        const base = item.getViewport({ scale: 1 });
        const ratio = Math.min(window.devicePixelRatio || 1, 2);
        const viewport = item.getViewport({
          scale: Math.min(width / base.width, 2) * ratio,
        });
        const element = canvas.current;
        element.width = viewport.width;
        element.height = viewport.height;
        element.style.width = `${viewport.width / ratio}px`;
        element.style.height = `${viewport.height / ratio}px`;
        rendering = item.render({
          canvas: element,
          canvasContext: element.getContext("2d")!,
          viewport,
        });
        await rendering.promise;
      })
      .catch(() => {
        if (!disposed) setError("本页预览失败，可以下载原件查看。");
      });
    return () => {
      disposed = true;
      rendering?.cancel();
    };
  }, [pdf, page, width]);
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="knowledge-ui knowledge-original-dialog">
        <DialogTitle>{file.fileName}</DialogTitle>
        <DialogDescription>保存的原始文件</DialogDescription>
        <div className="knowledge-original-toolbar">
          {isPdf && (
            <>
              <Button
                variant="outline"
                disabled={!pdf || page === 1}
                onClick={() => setPage(page - 1)}
              >
                上一页
              </Button>
              <span>
                {pdf ? `第 ${page} / ${pdf.numPages} 页` : "正在加载…"}
              </span>
              <Button
                variant="outline"
                disabled={!pdf || page === pdf.numPages}
                onClick={() => setPage(page + 1)}
              >
                下一页
              </Button>
            </>
          )}
          <Button variant="outline" onClick={() => downloadOriginal(file)}>
            下载原件
          </Button>
        </div>
        <div className="knowledge-original-body" ref={container}>
          {error ? (
            <p role="alert">{error}</p>
          ) : isPdf ? (
            <canvas ref={canvas} role="img" aria-label={`PDF 第 ${page} 页`} />
          ) : (
            <pre>{new TextDecoder().decode(file.bytes)}</pre>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
