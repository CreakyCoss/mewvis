import type { Model } from "../model";
import { EffectsEditor, amount } from "./EffectsEditor";
export function FlowEditor({
  model,
  update,
}: {
  model: Model;
  update(change: (model: Model) => void): void;
}) {
  return (
    <section className="settings-section">
      <h2>流程与周期结算</h2>
      <p className="hint">
        所有参与者结束阶段后，依次为每位参与者执行以下效果，再检查目标。效果按列表顺序执行。
      </p>
      <div className="rule-grid">
        <label className="form-field">
          每阶段行动数
          <input
            type="number"
            min="1"
            max="10"
            value={model.flow.actionsPerTurn}
            onChange={(e) =>
              update((m) => {
                m.flow.actionsPerTurn = amount(e.target.value, 1, 10);
              })
            }
          />
        </label>
        <label className="form-field">
          轮数上限
          <input
            type="number"
            min="1"
            max="100"
            value={model.flow.maxRounds}
            onChange={(e) =>
              update((m) => {
                m.flow.maxRounds = amount(e.target.value, 1, 100);
              })
            }
          />
        </label>
      </div>
      <EffectsEditor
        model={model}
        effects={model.flow.income}
        label="周期效果"
        change={(effects) =>
          update((m) => {
            m.flow.income = effects;
          })
        }
      />
    </section>
  );
}
