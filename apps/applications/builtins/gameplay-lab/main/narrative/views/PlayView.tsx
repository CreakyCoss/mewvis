import { Flag } from "lucide-react";
import { useMemo } from "react";
import { operations } from "../components/labels";
import { conditionPass } from "../engine";
import { storyState, type StoryRecord } from "../records";

export function PlayView({
  record,
  cursor,
  busy,
  setCursor,
  back,
  decide,
}: {
  record: StoryRecord;
  cursor: number;
  busy: boolean;
  back(): void;
  setCursor(cursor: number): void;
  decide(id: string): void;
}) {
  const state = useMemo(
    () =>
      record
        ? storyState(record, cursor < 0 ? record.decisions.length : cursor)
        : null,
    [record, cursor],
  );
  const currentNode = record?.model.nodes.find((n) => n.id === state?.node),
    replaying = !!record && cursor >= 0 && cursor < record.decisions.length;

  if (!state || !currentNode) return null;
  return (
    <section className="page-content story-play">
      <div className="page-heading">
        <div>
          <p>
            条件分支叙事 · v{record.simulator.version} · 独立剧情快照
            {replaying ? " · 回放中" : ""}
          </p>
          <h1>{currentNode.title}</h1>
        </div>
        <button className="button" onClick={back}>
          返回剧情设计
        </button>
      </div>
      <section className="settings-section story-reader">
        <p className="story-speaker">
          {record.model.characters.find((c) => c.id === currentNode.speaker)
            ?.name ?? "旁白"}
        </p>
        <div className="story-prose">{currentNode.text}</div>
        {state.outcome === "ending" ? (
          <p className="readiness-success" role="status">
            <Flag size={18} />
            已到达结局 · {currentNode.title}
          </p>
        ) : state.outcome === "blocked" ? (
          <p className="form-error" role="status">
            当前没有满足条件的选项。请检查条件是否造成死路。
          </p>
        ) : state.outcome === "budget" ? (
          <p className="hint" role="status">
            已达到 200 次选择的运行上限，记录保留，未判定为结局。
          </p>
        ) : null}
        {currentNode.choices.map((c) => {
          const failures = c.conditions.filter(
            (x) => !conditionPass(x, state.values),
          );
          return (
            <button
              className="story-play-choice"
              key={c.id}
              disabled={
                busy ||
                replaying ||
                state.outcome !== "playing" ||
                !!failures.length
              }
              onClick={() => decide(c.id)}
            >
              <strong>{c.label}</strong>
              {!!failures.length && (
                <small>
                  条件不满足：
                  {failures
                    .map(
                      (x) =>
                        `${record.model.variables.find((v) => v.id === x.variable)?.name} ${operations[x.op]} ${String(x.value)}`,
                    )
                    .join("；")}
                </small>
              )}
            </button>
          );
        })}
      </section>
      <section className="settings-section">
        <h2>当前状态与回放</h2>
        {!record.model.variables.length ? (
          <p className="hint">本方案没有状态变量。</p>
        ) : (
          <dl className="story-state-values">
            {record.model.variables.map((v) => (
              <div key={v.id}>
                <dt>{v.name}</dt>
                <dd>{String(state.values[v.id])}</dd>
              </div>
            ))}
          </dl>
        )}
        <label className="form-field">
          回放步骤 · {state.steps} / {record.decisions.length}
          <input
            aria-label="回放步骤"
            type="range"
            min={0}
            max={record.decisions.length}
            value={cursor < 0 ? record.decisions.length : cursor}
            onChange={(e) => setCursor(Number(e.target.value))}
          />
        </label>
        {replaying && (
          <button className="button" onClick={() => setCursor(-1)}>
            返回最新状态
          </button>
        )}
        <ol className="story-events">
          {state.events.map((e, i) => (
            <li key={i}>
              <strong>
                {
                  record.model.nodes
                    .flatMap((n) => n.choices)
                    .find((c) => c.id === e.choice)?.label
                }
              </strong>
              <p>
                {record.model.nodes.find((n) => n.id === e.from)?.title} →{" "}
                {record.model.nodes.find((n) => n.id === e.to)?.title}
              </p>
              {e.changes.map((change, j) => (
                <p key={j}>{change}</p>
              ))}
            </li>
          ))}
        </ol>
      </section>
    </section>
  );
}
