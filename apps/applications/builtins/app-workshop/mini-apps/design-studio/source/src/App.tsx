import {
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import {
  layer,
  template,
  restore,
  hitTest,
  sizes,
  fitSize,
  MAX_BYTES,
  type Design,
  type Layer,
  type Kind,
} from "./model";
import { renderDesign, htmlDocument } from "./render";
import { readImage, exportFile } from "./files";
import { useDesign } from "./useDesign";
import platform from "./art/platform";

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="ds-field">
      <span>{label}</span>
      {children}
    </label>
  );
}
function Numeric({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
}: {
  label: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  onChange(n: number): void;
}) {
  return (
    <Field label={label}>
      <input
        type="number"
        aria-label={label}
        value={Math.round(value * 100) / 100}
        min={min}
        max={max}
        step={step}
        onChange={(e) => {
          if (e.target.value !== "" && Number.isFinite(e.target.valueAsNumber))
            onChange(
              Math.max(
                min ?? -4800,
                Math.min(max ?? 4800, e.target.valueAsNumber),
              ),
            );
        }}
      />
    </Field>
  );
}
function Modal({
  title,
  children,
  close,
}: {
  title: string;
  children: ReactNode;
  close(): void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current!.showModal();
    return () => ref.current?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className="ds-modal"
      aria-label={title}
      onCancel={(e) => {
        e.preventDefault();
        close();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <header>
        <h2>{title}</h2>
        <button onClick={close} aria-label="关闭对话框">
          ×
        </button>
      </header>
      {children}
    </dialog>
  );
}

export default function App() {
  const { design, setDesign, ready, loadError, status, retryLoad, retrySave } =
    useDesign();
  const current = useRef(design);
  current.current = design;
  const history = useRef<{ past: Design[]; future: Design[] }>({
    past: [],
    future: [],
  });
  const [, historyChanged] = useState(0);
  const [selected, select] = useState<string | null>(null);
  const item = design.layers.find((item) => item.id === selected);
  const [error, setError] = useState("");
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [zoom, setZoom] = useState("fit");
  const [scale, setScale] = useState(0.4);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{
    path: string;
    error: string;
    url?: string;
    text?: string;
    label: string;
  } | null>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const viewport = useRef<HTMLDivElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const imageInput = useRef<HTMLInputElement>(null);
  const designInput = useRef<HTMLInputElement>(null);
  const textInput = useRef<HTMLTextAreaElement>(null);
  const drag = useRef<{
    startX: number;
    startY: number;
    item: Layer;
    before: Design;
    resize: boolean;
    moved: boolean;
  } | null>(null);
  const report = (error: unknown) =>
    setError(error instanceof Error ? error.message : String(error));

  function remember(before: Design) {
    history.current.past = [...history.current.past.slice(-49), before];
    history.current.future = [];
    historyChanged((n) => n + 1);
  }
  function commit(next: Design) {
    try {
      const checked = restore(next);
      if (JSON.stringify(checked) === JSON.stringify(current.current)) return;
      remember(current.current);
      current.current = checked;
      setDesign(checked);
      setError("");
    } catch (error) {
      report(error);
    }
  }
  function patch(values: Partial<Layer>) {
    if (!item || item.locked) return;
    commit({
      ...current.current,
      layers: current.current.layers.map((layer) =>
        layer.id === item.id ? { ...layer, ...values } : layer,
      ),
    });
  }
  function add(kind: Kind, values: Partial<Layer> = {}) {
    if (design.layers.length >= 50) {
      setError("每张设计最多添加 50 个图层。");
      return;
    }
    const entry = layer(kind, {
      x: Math.round(design.width * 0.15),
      y: Math.round(design.height * 0.2),
      width: kind === "text" ? Math.min(800, design.width * 0.65) : 320,
      ...values,
    });
    commit({ ...current.current, layers: [...current.current.layers, entry] });
    select(entry.id);
  }
  function duplicate() {
    if (!item) return;
    add(item.kind, {
      ...item,
      id: crypto.randomUUID(),
      name: item.name + " 副本",
      x: item.x + 28,
      y: item.y + 28,
      locked: false,
    });
  }
  function remove() {
    if (!item || item.locked) return;
    commit({
      ...current.current,
      layers: current.current.layers.filter((layer) => layer.id !== item.id),
    });
    select(null);
  }
  function reorder(direction: number) {
    if (!item || item.locked) return;
    const layers = [...current.current.layers];
    const index = layers.findIndex((layer) => layer.id === item.id),
      target = Math.max(0, Math.min(layers.length - 1, index + direction));
    [layers[index], layers[target]] = [layers[target], layers[index]];
    commit({ ...current.current, layers });
  }
  function undo(forward = false) {
    const from = forward ? history.current.future : history.current.past;
    const before = from.pop();
    if (!before) return;
    (forward ? history.current.past : history.current.future).push(
      current.current,
    );
    current.current = before;
    setDesign(before);
    select(null);
    historyChanged((n) => n + 1);
  }
  function point(event: ReactPointerEvent) {
    const bounds = stage.current!.getBoundingClientRect();
    return {
      x: (event.clientX - bounds.left) / scale,
      y: (event.clientY - bounds.top) / scale,
    };
  }
  function pointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return;
    const { x, y } = point(event);
    const resize = (event.target as HTMLElement).dataset.resize === "true";
    const target = resize ? item : hitTest(current.current, x, y);
    select(target?.id ?? null);
    event.currentTarget.focus();
    if (!target || target.locked) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = {
      startX: x,
      startY: y,
      item: target,
      before: current.current,
      resize,
      moved: false,
    };
  }
  function pointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const value = drag.current;
    if (!value) return;
    const { x, y } = point(event),
      dx = x - value.startX,
      dy = y - value.startY;
    if (Math.abs(dx) + Math.abs(dy) < 1 && !value.moved) return;
    value.moved = true;
    let change: Partial<Layer> = {
      x: Math.round(value.item.x + dx),
      y: Math.round(value.item.y + dy),
    };
    if (value.resize) {
      const angle = (value.item.rotation * Math.PI) / 180,
        cos = Math.cos(angle),
        sin = Math.sin(angle);
      const width = Math.max(
        24,
        Math.min(4800, value.item.width + dx * cos + dy * sin),
      );
      const height = Math.max(
        24,
        Math.min(4800, value.item.height - dx * sin + dy * cos),
      );
      const dw = width - value.item.width,
        dh = height - value.item.height;
      change = {
        width: Math.round(width),
        height: Math.round(height),
        x: Math.round(value.item.x + (dw * cos - dh * sin - dw) / 2),
        y: Math.round(value.item.y + (dw * sin + dh * cos - dh) / 2),
      };
    }
    const next = {
      ...value.before,
      layers: value.before.layers.map((layer) =>
        layer.id === value.item.id ? { ...layer, ...change } : layer,
      ),
    };
    current.current = next;
    setDesign(next);
  }
  function pointerUp(event: ReactPointerEvent<HTMLDivElement>) {
    if (drag.current?.moved) remember(drag.current.before);
    drag.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
  }
  useEffect(() => {
    if (!ready || !viewport.current) return;
    const resize = new ResizeObserver(([entry]) => {
      const fit = Math.min(
        (entry.contentRect.width - 70) / design.width,
        (entry.contentRect.height - 70) / design.height,
        1,
      );
      setScale(zoom === "fit" ? Math.max(0.08, fit) : Number(zoom));
    });
    resize.observe(viewport.current);
    return () => resize.disconnect();
  }, [ready, design.width, design.height, zoom]);
  useEffect(() => {
    if (!ready || !canvas.current) return;
    let active = true;
    const target = canvas.current,
      buffer = document.createElement("canvas");
    renderDesign(buffer, design)
      .then(() => {
        if (!active) return;
        target.width = buffer.width;
        target.height = buffer.height;
        target.getContext("2d")!.drawImage(buffer, 0, 0);
      })
      .catch((error) => {
        if (active) report(error);
      });
    return () => {
      active = false;
    };
  }, [design, ready]);
  useEffect(
    () => () => {
      if (result?.url) URL.revokeObjectURL(result.url);
    },
    [result],
  );

  async function importImage(file?: File) {
    if (!file) return;
    try {
      const image = await readImage(file);
      const width = Math.min(design.width * 0.6, image.width),
        height = (width * image.height) / image.width;
      add("image", {
        src: image.src,
        width,
        height,
        name: file.name.slice(0, 80),
      });
    } catch (error) {
      report(error);
    }
  }
  async function importDesign(file?: File) {
    if (!file) return;
    try {
      if (file.size > MAX_BYTES) throw new Error("设计文件最多 200 KiB。");
      commit(restore(JSON.parse(await file.text())));
      select(null);
    } catch (error) {
      report(error);
    }
  }
  async function output(kind: "png" | "json" | "html") {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const snapshot = current.current;
      let blob: Blob;
      let label = "设计文件";
      if (kind === "png") {
        const size = fitSize(snapshot.width, snapshot.height);
        const buffer = document.createElement("canvas");
        await renderDesign(buffer, snapshot, size.width, size.height);
        blob = await new Promise<Blob>((resolve, reject) =>
          buffer.toBlob(
            (blob) =>
              blob ? resolve(blob) : reject(new Error("图片导出失败。")),
            "image/png",
          ),
        );
        label = `${size.width} × ${size.height} PNG`;
      } else if (kind === "json")
        blob = new Blob([JSON.stringify(snapshot, null, 2)], {
          type: "application/json",
        });
      else
        blob = new Blob([htmlDocument(snapshot)], {
          type: "text/html;charset=utf-8",
        });
      let path = "",
        error = "";
      try {
        path = await exportFile(blob, `design-${Date.now()}.${kind}`);
      } catch (value) {
        error = value instanceof Error ? value.message : String(value);
      }
      setResult({
        path,
        error,
        label,
        ...(kind === "png"
          ? { url: URL.createObjectURL(blob) }
          : { text: await blob.text() }),
      });
    } catch (error) {
      report(error);
    } finally {
      setBusy(false);
    }
  }

  if (loadError)
    return (
      <main className="ds-loading" role="alert">
        <h1>暂时无法载入设计</h1>
        <p>{loadError}</p>
        <button onClick={retryLoad}>重新加载</button>
      </main>
    );
  if (!ready)
    return (
      <main className="ds-loading" role="status">
        正在打开设计画布…
      </main>
    );
  const selectedStyle = item
    ? {
        left: item.x * scale,
        top: item.y * scale,
        width: item.width * scale,
        height: item.height * scale,
        transform: `rotate(${item.rotation}deg)`,
      }
    : {};
  return (
    <main
      className="ds-app"
      onKeyDown={(event) => {
        if (
          (event.target as HTMLElement).closest("input,textarea,select") ||
          templatesOpen ||
          result
        )
          return;
        if (
          (event.metaKey || event.ctrlKey) &&
          event.key.toLowerCase() === "z"
        ) {
          event.preventDefault();
          undo(event.shiftKey);
        } else if (
          (event.metaKey || event.ctrlKey) &&
          event.key.toLowerCase() === "d"
        ) {
          event.preventDefault();
          duplicate();
        } else if (["Delete", "Backspace"].includes(event.key)) {
          event.preventDefault();
          remove();
        } else if (event.key === "Escape") select(null);
        else if (
          item &&
          !item.locked &&
          ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(
            event.key,
          )
        ) {
          event.preventDefault();
          const n = event.shiftKey ? 10 : 1;
          patch({
            x:
              item.x +
              (event.key === "ArrowLeft"
                ? -n
                : event.key === "ArrowRight"
                  ? n
                  : 0),
            y:
              item.y +
              (event.key === "ArrowUp"
                ? -n
                : event.key === "ArrowDown"
                  ? n
                  : 0),
          });
        }
      }}
    >
      <header className="ds-toolbar">
        <div className="ds-brand">
          <span className="ds-brand-mark" aria-hidden="true">
            ◧
          </span>
          <strong>设计画布</strong>
        </div>
        <input
          className="ds-title"
          aria-label="设计名称"
          value={design.title}
          maxLength={80}
          onChange={(e) => commit({ ...design, title: e.target.value })}
        />
        <div className="ds-history">
          <button
            title="撤销 · Ctrl/Cmd Z"
            aria-label="撤销"
            disabled={!history.current.past.length}
            onClick={() => undo()}
          >
            ↶
          </button>
          <button
            title="重做 · Ctrl/Cmd Shift Z"
            aria-label="重做"
            disabled={!history.current.future.length}
            onClick={() => undo(true)}
          >
            ↷
          </button>
        </div>
        <span className="ds-status" role="status">
          {status}
        </span>
        {status.startsWith("保存失败") && (
          <button onClick={retrySave}>重试保存</button>
        )}
        <div className="ds-export">
          <button disabled={busy} onClick={() => void output("json")}>
            保存设计
          </button>
          <button disabled={busy} onClick={() => void output("html")}>
            导出 HTML
          </button>
          <button
            className="ds-primary"
            disabled={busy}
            onClick={() => void output("png")}
          >
            {busy ? "正在导出…" : "导出高清 PNG"}
          </button>
        </div>
      </header>
      {error && (
        <div className="ds-error" role="alert">
          <span>{error}</span>
          <button aria-label="关闭提示" onClick={() => setError("")}>
            ×
          </button>
        </div>
      )}
      <div className="ds-body">
        <aside className="ds-sidebar" aria-label="素材和图层">
          <div className="ds-sidebar-heading">
            <strong>从这里开始</strong>
            <span>自由组合你的画面</span>
          </div>
          <div className="ds-add-grid">
            <button onClick={() => add("text")}>
              <b>T</b>文字
            </button>
            <button onClick={() => add("rect")}>
              <b>▭</b>矩形
            </button>
            <button onClick={() => add("ellipse")}>
              <b>○</b>圆形
            </button>
            <button onClick={() => imageInput.current?.click()}>
              <b>▧</b>图片
            </button>
          </div>
          <button
            className="ds-template-button"
            onClick={() => setTemplatesOpen(true)}
          >
            选择起始模板 <span>↗</span>
          </button>
          <button
            className="ds-import-button"
            onClick={() => designInput.current?.click()}
          >
            导入设计文件
          </button>
          <input
            ref={imageInput}
            type="file"
            hidden
            accept="image/png,image/jpeg,image/webp"
            onChange={(e) => {
              void importImage(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
          <input
            ref={designInput}
            type="file"
            hidden
            accept=".json,application/json"
            onChange={(e) => {
              void importDesign(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
          <div className="ds-layer-heading">
            <strong>图层</strong>
            <span>{design.layers.length} / 50</span>
          </div>
          <div className="ds-layers">
            {design.layers.length === 0 && (
              <p className="ds-empty">
                画布还是空的。
                <br />
                添加一段文字试试。
              </p>
            )}
            {[...design.layers].reverse().map((entry) => (
              <div
                key={entry.id}
                className={`ds-layer ${entry.id === selected ? "is-selected" : ""}`}
              >
                <button
                  className="ds-layer-select"
                  aria-label={`选择图层：${entry.name}`}
                  aria-pressed={entry.id === selected}
                  onClick={() => select(entry.id)}
                >
                  <span aria-hidden="true">
                    {
                      { text: "T", rect: "▭", ellipse: "○", image: "▧" }[
                        entry.kind
                      ]
                    }
                  </span>
                  <span>{entry.name}</span>
                </button>
                <button
                  title={entry.hidden ? "显示图层" : "隐藏图层"}
                  aria-label={`${entry.hidden ? "显示" : "隐藏"}图层：${entry.name}`}
                  onClick={() =>
                    commit({
                      ...design,
                      layers: design.layers.map((layer) =>
                        layer.id === entry.id
                          ? { ...layer, hidden: !layer.hidden }
                          : layer,
                      ),
                    })
                  }
                >
                  {entry.hidden ? "−" : "·"}
                </button>
                <button
                  title={entry.locked ? "解锁图层" : "锁定图层"}
                  aria-label={`${entry.locked ? "解锁" : "锁定"}图层：${entry.name}`}
                  onClick={() =>
                    commit({
                      ...design,
                      layers: design.layers.map((layer) =>
                        layer.id === entry.id
                          ? { ...layer, locked: !layer.locked }
                          : layer,
                      ),
                    })
                  }
                >
                  {entry.locked ? "◆" : "◇"}
                </button>
              </div>
            ))}
          </div>
          <p className="ds-shortcuts">
            方向键微调 · Shift 加速
            <br />
            Delete 删除 · Ctrl/Cmd Z 撤销
          </p>
        </aside>
        <section className="ds-workspace" aria-label="设计工作区">
          <div className="ds-canvas-bar">
            <span>
              {design.width} × {design.height} px
            </span>
            <label>
              缩放{" "}
              <select
                aria-label="画布缩放"
                value={zoom}
                onChange={(e) => setZoom(e.target.value)}
              >
                <option value="fit">适应窗口</option>
                <option value="0.25">25%</option>
                <option value="0.5">50%</option>
                <option value="1">100%</option>
              </select>
            </label>
          </div>
          <div className="ds-viewport" ref={viewport}>
            <div
              className="ds-artboard"
              ref={stage}
              tabIndex={0}
              aria-label="编辑画布，方向键移动选中图层"
              style={{
                width: design.width * scale,
                height: design.height * scale,
              }}
              onPointerDown={pointerDown}
              onPointerMove={pointerMove}
              onPointerUp={pointerUp}
              onLostPointerCapture={() => {
                if (drag.current?.moved) remember(drag.current.before);
                drag.current = null;
              }}
              onPointerCancel={pointerUp}
              onDoubleClick={() => {
                if (item?.kind === "text") textInput.current?.focus();
              }}
            >
              <canvas
                ref={canvas}
                aria-label={`${design.title}的设计预览`}
                style={{ width: "100%", height: "100%" }}
              />
              {item && !item.hidden && (
                <div
                  className={`ds-selection ${item.locked ? "is-locked" : ""}`}
                  style={selectedStyle}
                >
                  <span>{item.name}</span>
                  {!item.locked && (
                    <button
                      className="ds-resize"
                      data-resize="true"
                      aria-label="拖动调整图层大小"
                      tabIndex={-1}
                    />
                  )}
                </div>
              )}
            </div>
          </div>
          <footer className="ds-canvas-footer">
            <span>
              {item
                ? `${item.name}${item.locked ? " · 已锁定" : " · 拖动移动，右下角调整大小"}`
                : "点击选择图层，也可以从左侧添加内容"}
            </span>
            <span>PNG 导出长边 3840 px</span>
          </footer>
        </section>
        <aside className="ds-properties" aria-label="设计属性">
          <div className="ds-properties-heading">
            <strong>{item ? "图层属性" : "画布设置"}</strong>
            {item && <button onClick={() => select(null)}>画布</button>}
          </div>
          {!item ? (
            <>
              <Field label="画布比例">
                <select
                  value={
                    sizes.find(
                      (size) =>
                        size.width === design.width &&
                        size.height === design.height,
                    )?.label ?? "custom"
                  }
                  onChange={(e) => {
                    const size = sizes.find(
                      (size) => size.label === e.target.value,
                    );
                    if (size)
                      commit({
                        ...design,
                        width: size.width,
                        height: size.height,
                      });
                  }}
                >
                  <option value="custom">自定义尺寸</option>
                  {sizes.map((size) => (
                    <option key={size.label} value={size.label}>
                      {size.label}
                    </option>
                  ))}
                </select>
              </Field>
              <div className="ds-pair">
                <Numeric
                  label="画布宽度"
                  value={design.width}
                  min={320}
                  max={2400}
                  onChange={(width) =>
                    commit({ ...design, width: Math.round(width) })
                  }
                />
                <Numeric
                  label="画布高度"
                  value={design.height}
                  min={320}
                  max={2400}
                  onChange={(height) =>
                    commit({ ...design, height: Math.round(height) })
                  }
                />
              </div>
              <Field label="背景颜色">
                <div className="ds-color">
                  <input
                    type="color"
                    aria-label="背景颜色"
                    value={design.background}
                    onChange={(e) =>
                      commit({ ...design, background: e.target.value })
                    }
                  />
                  <span>{design.background}</span>
                </div>
              </Field>
              <p className="ds-help">
                改变画布尺寸后，图层仍保留原有位置和大小。
              </p>
              <div className="ds-property-note">
                <strong>一张画布，多种用途</strong>
                <p>
                  介绍图、活动海报、课程封面、社交配图……从模板开始，也可以自由组合。
                </p>
                <p>保存设计文件后，可再次导入编辑。HTML 可独立打开查看。</p>
              </div>
            </>
          ) : (
            <fieldset disabled={item.locked} className="ds-layer-properties">
              {item.locked && (
                <p className="ds-help">图层已锁定。在左侧点击 ◆ 解锁。</p>
              )}
              <Field label="图层名称">
                <input
                  aria-label="图层名称"
                  value={item.name}
                  maxLength={80}
                  onChange={(e) => patch({ name: e.target.value })}
                />
              </Field>
              {item.kind === "text" && (
                <Field label="文字内容">
                  <textarea
                    ref={textInput}
                    aria-label="文字内容"
                    rows={4}
                    maxLength={3000}
                    value={item.text}
                    onChange={(e) => patch({ text: e.target.value })}
                  />
                </Field>
              )}
              <div className="ds-pair">
                <Numeric
                  label="X 位置"
                  value={item.x}
                  onChange={(x) => patch({ x })}
                />
                <Numeric
                  label="Y 位置"
                  value={item.y}
                  onChange={(y) => patch({ y })}
                />
                <Numeric
                  label="图层宽度"
                  value={item.width}
                  min={1}
                  onChange={(width) => patch({ width })}
                />
                <Numeric
                  label="图层高度"
                  value={item.height}
                  min={1}
                  onChange={(height) => patch({ height })}
                />
              </div>
              {item.kind === "text" && (
                <>
                  <Field label="字体">
                    <select
                      aria-label="字体"
                      value={item.fontFamily}
                      onChange={(e) =>
                        patch({
                          fontFamily: e.target.value as Layer["fontFamily"],
                        })
                      }
                    >
                      <option value="sans">简洁黑体</option>
                      <option value="serif">典雅宋体</option>
                      <option value="mono">等宽字体</option>
                    </select>
                  </Field>
                  <div className="ds-pair">
                    <Numeric
                      label="文字字号"
                      value={item.fontSize}
                      min={8}
                      max={400}
                      onChange={(fontSize) => patch({ fontSize })}
                    />
                    <Numeric
                      label="行高倍数"
                      value={item.lineHeight}
                      min={0.8}
                      max={3}
                      step={0.1}
                      onChange={(lineHeight) => patch({ lineHeight })}
                    />
                  </div>
                  <div className="ds-text-controls">
                    <button
                      aria-label="粗体"
                      aria-pressed={item.fontWeight === 700}
                      onClick={() =>
                        patch({
                          fontWeight: item.fontWeight === 700 ? 400 : 700,
                        })
                      }
                    >
                      <b>B</b>
                    </button>
                    {(["left", "center", "right"] as const).map(
                      (align, index) => (
                        <button
                          key={align}
                          aria-label={["左对齐", "居中", "右对齐"][index]}
                          aria-pressed={item.align === align}
                          onClick={() => patch({ align })}
                        >
                          {["左", "中", "右"][index]}
                        </button>
                      ),
                    )}
                  </div>
                  <p className="ds-help">
                    文字按选框宽度换行；显示不全时增大图层高度。
                  </p>
                </>
              )}
              {item.kind !== "image" && (
                <Field label={item.kind === "text" ? "文字颜色" : "填充颜色"}>
                  <div className="ds-color">
                    <input
                      type="color"
                      aria-label={
                        item.kind === "text" ? "文字颜色" : "填充颜色"
                      }
                      value={item.fill}
                      onChange={(e) => patch({ fill: e.target.value })}
                    />
                    <span>{item.fill}</span>
                  </div>
                </Field>
              )}
              {item.kind === "rect" && (
                <Numeric
                  label="圆角"
                  value={item.radius}
                  min={0}
                  max={2400}
                  onChange={(radius) => patch({ radius })}
                />
              )}
              <div className="ds-pair">
                <Numeric
                  label="旋转角度"
                  value={item.rotation}
                  min={-360}
                  max={360}
                  onChange={(rotation) => patch({ rotation })}
                />
                <Numeric
                  label="不透明度 %"
                  value={item.opacity * 100}
                  min={0}
                  max={100}
                  onChange={(opacity) => patch({ opacity: opacity / 100 })}
                />
              </div>
              <div className="ds-arrange">
                <button
                  onClick={() => patch({ x: (design.width - item.width) / 2 })}
                >
                  水平居中
                </button>
                <button
                  onClick={() =>
                    patch({ y: (design.height - item.height) / 2 })
                  }
                >
                  垂直居中
                </button>
                <button onClick={() => reorder(1)}>上移一层</button>
                <button onClick={() => reorder(-1)}>下移一层</button>
              </div>
              <div className="ds-arrange ds-layer-actions">
                <button onClick={duplicate}>复制图层</button>
                <button className="ds-danger" onClick={remove}>
                  删除图层
                </button>
              </div>
            </fieldset>
          )}
        </aside>
      </div>
      {templatesOpen && (
        <Modal title="从一个想法开始" close={() => setTemplatesOpen(false)}>
          <p className="ds-modal-description">
            每个模板都由可自由修改的图层组成。
          </p>
          <div className="ds-template-grid">
            {(
              [
                ["blank", "空白画布", "从零开始，自由创作"],
                ["intro", "介绍图", "清晰表达一个想法"],
                ["event", "活动海报", "为下一次相聚留个位置"],
                ["mewvis", "Mewvis 项目介绍", "用现有推广内容开始"],
              ] as const
            ).map(([kind, label, description]) => (
              <button
                key={kind}
                className={`ds-template ds-template-${kind}`}
                onClick={() => {
                  commit(template(kind, platform));
                  select(null);
                  setTemplatesOpen(false);
                  setZoom("fit");
                }}
              >
                <div className="ds-template-art" aria-hidden="true">
                  <i />
                  <b>
                    {kind === "blank"
                      ? "+"
                      : kind === "event"
                        ? "灵感\n碰面"
                        : kind === "mewvis"
                          ? "Mewvis"
                          : "把想法，\n变成画面。"}
                  </b>
                </div>
                <strong>{label}</strong>
                <span>{description}</span>
              </button>
            ))}
          </div>
          <p className="ds-help">
            切换模板会替换当前画布，可通过「撤销」恢复。
          </p>
        </Modal>
      )}
      {result && (
        <Modal
          title={result.path ? "文件已保存" : "文件已生成"}
          close={() => setResult(null)}
        >
          <p>{result.label}</p>
          {result.path ? (
            <p className="ds-path">{result.path}</p>
          ) : (
            <p className="ds-export-warning">
              当前环境暂不能保存文件：{result.error}
            </p>
          )}
          {result.url && (
            <img
              className="ds-result-image"
              src={result.url}
              alt="导出的高清设计图"
            />
          )}
          {result.text && (
            <>
              <p className="ds-help">可以复制文件内容，保存到本地。</p>
              <textarea
                className="ds-result-text"
                aria-label="导出文件内容"
                readOnly
                value={result.text}
                onFocus={(e) => e.target.select()}
              />
            </>
          )}
          <button className="ds-primary" onClick={() => setResult(null)}>
            完成
          </button>
        </Modal>
      )}
    </main>
  );
}
