import {
  ArrowLeft,
  Grid2X2,
  Play,
  RotateCcw,
  Timer,
  Trophy,
  UserRound,
} from "lucide-react";
import { useEffect, useId, useRef } from "react";
import type { BoardResultSummary } from "./result";

const number = (value: number | null) =>
  value === null ? "—" : value.toLocaleString("zh-CN");

export function BoardResult({
  result,
  busy,
  readOnly,
  newGameDisabled,
  newGameDisabledReason,
  newGame,
  replay,
  returnDesign,
  inspectBoard,
}: {
  result: BoardResultSummary;
  busy: boolean;
  readOnly: boolean;
  newGameDisabled: boolean;
  newGameDisabledReason: string;
  newGame(): void;
  replay(): void;
  returnDesign(): void;
  inspectBoard(): void;
}) {
  const titleId = useId(),
    heading = useRef<HTMLHeadingElement>(null),
    Icon = result.kind === "won" ? Trophy : Timer,
    transfer = result.bankruptcy;
  useEffect(() => {
    heading.current?.closest(".play-window-body")?.scrollTo({ top: 0 });
    if (!readOnly) heading.current?.focus({ preventScroll: true });
  }, [readOnly]);
  return (
    <section
      className={`economy-table economy-result ${result.kind === "limit" ? "is-limit" : ""}`}
      aria-labelledby={titleId}
    >
      <div className="economy-result-content">
        <header className="economy-result-heading">
          <span className="economy-result-emblem">
            <Icon aria-hidden="true" />
          </span>
          <div>
            <div className="economy-result-eyebrow">
              <span>本局结算</span>
              {readOnly && <span>只读结果</span>}
              {result.kind === "limit" && <strong>未判胜负</strong>}
            </div>
            <h1 id={titleId} tabIndex={-1} ref={heading}>
              {result.title}
            </h1>
            <p>{result.reason}</p>
          </div>
        </header>
        <div className="economy-result-context">
          <strong>{result.modelName}</strong>
          <span>
            {result.turns} 回合 · {result.steps} 步操作 · 种子 {result.seed}
          </span>
        </div>
        {transfer && (
          <section className="economy-result-transfer" aria-label="破产结算">
            <div className="economy-result-section-heading">
              <h2>破产结算</h2>
              <span>
                {result.players[transfer.debtor].name} →{" "}
                {result.players[transfer.creditor].name}
              </span>
            </div>
            {transfer.property && (
              <p>落在「{transfer.property.name}」，现金不足支付租金。</p>
            )}
            <dl className="economy-result-payment">
              <div>
                <dt>应付租金</dt>
                <dd>{number(transfer.owed)}</dd>
              </div>
              <div>
                <dt>实际支付</dt>
                <dd>{number(transfer.paid)}</dd>
              </div>
              {transfer.transferred !== null && (
                <div>
                  <dt>移交地产</dt>
                  <dd>
                    {transfer.transferred.length}
                    <small> 处</small>
                  </dd>
                </div>
              )}
            </dl>
            {transfer.transferred !== null && (
              <p className="economy-result-transfer-note">
                {transfer.transferred.length
                  ? `移交给 ${result.players[transfer.creditor].name}：${transfer.transferred.map((tile) => tile.name).join("、")}。`
                  : "破产方没有持有地产，无需移交。"}
              </p>
            )}
          </section>
        )}
        {result.kind === "limit" && (
          <p className="economy-result-limit-note">
            双方均未被判定获胜，以下保留达到上限时的现金与地产归属。
          </p>
        )}
        <section className="economy-result-assets" aria-label="双方终局资产">
          {result.players.map((player) => (
            <section
              key={player.seat}
              className={`economy-result-player economy-player-${player.seat} ${result.winner === player.seat ? "is-winner" : ""}`}
              aria-label={`${player.name} 终局资产`}
            >
              <div className="economy-result-player-heading">
                <span className="economy-avatar">
                  <UserRound aria-hidden="true" />
                </span>
                <h2>{player.name}</h2>
                <span className="economy-result-player-status">
                  {result.winner === player.seat
                    ? "获胜"
                    : player.bankrupt
                      ? "已破产"
                      : "终局资产"}
                </span>
              </div>
              <dl className="economy-result-balances">
                <div>
                  <dt>最终现金</dt>
                  <dd>{number(player.cash)}</dd>
                </div>
                <div>
                  <dt>持有地产</dt>
                  <dd>
                    {player.properties.length}
                    <small> 处</small>
                  </dd>
                </div>
              </dl>
              {!!player.properties.length ? (
                <ul
                  className="economy-result-properties"
                  aria-label={`${player.name} 持有地产`}
                >
                  {player.properties.map((tile) => (
                    <li key={tile.id}>
                      <span>{tile.name}</span>
                      {transfer?.transferred?.some(
                        (land) => land.id === tile.id,
                      ) && <small>移交所得</small>}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="economy-result-empty">无持有地产</p>
              )}
            </section>
          ))}
        </section>
        {!!result.unowned.length && (
          <details className="economy-result-unowned">
            <summary>尚未售出的地产 · {result.unowned.length} 处</summary>
            <ul>
              {result.unowned.map((tile) => (
                <li key={tile.id}>{tile.name}</li>
              ))}
            </ul>
          </details>
        )}
        <footer className="economy-result-actions">
          <div className="economy-result-main-actions">
            <button
              className="button primary"
              disabled={busy || readOnly || newGameDisabled}
              onClick={newGame}
            >
              <Play aria-hidden="true" />
              新开一局
            </button>
            <button className="button" disabled={busy} onClick={replay}>
              <RotateCcw aria-hidden="true" />
              回放本局
            </button>
            <button className="button" disabled={busy} onClick={returnDesign}>
              <ArrowLeft aria-hidden="true" />
              返回设计
            </button>
          </div>
          <button
            className="button economy-result-board-link"
            disabled={busy}
            onClick={inspectBoard}
          >
            <Grid2X2 aria-hidden="true" />
            查看终局棋盘
          </button>
          <p>
            {readOnly
              ? "只读结果，不能从此处新开对局。"
              : newGameDisabledReason ||
                "新局使用当前设计与试玩种子，本局记录继续保留。"}
          </p>
        </footer>
      </div>
    </section>
  );
}
