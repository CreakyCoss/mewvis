import { IncompatibleDataNotice } from "../../../app/projects/components/IncompatibleDataNotice";
import type { IncompatibleData } from "../../../app/projects/incompatible";
import type { DoudizhuRecord } from "../records";
export function DoudizhuHistoryView({
  records,
  ready,
  errors,
  incompatible,
  reload,
  open,
  remove,
  removed,
}: {
  records: DoudizhuRecord[];
  ready: boolean;
  errors: string[];
  incompatible: IncompatibleData[];
  reload(): void;
  open(record: DoudizhuRecord): void;
  remove(id: string): Promise<void>;
  removed(): void;
}) {
  return (
    <section className="page-content">
      <div className="page-heading">
        <div>
          <h1>试玩记录</h1>
          <p>每次操作保存后更新牌桌，关闭窗口后可继续或回放。</p>
        </div>
        <button className="button" onClick={reload}>
          重新加载记录
        </button>
      </div>
      {errors.map((e, i) => (
        <p className="form-error" key={i}>
          {e}
        </p>
      ))}
      <IncompatibleDataNotice
        items={incompatible}
        disabled={!ready}
        remove={remove}
        done={removed}
      />
      <div className="poker-history">
        {records.map((r) => (
          <button className="button" key={r.id} onClick={() => open(r)}>
            <strong>
              {r.model.name} · {r.decisions.length} 步
            </strong>
            <span>
              种子 {r.seed} ·{" "}
              {r.final.phase === "finished" ? "已结束" : "可继续"} ·{" "}
              {new Date(r.createdAt).toLocaleString()}
            </span>
          </button>
        ))}
      </div>
      {ready && !records.length && (
        <p className="hint">尚无对局，开始试玩后自动保存到 runs/。</p>
      )}
    </section>
  );
}
