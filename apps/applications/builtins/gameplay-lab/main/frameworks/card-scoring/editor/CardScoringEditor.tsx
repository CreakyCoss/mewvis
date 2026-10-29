import {
  NativeSelect,
  NativeSelectOption,
} from "design-system/components/ui/native-select";
import { Plus } from "lucide-react";
import {
  MAX_DECKS,
  newDeck,
  type CardModel,
} from "../../../domains/card/model";
import { amount, EffectsEditor } from "../../../shared/turn/EffectsEditor";
import { addScoringStructure, scoringRules } from "../structure";
import { CardLibraryEditor } from "./components/CardLibraryEditor";
import { DeckEditor } from "./components/DeckEditor";

export type CardDesignTab = "cards" | "decks" | "scoring";
export function CardScoringEditor({
  model,
  tab,
  update,
}: {
  model: CardModel;
  tab: CardDesignTab;
  update(change: (model: CardModel) => void): void;
}) {
  const rules = scoringRules(model);
  const patchRule = (
    id: string,
    change: (rule: ReturnType<typeof scoringRules>[number]) => void,
  ) =>
    update((model) => {
      const rule = scoringRules(model).find((rule) => rule.action.id === id);
      if (rule) change(rule);
    });
  if (tab === "cards")
    return (
      <section className="page-content">
        <div className="page-heading">
          <div>
            <h1>卡牌</h1>
            <p>
              设计牌名、分组与基础分。相同分组按两张组成一对，配对奖励在启用模块后出现的“配对奖励”中设置。
            </p>
          </div>
        </div>
        <CardLibraryEditor model={model} update={update} />
      </section>
    );
  if (tab === "decks")
    return (
      <section className="page-content">
        <div className="page-heading">
          <div>
            <h1>牌库</h1>
            <p>将自己的卡牌加入牌库，设置数量、手牌容量及抽补牌方式。</p>
          </div>
          <button
            className="button"
            disabled={model.decks.length >= MAX_DECKS}
            onClick={() =>
              update((model) => {
                model.decks.push(newDeck());
              })
            }
          >
            <Plus size={15} />
            添加牌库
          </button>
        </div>
        {!model.decks.length && (
          <p className="hint">添加牌库后，将卡牌加入其中。</p>
        )}
        {model.decks.map((deck) => (
          <DeckEditor key={deck.id} model={model} deck={deck} update={update} />
        ))}
      </section>
    );
  return (
    <section className="page-content scoring-editor">
      <div className="page-heading">
        <div>
          <h1>计分与回合</h1>
          <p>
            本框架按“选牌 → 基础分与配对奖励 → 倍率 →
            得分目标”结算。每次提交占用一次行动。
          </p>
        </div>
      </div>
      {!rules.length && (
        <section className="settings-section">
          <h2>准备计分结构</h2>
          <p>添加得分状态、计分行动和目标，随后就可以直接调整计分参数。</p>
          <button
            className="button"
            disabled={
              model.fields.length >= 80 ||
              model.actions.length >= 80 ||
              model.goals.length >= 80
            }
            onClick={() => update(addScoringStructure)}
          >
            添加组合计分结构
          </button>
        </section>
      )}
      {rules.map((rule, index) => (
        <section
          className="settings-section"
          key={rule.action.id}
          data-content-key={`action:${rule.action.id}`}
          tabIndex={-1}
        >
          <h2>{rule.action.name}</h2>
          <div className="rule-grid">
            <label className="form-field">
              出牌按钮名称
              <input
                aria-label={`出牌按钮名称 ${index + 1}`}
                maxLength={60}
                value={rule.action.name}
                onChange={(event) =>
                  patchRule(rule.action.id, (rule) => {
                    rule.action.name = event.target.value;
                  })
                }
              />
            </label>
            <label className="form-field">
              出牌使用的牌库
              <NativeSelect
                size="sm"
                aria-label={`出牌牌库 ${index + 1}`}
                value={rule.effect.collection}
                onChange={(event) =>
                  patchRule(rule.action.id, (rule) => {
                    rule.effect.collection = event.target.value;
                  })
                }
              >
                {!model.decks.some(
                  (deck) => deck.id === rule.effect.collection,
                ) && (
                  <NativeSelectOption value={rule.effect.collection}>
                    请选择有效牌库
                  </NativeSelectOption>
                )}
                {model.decks.map((deck) => (
                  <NativeSelectOption key={deck.id} value={deck.id}>
                    {deck.name}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </label>
            <label className="form-field">
              倍率来源
              <NativeSelect
                size="sm"
                aria-label={`倍率来源 ${index + 1}`}
                value={rule.effect.multiplier ?? ""}
                onChange={(event) =>
                  patchRule(rule.action.id, (rule) => {
                    if (event.target.value) {
                      rule.effect.multiplier = event.target.value;
                      delete rule.effect.multiplierValue;
                    } else {
                      delete rule.effect.multiplier;
                      rule.effect.multiplierValue = 1;
                    }
                  })
                }
              >
                {rule.effect.multiplier &&
                  !model.fields.some(
                    (field) => field.id === rule.effect.multiplier,
                  ) && (
                    <NativeSelectOption value={rule.effect.multiplier}>
                      缺失状态：{rule.effect.multiplier}
                    </NativeSelectOption>
                  )}
                <NativeSelectOption value="">固定倍率</NativeSelectOption>
                {model.fields.map((field) => (
                  <NativeSelectOption key={field.id} value={field.id}>
                    {field.name}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </label>
            {!rule.effect.multiplier && (
              <label className="form-field">
                固定倍率
                <input
                  aria-label={`固定倍率 ${index + 1}`}
                  type="number"
                  min={0}
                  max={1000000}
                  value={rule.effect.multiplierValue ?? 1}
                  onChange={(event) =>
                    patchRule(rule.action.id, (rule) => {
                      rule.effect.multiplierValue = amount(event.target.value);
                    })
                  }
                />
              </label>
            )}
          </div>
          <p className="hint">
            得分 =（选中卡牌基础分之和 + 同组配对数 × 配对奖励）× 倍率。
          </p>
          <details
            className="advanced-editor"
            open={!model.fields.some((field) => field.id === rule.effect.field)}
          >
            <summary>高级：得分写入状态</summary>
            <label className="form-field">
              得分状态
              <NativeSelect
                size="sm"
                aria-label={`得分状态 ${index + 1}`}
                value={rule.effect.field}
                onChange={(event) =>
                  patchRule(rule.action.id, (rule) => {
                    rule.effect.field = event.target.value;
                  })
                }
              >
                {!model.fields.some(
                  (field) => field.id === rule.effect.field,
                ) && (
                  <NativeSelectOption value={rule.effect.field}>
                    缺失状态：{rule.effect.field}
                  </NativeSelectOption>
                )}
                {model.fields.map((field) => (
                  <NativeSelectOption key={field.id} value={field.id}>
                    {field.name}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </label>
          </details>
        </section>
      ))}
      <section className="settings-section">
        <h2>本局目标</h2>
        {!model.goals.length && (
          <p className="hint">请在高级规则中添加结束目标。</p>
        )}
        {model.goals.map((goal, index) => (
          <div
            className="rule-grid"
            key={goal.id}
            data-content-key={`goal:${goal.id}`}
            tabIndex={-1}
          >
            <label className="form-field">
              目标名称
              <input
                aria-label={`目标名称 ${index + 1}`}
                value={goal.name}
                maxLength={60}
                onChange={(event) =>
                  update((model) => {
                    model.goals.find((value) => value.id === goal.id)!.name =
                      event.target.value;
                  })
                }
              />
            </label>
            <label className="form-field">
              {model.fields.find((field) => field.id === goal.field)?.name ??
                "目标数值"}
              达到
              <input
                aria-label={`目标数值 ${index + 1}`}
                type="number"
                min={1}
                max={1000000}
                value={goal.threshold}
                onChange={(event) =>
                  update((model) => {
                    model.goals.find(
                      (value) => value.id === goal.id,
                    )!.threshold = amount(event.target.value, 1);
                  })
                }
              />
            </label>
          </div>
        ))}
      </section>
      <section
        className="settings-section"
        data-content-key="flow:flow"
        tabIndex={-1}
      >
        <h2>回合设置</h2>
        <div className="rule-grid">
          <label className="form-field">
            每位玩家每轮行动次数
            <input
              aria-label="每轮行动次数"
              type="number"
              min={1}
              max={10}
              value={model.flow.actionsPerTurn}
              onChange={(event) =>
                update((model) => {
                  model.flow.actionsPerTurn = amount(event.target.value, 1, 10);
                })
              }
            />
          </label>
          <label className="form-field">
            最多轮数
            <input
              aria-label="最多轮数"
              type="number"
              min={1}
              max={100}
              value={model.flow.maxRounds}
              onChange={(event) =>
                update((model) => {
                  model.flow.maxRounds = amount(event.target.value, 1, 100);
                })
              }
            />
          </label>
        </div>
        <details className="advanced-editor">
          <summary>高级：周期效果</summary>
          <EffectsEditor
            model={model}
            effects={model.flow.income}
            label="周期效果"
            change={(effects) =>
              update((model) => {
                model.flow.income = effects;
              })
            }
          />
        </details>
      </section>
    </section>
  );
}
