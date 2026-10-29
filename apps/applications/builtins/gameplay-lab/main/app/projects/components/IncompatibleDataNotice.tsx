import { useState } from "react";
import { Modal } from "../../../shared/components/Modal";
import type { IncompatibleData } from "../incompatible";

export function IncompatibleDataNotice({
  items,
  remove,
  done,
  disabled = false,
}: {
  items: IncompatibleData[];
  remove(id: string): Promise<void>;
  done(): void;
  disabled?: boolean;
}) {
  const [selected, setSelected] = useState<IncompatibleData | null>(null);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function confirm() {
    if (!selected || busy) return;
    setBusy(true);
    setError("");
    try {
      await remove(selected.id);
      setSelected(null);
      done();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  }
  if (!items.length) return null;
  return (
    <section className="incompatible-data" role="alert">
      <strong>发现不兼容的数据</strong>
      <p>以下数据已保留，当前应用无法读取。删除前需要你确认。</p>
      <ul>
        {items.map((item) => (
          <li key={item.id}>
            <div>
              <strong>{item.name}</strong>
              <p className="incompatible-path">{item.path}</p>
            </div>
            <button
              className="button"
              disabled={disabled}
              onClick={() => {
                setSelected(item);
                setError("");
              }}
            >
              查看并删除
            </button>
          </li>
        ))}
      </ul>
      {selected && (
        <Modal
          title="删除不兼容数据"
          busy={busy}
          close={() => setSelected(null)}
        >
          <div className="incompatible-confirm">
            <p>{selected.name}</p>
            <p className="incompatible-path">{selected.path}</p>
            <p>{selected.reason}</p>
            <p>{selected.consequence}此操作无法撤销。</p>
            {error && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}
            <footer>
              <button
                className="button"
                autoFocus
                disabled={busy}
                onClick={() => setSelected(null)}
              >
                取消，保留数据
              </button>
              <button
                className="button danger-text"
                disabled={busy || disabled}
                onClick={() => void confirm()}
              >
                {busy ? "删除中…" : "确认删除"}
              </button>
            </footer>
          </div>
        </Modal>
      )}
    </section>
  );
}
