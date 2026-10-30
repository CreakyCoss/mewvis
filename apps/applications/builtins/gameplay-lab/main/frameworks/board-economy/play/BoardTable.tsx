import { useState, type CSSProperties } from "react";
import { boardTileNames, type BoardModel } from "../model";
import {
  boardCommands,
  observeBoard,
  type BoardCommand,
  type BoardState,
} from "../runtime";

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
  busy: boolean;
  readOnly: boolean;
  automatic: boolean;
  setAutomatic(value: boolean): void;
  execute(command: BoardCommand): void;
  autoStep(): void;
  newGame(): void;
  newGameDisabled: boolean;
}) {
  const [selected, setSelected] = useState<string>("");
  const legal = boardCommands(model, observeBoard(model, state, state.actor)),
    p = state.players[state.actor],
    pending = model.tiles.find((t) => t.id === state.pending);
  const canAct =
      !busy && !readOnly && !state.outcome && !(automatic && state.actor === 1),
    layout = boardPositions(model.tiles.length),
    chosen = model.tiles.find((t) => t.id === selected);
  return (
    <section className="economy-table" aria-label="环形经济棋盘">
      <header className="economy-table-heading">
        <div>
          <small>双人环形棋盘</small>
          <h1>{model.name}</h1>
          <p>
            第 {state.turn} / {model.rules.maxTurns} 回合 ·{" "}
            {state.outcome
              ? "本局已结束"
              : `${p.name} · ${state.phase === "purchase" ? "决定是否购买" : "准备掷骰"}`}
          </p>
        </div>
        <span>
          每圈收入 {model.rules.salary} · {model.rules.diceSides} 面骰子
        </span>
      </header>
      <div className="economy-players">
        {state.players.map((player, seat) => (
          <section
            key={seat}
            className={`economy-player economy-player-${seat} ${state.actor === seat && !state.outcome ? "active" : ""}`}
            aria-label={`${player.name} 资产`}
          >
            <strong>
              <span className={`economy-token economy-token-${seat}`}>
                {seat + 1}
              </span>
              {player.name}
              {player.bankrupt ? " · 已破产" : ""}
            </strong>
            <b>
              {player.cash}
              <small> 现金</small>
            </b>
            <p>
              {Object.values(state.owners).filter((o) => o === seat).length}{" "}
              处地产 · {model.tiles[player.position].name}
            </p>
          </section>
        ))}
      </div>
      <div className="economy-scene-layout">
        <div>
          <div className="economy-board-scroll">
            <div
              className="economy-board"
              style={{ "--board-side": layout.side } as CSSProperties}
              role="group"
              aria-label="按编号顺时针前进的棋盘"
            >
              {model.tiles.map((tile, i) => {
                const owner = state.owners[tile.id],
                  players = state.players
                    .map((p, seat) => (p.position === i ? seat : null))
                    .filter((s): s is number => s !== null);
                return (
                  <button
                    type="button"
                    className={`economy-space ${tile.type} ${owner === null ? "" : `owner-${owner}`} ${players.length ? "occupied" : ""}`}
                    style={{
                      gridRow: layout.positions[i].row,
                      gridColumn: layout.positions[i].column,
                    }}
                    key={tile.id}
                    aria-pressed={selected === tile.id}
                    aria-label={`地块 ${i + 1}：${tile.name}，${boardTileNames[tile.type]}，${owner === null ? "无归属" : state.players[owner].name + "所有"}${players.length ? "，" + players.map((s) => state.players[s].name).join("、") + "在此" : ""}`}
                    onClick={() => setSelected(tile.id)}
                  >
                    <small>
                      {i + 1} · {boardTileNames[tile.type]}
                    </small>
                    <strong>{tile.name}</strong>
                    {tile.type === "property" ? (
                      <span>
                        价 {tile.price} · 租 {tile.rent}
                      </span>
                    ) : (
                      <span>
                        {tile.type === "start"
                          ? `每圈 +${model.rules.salary}`
                          : "暂停留步"}
                      </span>
                    )}
                    <span className="economy-space-owner">
                      {owner === null
                        ? tile.type === "property"
                          ? "待售"
                          : "公共地块"
                        : state.players[owner].name}
                    </span>
                    <span className="economy-tokens">
                      {players.map((s) => (
                        <span
                          className={`economy-token economy-token-${s}`}
                          key={s}
                        >
                          {s + 1}
                        </span>
                      ))}
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
                  aria-label="上次掷骰"
                >
                  <strong>{state.lastMove?.die ?? "◇"}</strong>
                  <p>
                    {state.lastMove
                      ? `${state.players[state.lastMove.player].name} 上次掷骰`
                      : "从起点出发"}
                  </p>
                  <small>末格连接起点</small>
                </div>
              )}
            </div>
          </div>
          <p className="economy-board-caption">
            按编号顺时针前进，末格连接起点；点击地块查看详情。
          </p>
          {chosen && (
            <div className="economy-detail" role="status">
              <strong>
                {chosen.name} · {boardTileNames[chosen.type]}
              </strong>
              <p>
                {chosen.type === "property"
                  ? `购买 ${chosen.price}，落地租金 ${chosen.rent}；${state.owners[chosen.id] === null ? "尚未购买" : state.players[state.owners[chosen.id]!].name + "所有"}`
                  : chosen.type === "start"
                    ? `每次经过领取 ${model.rules.salary}，落在起点也计一次。`
                    : "到达后本回合结束。"}
              </p>
            </div>
          )}
        </div>
        <aside className="economy-action-panel">
          <h2>
            {state.outcome
              ? state.outcome.kind === "won"
                ? `${state.players[state.outcome.winner].name} 获胜`
                : "本局达到回合上限"
              : state.phase === "purchase"
                ? `购买「${pending?.name}」？`
                : `轮到 ${p.name}`}
          </h2>
          {state.outcome ? (
            <p>{state.outcome.reason}</p>
          ) : pending ? (
            <p>
              价格 {pending.price} · 租金 {pending.rent}
              <br />
              当前现金 {p.cash}，购买后 {p.cash - pending.price}。
            </p>
          ) : (
            <p>掷骰前进并结算落点。收入与租金按顺序一起保存。</p>
          )}
          <div className="economy-event-message" aria-live="polite">
            {state.events.map((e, i) => (
              <p key={i}>{e.text}</p>
            ))}
          </div>
          {readOnly && <p>历史回放期间不能操作。</p>}
          <div className="economy-action-buttons">
            {legal.map((command) => (
              <button
                className={`button ${command.type === "skip" ? "" : "primary"}`}
                key={command.type}
                disabled={!canAct}
                onClick={() => execute(command)}
              >
                {command.type === "roll"
                  ? "掷骰前进"
                  : command.type === "buy"
                    ? `购买地产 · ${pending?.price}`
                    : "跳过购买"}
              </button>
            ))}
          </div>
          {!state.outcome && (
            <>
              <button
                className="button"
                disabled={busy || readOnly}
                onClick={autoStep}
              >
                自动玩家走一步
              </button>
              <label className="economy-auto">
                <input
                  type="checkbox"
                  checked={automatic}
                  disabled={busy || readOnly}
                  onChange={(e) => setAutomatic(e.target.checked)}
                />
                自动控制玩家 2
              </label>
            </>
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
          {busy && <p role="status">正在保存操作…</p>}
        </aside>
      </div>
    </section>
  );
}
