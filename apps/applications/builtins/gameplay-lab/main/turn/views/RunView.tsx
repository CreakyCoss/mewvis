import {
  ArrowLeft,
  CheckCircle2,
  Flag,
  GitBranch,
  Play,
  Square,
} from "lucide-react";
import type { Dispatch, SetStateAction } from "react";
import { collectionsOf } from "../../card/collections";
import { CardZones } from "../../card/components/CardZones";
import { selectionForAction } from "../../card/selection";
import { actionReason, actor } from "../engine";
import { type Model } from "../model";
import { trialStrategy, type Trial } from "../records/records";
import { simulatorName } from "../simulators";

export function RunView({
  trial,
  model,
  cursor,
  cards,
  previewLabel,
  setCursor,
  setCards,
  execute,
  back,
  history,
}: {
  trial: Trial;
  model: Model;
  cursor: number;
  cards: string[];
  previewLabel: string | null;
  setCursor(cursor: number): void;
  setCards: Dispatch<SetStateAction<string[]>>;
  execute(action: string, automatic?: boolean): void;
  back(): void;
  history(): void;
}) {
  const run = trial.run;
  const entry =
    run.entries[
      cursor >= 0
        ? Math.min(cursor, run.entries.length - 1)
        : run.entries.length - 1
    ];
  const previewTrial = previewLabel !== null;

  return (
    <section className="page-content run-page">
      <div className="page-heading">
        <div>
          {run.simulator && (
            <div className="simulator-badge">
              {simulatorName(run.simulator)} · v{run.simulator.version}
            </div>
          )}
          <div className="eyebrow">
            {previewTrial && <div>{previewLabel}</div>}
            基于独立规则快照 · {run.model.name}
            {trial?.setup && <> · 场景 {trial.setup.scenario.name}</>}
          </div>
          <h1>
            试运行 <span className="round-pill">第 {entry.state.round} 轮</span>
          </h1>
          <p>
            {actor(entry.state).name} · 剩余 {entry.state.remaining} 次行动 ·
            种子 {run.seed}
          </p>
        </div>
        <button className="button" onClick={() => back()}>
          <ArrowLeft size={17} />
          返回模型
        </button>
      </div>
      {JSON.stringify(run.model) !== JSON.stringify(model) && (
        <div className="notice-banner">
          <GitBranch size={17} />
          草稿已改变，本局仍使用开始时的规则。点击顶部“试运行”可建立新快照。
        </div>
      )}
      <div className="run-grid">
        <section>
          <h2>当前状态</h2>
          <table className="data-table">
            <thead>
              <tr>
                <th>状态</th>
                {entry.state.players.map((p) => (
                  <th key={p.id}>{p.name}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {run.model.fields.map((f) => (
                <tr key={f.id}>
                  <td>{f.name}</td>
                  {entry.state.players.map((p) => (
                    <td key={p.id}>{p.values[f.id]}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          <h2 className="section-gap">目标进度</h2>
          {run.model.goals.map((g) => (
            <div className="goal-row" key={g.id}>
              <div>
                <Flag size={17} />
                <strong>{g.name}</strong>
              </div>
              {entry.state.players.map((p) => (
                <p key={p.id}>
                  {p.name}：{p.values[g.field]} / {g.threshold}
                </p>
              ))}
            </div>
          ))}
          {entry.state.outcome && (
            <div className="outcome" role="status">
              <CheckCircle2 size={26} />
              <div>
                <h2>
                  {entry.state.outcome.kind === "won"
                    ? "目标已达成"
                    : "运行已截断"}
                </h2>
                <p>
                  {entry.state.outcome.winners
                    .map(
                      (w) =>
                        `${entry.state.players.find((p) => p.id === w.player)?.name} · ${run.model.goals.find((g) => g.id === w.goal)?.name}`,
                    )
                    .join("；") || entry.state.outcome.reason}
                </p>
              </div>
            </div>
          )}
          {run.model.format === "gameplay-card-v1" && (
            <CardZones model={run.model} state={entry.state} />
          )}
        </section>
        <section>
          <h2>{cursor >= 0 || previewTrial ? "历史快照" : "选择下一步"}</h2>
          {cursor >= 0 || previewTrial ? (
            <div className="notice-banner">
              正在查看第 {cursor >= 0 ? cursor : run.entries.length - 1} 步。
              {previewTrial && "实验样本只读。"}
              <button
                className="text-button"
                onClick={() => (previewTrial ? history() : setCursor(-1))}
              >
                {previewTrial ? "返回实验记录" : "回到最新"}
              </button>
            </div>
          ) : (
            <>
              {collectionsOf(run.model).map((c) => {
                const pile = actor(entry.state).collections[c.id];
                return (
                  <div className="collection" key={c.id}>
                    <h3>
                      {c.name}
                      <small>
                        选 {c.minSelect}–{c.maxSelect} 张 · 已选{" "}
                        {
                          pile.hand.filter((card) => cards.includes(card.id))
                            .length
                        }{" "}
                        · 抽牌区 {pile.draw.length} · 弃牌区{" "}
                        {pile.discard.length}
                      </small>
                    </h3>
                    <div className="card-options">
                      {pile.hand.map((card) => (
                        <label
                          key={card.id}
                          className={cards.includes(card.id) ? "selected" : ""}
                        >
                          <input
                            type="checkbox"
                            checked={cards.includes(card.id)}
                            onChange={(e) =>
                              setCards((ids) =>
                                e.target.checked
                                  ? [...ids, card.id]
                                  : ids.filter((id) => id !== card.id),
                              )
                            }
                          />
                          <strong>{card.name}</strong>
                          {"definitionId" in card && (
                            <small>副本 {card.id.split(":").at(-1)}</small>
                          )}
                          <span>
                            {card.group} · 基础值 {card.value}
                          </span>
                        </label>
                      ))}
                    </div>
                  </div>
                );
              })}
              {run.model.actions.map((a) => {
                let reason = actionReason(run.model, entry.state, a);
                const effect = a.effects.find(
                  (effect) => effect.type === "combination",
                );
                if (
                  !reason &&
                  run.model.format === "gameplay-card-v1" &&
                  effect?.type === "combination"
                ) {
                  const deck = run.model.decks.find(
                    (deck) => deck.id === effect.collection,
                  )!;
                  const count = selectionForAction(
                    entry.state,
                    a,
                    cards,
                  ).length;
                  if (count < deck.minSelect || count > deck.maxSelect)
                    reason = `请从${deck.name}选择 ${deck.minSelect}–${deck.maxSelect} 张牌，当前 ${count} 张`;
                }
                return (
                  <button
                    className="action-offer"
                    key={a.id}
                    disabled={!!reason}
                    onClick={() => execute(a.id)}
                  >
                    <span>
                      <strong>{a.name}</strong>
                      <small>{reason || a.description}</small>
                    </span>
                    <Play size={17} />
                  </button>
                );
              })}
              <div className="run-actions">
                <button
                  className="button primary"
                  disabled={!!entry.state.outcome}
                  onClick={() => execute("", true)}
                >
                  <Play size={16} />
                  策略单步
                </button>
                <button
                  className="button"
                  disabled={!!entry.state.outcome}
                  onClick={() => execute("__end_turn")}
                >
                  <Square size={15} />
                  结束行动
                </button>
              </div>
              <p className="hint">
                策略：
                {trial
                  ? (trialStrategy(trial)?.name ?? "目标优先")
                  : "目标优先"}
                。使用本局创建时的策略快照执行。
              </p>
            </>
          )}
        </section>
      </div>
      <section className="event-section">
        <div className="section-title">
          <h2>事件与回放</h2>
          <span className="muted">{run.entries.length - 1} 步决策</span>
        </div>
        <label className="timeline-label">
          查看快照
          <input
            aria-label="回放步骤"
            type="range"
            min="0"
            max={run.entries.length - 1}
            value={cursor >= 0 ? cursor : run.entries.length - 1}
            onChange={(e) => setCursor(Number(e.target.value))}
          />
        </label>
        <ol className="event-list">
          {run.entries
            .map((e, i) => (
              <li key={i}>
                <button
                  onClick={() => setCursor(i)}
                  className={cursor === i ? "selected" : ""}
                >
                  <span className="step-number">
                    {String(i).padStart(2, "0")}
                  </span>
                  <div>
                    <strong>{e.title}</strong>
                    <small>
                      {e.actor} · {e.notes.join("；")}
                    </small>
                  </div>
                </button>
              </li>
            ))
            .reverse()}
        </ol>
      </section>
    </section>
  );
}
