import { Maximize2, Minimize2, X } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";

export function PlayWindow({
  title,
  busy,
  error,
  readOnly = false,
  readOnlyText = "实验样本 · 只读回放",
  onInspectChange,
  scene,
  inspection,
  close,
}: {
  title: string;
  busy: boolean;
  error: string;
  readOnly?: boolean;
  readOnlyText?: string;
  onInspectChange?(inspect: boolean): void;
  scene?: ReactNode;
  inspection: ReactNode;
  close(): void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [large, setLarge] = useState(true),
    [inspect, setInspect] = useState(!scene);
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  useEffect(() => {
    onInspectChange?.(inspect);
  }, [inspect, onInspectChange]);
  return (
    <dialog
      ref={ref}
      className={`play-window ${large ? "play-window-large" : ""}`}
      aria-label={`${title} · 游戏试玩`}
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) close();
      }}
    >
      <header className="play-window-header">
        <div>
          <strong>{title}</strong>
          <small>{readOnly ? readOnlyText : "独立试玩 · 操作自动保存"}</small>
        </div>
        <div className="play-window-tools">
          {scene && (
            <button
              className="button"
              disabled={busy}
              aria-pressed={inspect}
              onClick={() => setInspect((value) => !value)}
            >
              {inspect ? "返回牌桌" : "检查与回放"}
            </button>
          )}
          <button
            className="icon-button play-window-resize"
            aria-label={large ? "缩小试玩窗口" : "展开试玩窗口"}
            onClick={() => setLarge((value) => !value)}
          >
            {large ? <Minimize2 size={17} /> : <Maximize2 size={17} />}
          </button>
          <button
            className="icon-button"
            aria-label="关闭试玩，返回设计"
            disabled={busy}
            onClick={close}
          >
            <X size={18} />
          </button>
        </div>
      </header>
      {error && (
        <p className="form-error play-window-error" role="alert">
          {error}
        </p>
      )}
      <div className="play-window-body">{inspect ? inspection : scene}</div>
    </dialog>
  );
}
