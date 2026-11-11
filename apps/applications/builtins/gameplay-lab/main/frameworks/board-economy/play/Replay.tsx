import { useMemo } from "react";
import { boardTimeline, type BoardRecord } from "../records";
export function BoardReplayControls({
  record,
  cursor,
  setCursor,
  sample = false,
}: {
  record: BoardRecord;
  cursor: number;
  setCursor(n: number): void;
  sample?: boolean;
}) {
  return (
    <div className="economy-replay">
      <label>
        回放步骤
        <input
          type="range"
          aria-label="棋盘回放步骤"
          min={0}
          max={record.decisions.length}
          value={cursor < 0 ? record.decisions.length : cursor}
          onChange={(e) => setCursor(Number(e.target.value))}
        />
      </label>
      <span>
        {cursor < 0 ? record.decisions.length : cursor} /{" "}
        {record.decisions.length}
      </span>
      {cursor >= 0 && (
        <button className="button" onClick={() => setCursor(-1)}>
          {sample ? "查看样本末步" : "回到当前对局"}
        </button>
      )}
    </div>
  );
}
export function BoardInspection({
  record,
  cursor,
  setCursor,
  sample = false,
}: {
  record: BoardRecord;
  cursor: number;
  setCursor(n: number): void;
  sample?: boolean;
}) {
  const timeline = useMemo(() => boardTimeline(record), [record]);
  return (
    <section className="page-content">
      <h1>棋盘事件与回放</h1>
      <p>
        种子 {record.seed} · {record.decisions.length}{" "}
        步操作，使用开局时的棋盘和规则。
      </p>
      <BoardReplayControls {...{ record, cursor, setCursor, sample }} />
      <ol className="economy-event-list">
        {timeline
          .map((state, i) => (
            <li key={i}>
              <button
                className="button"
                aria-current={cursor === i ? "step" : undefined}
                onClick={() => setCursor(i)}
              >
                <strong>
                  第 {i} 步 ·{" "}
                  {i === 0
                    ? "开局"
                    : record.drivers[i - 1] === "basic"
                      ? "自动玩家"
                      : "手动操作"}
                </strong>
                {state.events.map((e, n) => (
                  <span key={n}>{e.text}</span>
                ))}
              </button>
            </li>
          ))
          .reverse()}
      </ol>
    </section>
  );
}
