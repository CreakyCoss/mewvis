import {
  ArrowRight,
  Bot,
  Check,
  Dice1,
  Dice2,
  Dice3,
  Dice4,
  Dice5,
  Dice6,
  Dices,
  Flag,
  MousePointer2,
  RotateCw,
  Trees,
  UserRound,
  Warehouse,
} from "lucide-react";
import { useState, type CSSProperties } from "react";
import { boardTileNames, type BoardModel } from "../model";
import {
  boardCommands,
  observeBoard,
  type BoardCommand,
  type BoardState,
} from "../runtime";

const diceIcons = [Dices, Dice1, Dice2, Dice3, Dice4, Dice5, Dice6];
const tileIcons = { start: Flag, property: Warehouse, rest: Trees };
const number = (n: number) => n.toLocaleString("zh-CN");

export function boardPositions(count: number) {
  const edge = Math.ceil(count / 4),
    side = edge + 1,
    perimeter = edge * 4;
  return {
    side,
    positions: Array.from({ length: count }, (_, i) => {
      const at = Math.floor((i * perimeter) / count);
      return at < edge
        ? { row: 1, column: at + 1 }
        : at < 2 * edge
          ? { row: at - edge + 1, column: side }
          : at < 3 * edge
            ? { row: side, column: side - (at - 2 * edge) }
            : { row: side - (at - 3 * edge), column: 1 };
    }),
  };
}
export function BoardTable({
  model,
  state,
  recentEvents,
  busy,
  readOnly,
  automatic,
  setAutomatic,
  execute,
  autoStep,
  newGame,
  newGameDisabled,
}: {
  model: BoardModel;
  state: BoardState;
  recentEvents: { step: number; text: string }[];
  busy: boolean;
  readOnly: boolean;
  automatic: boolean;
  setAutomatic(value: boolean): void;
  execute(command: BoardCommand): void;
  autoStep(): void;
  newGame(): void;
  newGameDisabled: boolean;
}) {
  const [selection, setSelection] = useState<{
    id: string;
    random: number;
  } | null>(null);
  const legal = boardCommands(model, observeBoard(model, state, state.actor)),
    player = state.players[state.actor],
    pending = model.tiles.find((t) => t.id === state.pending),
    landing = model.tiles[state.lastMove?.to ?? 0],
    chosen =
      model.tiles.find(
        (t) => selection?.random === state.random && t.id === selection.id,
      ) ??
      pending ??
      landing,
    chosenIndex = model.tiles.indexOf(chosen),
    owner = state.owners[chosen.id],
    visitors = state.players.filter((p) => p.position === chosenIndex),
    layout = boardPositions(model.tiles.length),
    canAct =
      !busy && !readOnly && !state.outcome && !(automatic && state.actor === 1),
    TileIcon = tileIcons[chosen.type],
    DieIcon = diceIcons[state.lastMove?.die ?? 0];
  const dice = (
    <div
      key={state.random}
      className={`economy-die ${state.lastMove && !readOnly ? "has-roll" : ""}`}
      aria-label={
        state.lastMove ? `上次掷骰 ${state.lastMove.die} 点` : "等待首次掷骰"
      }
    >
      <DieIcon aria-hidden="true" />
    </div>
  );
  return (
    <section className="economy-table" aria-label="环形经济棋盘">
      <header className="economy-session">
        <div className="economy-turn">
          <span className="economy-live-dot" aria-hidden="true" />
          <strong>第 {state.turn} 回合</strong>
          <span className="economy-muted">/ {model.rules.maxTurns}</span>
          <span className="economy-turn-seat">
            {readOnly
              ? "只读回放"
              : state.outcome
                ? "本局结束"
                : `轮到 ${player.name}`}
          </span>
        </div>
        <div className="economy-rules">
          <span>
            <Flag aria-hidden="true" />
            经过起点 +{number(model.rules.salary)}
          </span>
          <span>
            <Dices aria-hidden="true" />
            {model.rules.diceSides} 面骰子
          </span>
        </div>
      </header>
      <div className="economy-scene-layout">
        <div className="economy-scene-main">
          <div className="economy-players" aria-label="双方资产">
            {state.players.map((p, seat) => (
              <section
                key={seat}
                className={`economy-player economy-player-${seat} ${state.actor === seat && !state.outcome ? "active" : ""}`}
                aria-label={`${p.name} 资产`}
              >
                <span className="economy-avatar" aria-hidden="true">
                  <UserRound />
                </span>
                <strong className="economy-player-name">
                  {p.name}
                  {p.bankrupt && <span> · 已破产</span>}
                </strong>
                <span className="economy-player-properties">
                  {Object.values(state.owners).filter((o) => o === seat).length}{" "}
                  处地产
                  <span className="economy-player-position">
                    {" "}
                    · {model.tiles[p.position].name}
                  </span>
                </span>
                <span className="economy-player-money">
                  <b>{number(p.cash)}</b>
                  <small>现金</small>
                </span>
              </section>
            ))}
          </div>
          {layout.side <= 3 && (
            <div className="economy-small-stage">
              <div>
                <small>环形经济棋盘</small>
                <h1>{model.name}</h1>
              </div>
              {layout.side === 2 && dice}
            </div>
          )}
          <div className="economy-board-scroll">
            <div
              className={`economy-board ${layout.side <= 3 ? "compact-center" : ""}`}
              style={{ "--board-side": layout.side } as CSSProperties}
              role="group"
              aria-label="按编号顺时针前进的棋盘"
            >
              {model.tiles.map((tile, i) => {
                const tileOwner = state.owners[tile.id],
                  Icon = tileIcons[tile.type],
                  players = state.players
                    .map((p, seat) => (p.position === i ? seat : null))
                    .filter((s): s is number => s !== null);
                return (
                  <button
                    type="button"
                    className={`economy-space ${tile.type} ${tileOwner === null ? "" : `owner-${tileOwner}`}`}
                    style={{
                      gridRow: layout.positions[i].row,
                      gridColumn: layout.positions[i].column,
                    }}
                    key={tile.id}
                    aria-pressed={chosen.id === tile.id}
                    aria-label={`地块 ${i + 1}：${tile.name}，${boardTileNames[tile.type]}，${tileOwner === null ? "无归属" : state.players[tileOwner].name + "所有"}${tile.type === "property" ? `，价格 ${tile.price}，租金 ${tile.rent}` : ""}${players.length ? "，" + players.map((s) => state.players[s].name).join("、") + "在此" : ""}`}
                    onClick={() =>
                      setSelection({ id: tile.id, random: state.random })
                    }
                  >
                    <span className="economy-space-top">
                      <span>{String(i + 1).padStart(2, "0")}</span>
                      <Icon aria-hidden="true" />
                    </span>
                    <strong>{tile.name}</strong>
                    <span className="economy-space-price">
                      {tile.type === "property" ? (
                        <>
                          <span>价 {number(tile.price)}</span>
                          <span>租 {number(tile.rent)}</span>
                        </>
                      ) : tile.type === "start" ? (
                        `经过 +${number(model.rules.salary)}`
                      ) : (
                        "停留，不收费"
                      )}
                    </span>
                    <span className="economy-space-bottom">
                      <span className="economy-space-owner">
                        {tileOwner === null
                          ? tile.type === "property"
                            ? "待售"
                            : boardTileNames[tile.type]
                          : state.players[tileOwner].name}
                      </span>
                      <span className="economy-tokens">
                        {players.map((s) => (
                          <span
                            className={`economy-token economy-token-${s}`}
                            key={s}
                            aria-hidden="true"
                          >
                            {s + 1}
                          </span>
                        ))}
                      </span>
                    </span>
                  </button>
                );
              })}
              {layout.side > 2 && (
                <div
                  className="economy-board-center"
                  style={{
                    gridRow: `2 / ${layout.side}`,
                    gridColumn: `2 / ${layout.side}`,
                  }}
                >
                  {layout.side > 3 && (
                    <div className="economy-center-title">
                      <small>环形经济棋盘</small>
                      <h1>{model.name}</h1>
                    </div>
                  )}
                  {dice}
                  {layout.side > 3 && (
                    <div className="economy-move-summary">
                      <strong>
                        {state.lastMove
                          ? `${state.players[state.lastMove.player].name} 前进 ${state.lastMove.die} 格`
                          : "从起点出发"}
                      </strong>
                      <span>
                        {state.lastMove
                          ? `来到「${landing.name}」`
                          : "轮流掷骰，经营你的地产"}
                      </span>
                    </div>
                  )}
                  <span className="economy-direction">
                    <RotateCw aria-hidden="true" />
                    顺时针前进
                  </span>
                </div>
              )}
            </div>
          </div>
          <div className="economy-board-caption">
            <span>
              <MousePointer2 aria-hidden="true" />
              按编号前进，末格连接起点；点击地块查看详情
            </span>
            <span className="economy-legend" aria-label="地产归属图例">
              {state.players.map((p, seat) => (
                <span key={seat}>
                  <span
                    className={`economy-seat-dot economy-seat-${seat}`}
                    aria-hidden="true"
                  />
                  {p.name}的地产
                </span>
              ))}
            </span>
          </div>
        </div>
        <aside className="economy-sidebar">
          <section className="economy-property" aria-label="地块详情">
            <div className="economy-property-top">
              <span>
                {String(chosenIndex + 1).padStart(2, "0")} ·{" "}
                {chosen.type === "property"
                  ? owner === null
                    ? "待售地产"
                    : "已购地产"
                  : boardTileNames[chosen.type]}
              </span>
              {!!visitors.length && (
                <span className="economy-arrival">
                  {visitors.map((p) => p.name).join("、")}在这里
                </span>
              )}
            </div>
            <div className="economy-property-heading">
              <div>
                <h2>{chosen.name}</h2>
                <span>
                  {chosen.type !== "property"
                    ? "公共地块"
                    : owner === null
                      ? "尚无归属"
                      : `${state.players[owner].name}的地产`}
                </span>
              </div>
              <span className="economy-property-art">
                <TileIcon aria-hidden="true" />
              </span>
            </div>
            <dl className="economy-property-values">
              {chosen.type === "property" ? (
                <>
                  <div>
                    <dt>购买价格</dt>
                    <dd>{number(chosen.price)}</dd>
                  </div>
                  <div>
                    <dt>落地租金</dt>
                    <dd>{number(chosen.rent)}</dd>
                  </div>
                </>
              ) : (
                <div>
                  <dt>
                    {chosen.type === "start" ? "经过或到达起点" : "到达效果"}
                  </dt>
                  <dd className="economy-property-effect">
                    {chosen.type === "start"
                      ? `领取 ${number(model.rules.salary)} 现金`
                      : "结束本回合，不额外收费"}
                  </dd>
                </div>
              )}
            </dl>
          </section>
          <section className="economy-action-panel" aria-label="当前行动">
            <div className="economy-decision-label">
              <span
                className={`economy-seat-dot economy-seat-${state.actor}`}
                aria-hidden="true"
              />
              {readOnly
                ? "正在查看冻结的棋盘状态"
                : state.outcome
                  ? "本局已结束"
                  : `轮到 ${player.name} 作出选择`}
            </div>
            <h2>
              {state.outcome
                ? state.outcome.kind === "won"
                  ? `${state.players[state.outcome.winner].name} 获胜`
                  : "本局达到回合上限"
                : pending
                  ? `购买「${pending.name}」？`
                  : `轮到 ${player.name} 掷骰`}
            </h2>
            <p>
              {state.outcome
                ? state.outcome.reason
                : pending
                  ? `对手停在这里时，将向 ${player.name} 支付 ${number(pending.rent)} 租金。`
                  : "掷骰后沿棋盘前进，结算经过起点收入和落地事件。"}
            </p>
            {pending && !state.outcome && (
              <dl className="economy-cash-preview">
                <div>
                  <dt>当前现金</dt>
                  <dd>{number(player.cash)}</dd>
                </div>
                <div>
                  <dt>购买支出</dt>
                  <dd>−{number(pending.price)}</dd>
                </div>
                <div className="economy-cash-after">
                  <dt>购买后剩余</dt>
                  <dd>{number(player.cash - pending.price)}</dd>
                </div>
              </dl>
            )}
            {readOnly && (
              <p className="economy-readonly" role="status">
                只读回放 · 不能操作棋盘
              </p>
            )}
            <div className="economy-action-buttons">
              {legal.map((command) => (
                <button
                  className={`button ${command.type === "skip" ? "" : "primary"}`}
                  key={command.type}
                  disabled={!canAct}
                  onClick={() => execute(command)}
                >
                  {command.type === "roll" && <Dices aria-hidden="true" />}
                  {command.type === "roll"
                    ? "掷骰前进"
                    : command.type === "buy"
                      ? `购买地产 · ${number(pending!.price)}`
                      : "跳过，保留现金"}
                  {command.type === "buy" && <ArrowRight aria-hidden="true" />}
                </button>
              ))}
              {!state.outcome && (
                <button
                  className="button economy-auto-step"
                  disabled={!canAct}
                  onClick={autoStep}
                >
                  <Bot aria-hidden="true" />
                  自动玩家走一步
                </button>
              )}
              {state.outcome && (
                <button
                  className="button primary"
                  disabled={busy || readOnly || newGameDisabled}
                  onClick={newGame}
                >
                  新开一局
                </button>
              )}
            </div>
            {!state.outcome && (
              <label className="economy-auto">
                <input
                  type="checkbox"
                  checked={automatic}
                  disabled={busy || readOnly}
                  onChange={(e) => setAutomatic(e.target.checked)}
                />
                <span>自动控制 {state.players[1].name}</span>
                <small>基础策略</small>
              </label>
            )}
          </section>
          <section className="economy-recent" aria-label="最近动态">
            <div className="economy-recent-heading">
              <h3>刚刚发生</h3>
              <span>最近 {recentEvents.length} 条</span>
            </div>
            <ol aria-live="polite">
              {recentEvents.map((event, i) => (
                <li key={`${event.step}-${i}`}>
                  <span>第 {event.step} 步</span>
                  <span>{event.text}</span>
                </li>
              ))}
            </ol>
          </section>
        </aside>
      </div>
      <footer className="economy-scene-footer">
        <span>
          <Check aria-hidden="true" />
          本局使用开局时的规则
        </span>
        <span role="status">
          {busy ? "正在保存操作…" : readOnly ? "只读回放" : "操作后自动保存"}
        </span>
      </footer>
    </section>
  );
}
