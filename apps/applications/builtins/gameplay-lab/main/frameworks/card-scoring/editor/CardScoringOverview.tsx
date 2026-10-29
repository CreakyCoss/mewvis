import type { CardModel } from "../../../domains/card/model";
import type { ReadinessIssue } from "../../../shared/contracts";
import { cardScoringDefinition } from "../definition";
import type { CardDesignTab } from "./CardScoringEditor";
export function CardScoringOverview({
  model,
  issues,
  disabled,
  open,
  play,
  fix,
  brief,
  changeBrief,
  update,
}: {
  model: CardModel;
  issues: ReadinessIssue[];
  disabled: boolean;
  open(tab: CardDesignTab): void;
  play(): void;
  fix(issue: ReadinessIssue): void;
  brief: { coreLoop: string; question: string };
  changeBrief(value: { coreLoop: string; question: string }): void;
  update(change: (model: CardModel) => void): void;
}) {
  const label = (path: string) =>
    [
      ...model.cards,
      ...model.decks,
      ...model.fields,
      ...model.actions,
      ...model.goals,
      ...model.capabilities,
    ].find((item) => item.id === path)?.name || path;
  return (
    <section className="page-content framework-overview">
      <div className="page-heading">
        <div>
          <p className="eyebrow">卡牌 · 玩法框架</p>
          <h1>{model.name}</h1>
          <p>{cardScoringDefinition.description}</p>
        </div>
        <button className="button primary" disabled={disabled} onClick={play}>
          开始试玩
        </button>
      </div>
      <section className="settings-section">
        <h2>组合计分</h2>
        <p>
          框架提供选牌、配对计分、抽补牌、回合和结束流程。先填自己的内容，再在牌桌上验证。
        </p>
        <div className="framework-steps">
          <button onClick={() => open("cards")}>
            <small>01 · 卡牌</small>
            <strong>{model.cards.length} 种卡牌</strong>
            <span>名称、分组与基础分</span>
          </button>
          <button onClick={() => open("decks")}>
            <small>02 · 牌库</small>
            <strong>
              {model.decks.reduce(
                (sum, deck) =>
                  sum +
                  deck.entries.reduce((count, entry) => count + entry.count, 0),
                0,
              )}{" "}
              张牌
            </strong>
            <span>数量、手牌和抽补牌</span>
          </button>
          <button onClick={() => open("scoring")}>
            <small>03 · 计分与回合</small>
            <strong>{model.goals.length} 个目标</strong>
            <span>奖励、倍率、目标与轮数</span>
          </button>
        </div>
      </section>
      <section className="settings-section">
        <h2>
          {issues.length
            ? `试玩前还有 ${issues.length} 项待配置`
            : "可以开始试玩"}
        </h2>
        {issues.length ? (
          <ul className="readiness-list">
            {issues.map((issue, i) => (
              <li key={i}>
                <div>
                  <strong>{label(issue.path)}</strong>
                  <p>{issue.message}</p>
                </div>
                <button className="text-button" onClick={() => fix(issue)}>
                  去配置
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="hint">
            内容与规则已就绪。试玩窗口使用独立快照，操作会自动保存，可关闭后继续。
          </p>
        )}
      </section>
      <section className="settings-section">
        <h2>设计意图</h2>
        <label className="form-field">
          这套方案想提供什么体验？
          <textarea
            aria-label="设计目标"
            maxLength={2000}
            rows={3}
            value={model.description}
            onChange={(event) =>
              update((model) => {
                model.description = event.target.value;
              })
            }
          />
        </label>
        <label className="form-field">
          核心循环
          <textarea
            aria-label="核心循环"
            maxLength={4000}
            rows={2}
            value={brief.coreLoop}
            onChange={(event) =>
              changeBrief({ ...brief, coreLoop: event.target.value })
            }
          />
        </label>
        <label className="form-field">
          本次想验证的问题
          <textarea
            aria-label="待验证问题"
            maxLength={4000}
            rows={2}
            value={brief.question}
            onChange={(event) =>
              changeBrief({ ...brief, question: event.target.value })
            }
          />
        </label>
      </section>
    </section>
  );
}
