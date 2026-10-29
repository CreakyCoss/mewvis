import type { CardModel } from "../../../../domains/card/model";
import type {
  ModuleEditorProps,
  ModulePlayProps,
  ModulePresentation,
} from "../../../composition/ui";
import type {
  CardScoringCommand,
  CardScoringView,
} from "../../composition/contracts";
import { scoringPreview } from "../../play/preview";
import { scoringRules } from "../../structure";

function PairRewardEditor({ model, update }: ModuleEditorProps<CardModel>) {
  const rules = scoringRules(model);
  return (
    <section className="page-content">
      <div className="page-heading">
        <div>
          <h1>配对奖励</h1>
          <p>
            每次提交中，相同分组的两张牌组成一对。奖励与基础分相加后计算倍率。
          </p>
        </div>
      </div>
      {!rules.length && (
        <p className="hint">先在“计分与回合”中准备计分行动。</p>
      )}
      {rules.map((rule, i) => (
        <section className="settings-section" key={rule.action.id}>
          <h2>{rule.action.name}</h2>
          <label className="form-field">
            每对同组卡牌奖励
            <input
              aria-label={"配对奖励 " + (i + 1)}
              type="number"
              min={0}
              max={1000000}
              value={rule.effect.pairBonus ?? 15}
              onChange={(e) =>
                update((m) => {
                  const effect = m.actions
                    .find((a) => a.id === rule.action.id)
                    ?.effects.find((e) => e.type === "combination");
                  if (effect?.type === "combination")
                    effect.pairBonus = Math.max(
                      0,
                      Math.min(
                        1000000,
                        Math.floor(Number(e.target.value) || 0),
                      ),
                    );
                })
              }
            />
          </label>
          <p className="hint">
            关闭模块时保留此数值，实际计分与自动选牌使用零配对奖励。
          </p>
        </section>
      ))}
    </section>
  );
}
function PairRewardDetail({
  model,
  view,
  selected = [],
  actionId,
}: ModulePlayProps<CardModel, CardScoringCommand, CardScoringView>) {
  const preview = actionId
    ? scoringPreview(model, view.state, actionId, selected)
    : null;
  return preview ? (
    <span>
      （基础 {preview.result.base} + 配对奖励 {preview.result.bonus}）×{" "}
      {preview.multiplier}
    </span>
  ) : null;
}
export const pairRewardPresentation: ModulePresentation<
  CardModel,
  CardScoringCommand,
  CardScoringView
> = {
  id: "pair-reward",
  Editor: PairRewardEditor,
  slots: { "score-detail": PairRewardDetail },
};
