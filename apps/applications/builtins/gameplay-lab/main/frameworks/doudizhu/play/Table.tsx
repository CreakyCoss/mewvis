import {
  patternNames,
  rankLabel,
  type DoudizhuModel,
  type PokerCard,
} from "../model";
import { doudizhuCommands } from "../rules/commands";
import type { ReactNode } from "react";
import { beatsPoker, recognizePoker } from "../rules/patterns";
import { type DoudizhuCommand, type DoudizhuView } from "../runtime/game";
function CardFace({ card }: { card: PokerCard }) {
  return (
    <>
      <strong>{rankLabel(card.rank)}</strong>
      <span>{card.suit || "★"}</span>
    </>
  );
}
export interface DoudizhuTableProps {
  model: DoudizhuModel;
  view: DoudizhuView;
  selected: string[];
  setSelected(ids: string[]): void;
  execute(command: DoudizhuCommand): void;
  busy: boolean;
  readOnly: boolean;
  hint(): void;
  newGame(): void;
  newGameDisabled: boolean;
  slots?: { beforeHand?: ReactNode; opponent?(seat: number): ReactNode };
}
export function DoudizhuTable({
  model,
  view,
  selected,
  setSelected,
  execute,
  busy,
  readOnly,
  hint,
  newGame,
  newGameDisabled,
  slots = {},
}: DoudizhuTableProps) {
  const cards = view.hand.filter((c) => selected.includes(c.id)),
    pattern = recognizePoker(model, cards);
  const ownTurn = view.actor === 0 && !readOnly && !busy,
    valid = pattern && beatsPoker(pattern, view.last?.pattern ?? null);
  return (
    <section className="doudizhu-table" aria-label="斗地主牌桌">
      <div className="doudizhu-hud">
        <div>
          <small>三人斗地主 · 你的视角</small>
          <h1>{model.name}</h1>
          <p>
            {view.phase === "bidding"
              ? "叫分阶段"
              : view.phase === "finished"
                ? "本局结束"
                : "出牌阶段"}{" "}
            ·{" "}
            {view.phase === "finished"
              ? "结算完成"
              : "玩家 " + (view.actor + 1) + " 行动"}
          </p>
        </div>
        <div>
          <strong>
            {view.bid || "—"} 分 × {view.multiplier}
          </strong>
          <p>基础分 {model.rules.baseScore}</p>
          <div className="poker-kitty" aria-label="底牌">
            {view.kitty.length ? (
              view.kitty.map((c) => (
                <span key={c.id}>
                  {rankLabel(c.rank)}
                  {c.suit}
                </span>
              ))
            ) : (
              <span>三张底牌 · 尚未公开</span>
            )}
          </div>
        </div>
      </div>
      <div className="poker-opponents">
        {[1, 2].map((i) => (
          <section
            key={i}
            className={view.actor === i ? "poker-seat active" : "poker-seat"}
          >
            <strong>
              玩家 {i + 1} ·{" "}
              {view.landlord === null
                ? "待定身份"
                : view.landlord === i
                  ? "地主"
                  : "农民"}
            </strong>
            {slots.opponent?.(i)}
            <div
              className="poker-card-backs"
              aria-label={"玩家 " + (i + 1) + " 剩余 " + view.counts[i] + " 张"}
            >
              ✦ <b>{view.counts[i]}</b>
            </div>
            <small>{view.actions[i].text}</small>
            <div className="poker-public-cards">
              {view.actions[i].cards.map((c) => (
                <span key={c.id}>
                  {rankLabel(c.rank)}
                  {c.suit}
                </span>
              ))}
            </div>
          </section>
        ))}
      </div>
      <div className="poker-trick" aria-live="polite">
        {view.outcome ? (
          <>
            <h2>
              {view.outcome.team === "landlord" ? "地主获胜" : "农民获胜"}
            </h2>
            <p>
              {view.outcome.scores
                .map(
                  (score, i) =>
                    "玩家 " + (i + 1) + "：" + (score > 0 ? "+" : "") + score,
                )
                .join(" · ")}
            </p>
            <button
              className="poker-play-button"
              disabled={busy || readOnly || newGameDisabled}
              onClick={newGame}
            >
              新开一局
            </button>
          </>
        ) : view.last ? (
          <>
            <p>
              玩家 {view.last.player + 1} ·{" "}
              {patternNames[view.last.pattern.kind]}
            </p>
            <div className="poker-public-cards poker-last">
              {view.last.cards.map((c) => (
                <span key={c.id}>
                  {rankLabel(c.rank)}
                  {c.suit}
                </span>
              ))}
            </div>
          </>
        ) : (
          <>
            <h2>
              {view.phase === "bidding" ? "决定谁成为地主" : "领出新一轮"}
            </h2>
            <p>{view.message}</p>
          </>
        )}
      </div>
      {slots.beforeHand}
      <div className="poker-hand-title">
        <strong>
          玩家 1 ·{" "}
          {view.landlord === null
            ? "等待叫分"
            : view.landlord === 0
              ? "地主"
              : "农民"}
        </strong>
        <span>
          {view.hand.length} 张手牌 · 已选 {cards.length}
        </span>
      </div>
      <div className="poker-hand" aria-label="你的手牌">
        {view.hand.map((c) => (
          <button
            key={c.id}
            type="button"
            aria-label={"手牌 " + rankLabel(c.rank) + c.suit}
            aria-pressed={selected.includes(c.id)}
            disabled={!ownTurn || view.phase !== "playing"}
            className={
              "poker-card " +
              (c.rank > 15 ? "joker " : "") +
              (selected.includes(c.id) ? "selected " : "") +
              (["♥", "♦"].includes(c.suit) || c.rank === 17 ? "red" : "")
            }
            onClick={() =>
              setSelected(
                selected.includes(c.id)
                  ? selected.filter((id) => id !== c.id)
                  : [...selected, c.id],
              )
            }
          >
            <CardFace card={c} />
          </button>
        ))}
      </div>
      <div className="poker-controls">
        {readOnly ? (
          <p>历史回放 · 无法执行操作</p>
        ) : view.phase === "bidding" ? (
          <>
            {doudizhuCommands(model, { ...view, player: 0 }).map(
              (c) =>
                c.type === "bid" && (
                  <button
                    className="poker-play-button"
                    key={c.value}
                    disabled={!ownTurn}
                    onClick={() => execute(c)}
                  >
                    {c.value ? "叫 " + c.value + " 分" : "不叫"}
                  </button>
                ),
            )}
            {view.actor !== 0 && <p>对手正在叫分…</p>}
          </>
        ) : view.phase === "playing" ? (
          <>
            <p>
              {view.actor !== 0
                ? "对手正在思考…"
                : cards.length
                  ? pattern
                    ? valid
                      ? patternNames[pattern.kind]
                      : "所选牌不能压过当前出牌"
                    : "所选组合不符合已启用牌型"
                  : view.last
                    ? "请选择能压过上家的牌，或过牌"
                    : "请选择手牌领出"}
            </p>
            <div>
              <button className="button" disabled={!ownTurn} onClick={hint}>
                提示
              </button>
              <button
                className="button"
                disabled={!ownTurn || !view.last}
                onClick={() => execute({ type: "pass", player: 0 })}
              >
                过牌
              </button>
              <button
                className="poker-play-button"
                disabled={!ownTurn || !valid}
                onClick={() =>
                  execute({ type: "play", player: 0, cards: selected })
                }
              >
                出牌
              </button>
            </div>
          </>
        ) : null}
      </div>
    </section>
  );
}
