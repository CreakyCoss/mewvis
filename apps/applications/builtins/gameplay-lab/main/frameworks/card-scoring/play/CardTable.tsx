import type { ReactNode } from "react";
import {
  NativeSelect,
  NativeSelectOption,
} from "design-system/components/ui/native-select";
import { useState } from "react";
import { actionReason, actor } from "../../../domains/turn/engine";
import type { Trial } from "../../../validation/records/records";
import { scoringRules } from "../structure";
import { scoringPreview } from "./preview";

function groupStyle(group: string) {
  const colors = ["#c65d46", "#4c6faf", "#2b8468", "#8d62b3", "#a07628"];
  const index =
    Array.from(group).reduce((sum, char) => sum + char.charCodeAt(0), 0) %
    colors.length;
  return { color: colors[index] };
}
export function CardTable({
  trial,
  cursor,
  cards,
  busy,
  readOnly,
  setCursor,
  setCards,
  execute,
  newGame,
  newGameDisabled,
  slots = {},
}: {
  trial: Trial;
  cursor: number;
  cards: string[];
  busy: boolean;
  readOnly: boolean;
  setCursor(value: number): void;
  setCards(ids: string[]): void;
  execute(action: string, automatic?: boolean): void;
  newGame(): void;
  newGameDisabled: boolean;
  slots?: {
    scoreDetail?(actionId: string): ReactNode;
    beforeHand?: ReactNode;
    opponent?(seat: number): ReactNode;
  };
}) {
  const [selectedAction, setSelectedAction] = useState("");
  const run = trial.run,
    model = run.model;
  if (model.format !== "gameplay-card-v1") return null;
  const index =
      cursor >= 0
        ? Math.min(cursor, run.entries.length - 1)
        : run.entries.length - 1,
    entry = run.entries[index],
    state = entry.state;
  const rules = scoringRules(model),
    rule = rules.find((rule) => rule.action.id === selectedAction) ?? rules[0];
  const preview = rule
    ? scoringPreview(model, state, rule.action.id, cards)
    : null;
  const player = actor(state),
    replaying = readOnly || cursor >= 0,
    canPlay = !busy && !replaying && !state.outcome;
  const otherActions = model.actions.filter(
    (action) => !action.effects.some((effect) => effect.type === "combination"),
  );
  return (
    <section className="card-table" aria-label="组合计分牌桌">
      <div className="card-table-hud">
        <div>
          <small>组合计分</small>
          <h1>{model.name}</h1>
          <p>
            第 {state.round} / {model.flow.maxRounds} 轮 · {player.name} · 剩余{" "}
            {state.remaining} 次行动
          </p>
        </div>
        <div className="card-table-scores">
          {model.goals.map((goal) => (
            <div key={goal.id}>
              <span>{goal.name}</span>
              <strong>
                {player.values[goal.field]} <small>/ {goal.threshold}</small>
              </strong>
              <progress
                aria-label={goal.name}
                value={Math.max(0, player.values[goal.field])}
                max={goal.threshold}
              />
            </div>
          ))}
        </div>
      </div>
      {state.players.length > 1 && (
        <div className="card-table-players">
          {state.players.map((p, i) => (
            <span className={state.actor === i ? "active" : ""} key={p.id}>
              {p.name} ·{" "}
              {model.goals
                .map(
                  (goal) =>
                    `${model.fields.find((field) => field.id === goal.field)?.name ?? goal.name} ${p.values[goal.field]}`,
                )
                .join(" / ")}
              {slots.opponent?.(i)}
            </span>
          ))}
        </div>
      )}
      {replaying && (
        <div className="card-table-replay">
          <strong>
            {readOnly ? "实验样本回放" : "历史回放"} · 第 {index} 步
          </strong>
          <input
            type="range"
            aria-label="牌桌回放步骤"
            min={0}
            max={run.entries.length - 1}
            value={index}
            onChange={(event) => setCursor(Number(event.target.value))}
          />
          {!readOnly && (
            <button className="button" onClick={() => setCursor(-1)}>
              回到当前对局
            </button>
          )}
        </div>
      )}
      <div className="card-table-center">
        <div
          className="card-table-stack"
          aria-label={`抽牌区 ${preview?.pile?.draw.length ?? 0} 张`}
        >
          <span>✦</span>
          <strong>{preview?.pile?.draw.length ?? 0}</strong>
          <small>抽牌区</small>
        </div>
        <div className="card-table-message" aria-live="polite">
          {state.outcome ? (
            <>
              <span className="table-emblem">
                {state.outcome.kind === "won" ? "✧" : "◇"}
              </span>
              <h2>
                {state.outcome.kind === "won" ? "本局目标达成" : "本局结束"}
              </h2>
              <p>
                {state.outcome.winners.length
                  ? state.outcome.winners
                      .map(
                        (winner) =>
                          `${state.players.find((p) => p.id === winner.player)?.name} · ${model.goals.find((goal) => goal.id === winner.goal)?.name}`,
                      )
                      .join("、")
                  : state.outcome.reason}
              </p>
              <button
                className="button"
                disabled={busy || newGameDisabled || readOnly}
                onClick={newGame}
              >
                新开一局
              </button>
            </>
          ) : (
            <>
              <small>{index === 0 ? "准备出牌" : entry.actor}</small>
              <h2>{index === 0 ? "选择你的组合" : entry.title}</h2>
              <p>
                {index === 0
                  ? "点击手牌选择组合，确认得分后提交。"
                  : entry.notes[0]}
              </p>
            </>
          )}
        </div>
        <div
          className="card-table-stack card-table-discard"
          aria-label={`弃牌区 ${preview?.pile?.discard.length ?? 0} 张`}
        >
          <span>◇</span>
          <strong>{preview?.pile?.discard.length ?? 0}</strong>
          <small>弃牌区</small>
        </div>
      </div>
      {slots.beforeHand}
      {preview && (
        <>
          <div className="card-table-hand-heading">
            <div>
              <strong>{preview.rule.deck?.name}</strong>
              <small>
                选 {preview.rule.deck?.minSelect}–{preview.rule.deck?.maxSelect}{" "}
                张 · 已选 {preview.chosen.length}
              </small>
            </div>
            {rules.length > 1 && (
              <NativeSelect
                size="sm"
                aria-label="出牌方式"
                value={rule.action.id}
                disabled={!canPlay}
                onChange={(event) => {
                  setSelectedAction(event.target.value);
                  setCards([]);
                }}
              >
                {rules.map((rule) => (
                  <NativeSelectOption
                    key={rule.action.id}
                    value={rule.action.id}
                  >
                    {rule.action.name}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            )}
          </div>
          <div className="card-table-hand" aria-label="手牌">
            {preview.pile?.hand.map((card) => {
              const selected = cards.includes(card.id),
                limit =
                  preview.chosen.length >= (preview.rule.deck?.maxSelect ?? 0);
              return (
                <button
                  type="button"
                  className={`playing-card ${selected ? "selected" : ""}`}
                  aria-pressed={selected}
                  aria-label={`${card.name} · ${card.value} 分 · ${card.group} · 副本 ${card.id.split(":").at(-1)}`}
                  key={card.id}
                  disabled={!canPlay || (!selected && limit)}
                  onClick={() =>
                    setCards(
                      selected
                        ? cards.filter((id) => id !== card.id)
                        : [...cards, card.id],
                    )
                  }
                  style={groupStyle(card.group)}
                >
                  <span className="playing-card-corner">{card.value}</span>
                  <span className="playing-card-group">{card.group}</span>
                  <strong>{card.name}</strong>
                  <small>副本 {card.id.split(":").at(-1)}</small>
                  <span className="playing-card-check">
                    {selected ? "已选" : "选择"}
                  </span>
                </button>
              );
            })}
            {!preview.pile?.hand.length && (
              <p className="card-table-empty">
                手牌已用完，可以执行其他行动或结束本轮行动。
              </p>
            )}
          </div>
          <div className="card-table-submit">
            <div>
              <small>当前组合预估</small>
              <strong>
                {preview.result.score} <span>分</span>
              </strong>
              <p>
                {slots.scoreDetail?.(rule.action.id) ?? (
                  <>
                    基础 {preview.result.base} × {preview.multiplier}
                  </>
                )}
              </p>
            </div>
            <div>
              <p>
                {canPlay
                  ? preview.reason
                  : replaying
                    ? "回放期间不能出牌。"
                    : busy
                      ? "正在保存…"
                      : "本局已结束。"}
              </p>
              <button
                className="card-play-button"
                disabled={!canPlay || !!preview.reason}
                onClick={() => execute(rule.action.id)}
              >
                {busy ? "正在保存…" : rule.action.name}
              </button>
            </div>
          </div>
        </>
      )}
      <div className="card-table-actions">
        {otherActions.map((action) => {
          const reason = actionReason(model, state, action);
          return (
            <button
              className="button"
              key={action.id}
              disabled={!canPlay || !!reason}
              title={reason || action.description}
              onClick={() => execute(action.id)}
            >
              {action.name}
              {action.costs.length > 0 && (
                <small>
                  {" "}
                  ·{" "}
                  {action.costs
                    .map(
                      (cost) =>
                        `${cost.value} ${model.fields.find((field) => field.id === cost.field)?.name ?? ""}`,
                    )
                    .join("、")}
                </small>
              )}
            </button>
          );
        })}
        <button
          className="button"
          disabled={!canPlay}
          onClick={() => execute("__end_turn")}
        >
          结束行动
        </button>
        <button
          className="text-button"
          disabled={!canPlay}
          onClick={() => execute("", true)}
        >
          自动玩家走一步
        </button>
      </div>
      {!!player.capabilities.length && (
        <p className="card-table-capabilities">
          已获得：
          {player.capabilities
            .map(
              (id) =>
                model.capabilities.find((capability) => capability.id === id)
                  ?.name,
            )
            .join("、")}
        </p>
      )}
      {model.fields.some(
        (field) => !model.goals.some((goal) => goal.field === field.id),
      ) && (
        <div className="card-table-resources">
          {model.fields
            .filter(
              (field) => !model.goals.some((goal) => goal.field === field.id),
            )
            .map((field) => (
              <span key={field.id}>
                {field.name}
                <strong>{player.values[field.id]}</strong>
              </span>
            ))}
        </div>
      )}
    </section>
  );
}
