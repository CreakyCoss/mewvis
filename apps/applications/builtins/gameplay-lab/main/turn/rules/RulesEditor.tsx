import { Plus } from "lucide-react";
import { uid } from "../../shared/utils";
import { validateModel, type Model } from "../model";
import { DefinitionActions } from "./DefinitionActions";
import { EffectsEditor, amount } from "./EffectsEditor";
export function RulesEditor({
  model,
  cardMode = true,
  update,
  duplicate,
  remove,
}: {
  model: Model;
  cardMode?: boolean;
  update(change: (m: Model) => void): void;
  duplicate(id: string): void;
  remove(id: string): void;
}) {
  const issues = validateModel(model);
  return (
    <section className="page-content rules-page">
      <div className="page-heading">
        <div>
          <h1>{cardMode ? "卡牌与回合" : "流程与产出"}</h1>
          <p>
            {cardMode
              ? "设计牌池、卡牌分组与基础值，并配置回合结算。"
              : "配置行动机会、回合上限与周期产出。"}
          </p>
        </div>
      </div>
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
      {cardMode && (
        <>
          <div className="section-title section-gap">
            <h2>牌池与卡牌</h2>
            <button
              className="button"
              disabled={model.collections.length >= 80}
              onClick={() =>
                update((m) => {
                  m.collections.push({
                    id: uid("collection"),
                    name: "新牌池",
                    handSize: 1,
                    maxSelect: 1,
                    cards: [],
                  });
                })
              }
            >
              <Plus size={15} />
              添加牌池
            </button>
          </div>
          {!model.collections.length && (
            <p className="hint">
              暂无集合。需要抽取、选择和补充对象时，添加牌池并在行动效果中配置组合计分。
            </p>
          )}
          {model.collections.map((c) => (
            <section
              className="settings-section collection-editor"
              key={c.id}
              aria-label={`牌池 ${c.name}`}
            >
              <div className="rule-grid">
                <label className="form-field">
                  牌池名称
                  <input
                    aria-label="牌池名称"
                    maxLength={60}
                    value={c.name}
                    onChange={(e) =>
                      update((m) => {
                        m.collections.find((v) => v.id === c.id)!.name =
                          e.target.value;
                      })
                    }
                  />
                </label>
                <label className="form-field">
                  手牌容量
                  <input
                    aria-label="手牌容量"
                    type="number"
                    min="1"
                    max="10"
                    value={c.handSize}
                    onChange={(e) =>
                      update((m) => {
                        m.collections.find((v) => v.id === c.id)!.handSize =
                          amount(e.target.value, 1, 10);
                      })
                    }
                  />
                </label>
                <label className="form-field">
                  每次选择上限
                  <input
                    aria-label="每次选择上限"
                    type="number"
                    min="1"
                    max="10"
                    value={c.maxSelect}
                    onChange={(e) =>
                      update((m) => {
                        m.collections.find((v) => v.id === c.id)!.maxSelect =
                          amount(e.target.value, 1, 10);
                      })
                    }
                  />
                </label>
              </div>
              <p className="hint">
                同组卡牌每两张组成一对。奖励在行动的“组合计分”效果中设置。
              </p>
              <div className="table-scroll">
                <table className="data-table card-editor">
                  <thead>
                    <tr>
                      <th>卡牌名称</th>
                      <th>分组</th>
                      <th>基础值</th>
                      <th>操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {c.cards.map((card, i) => (
                      <tr key={card.id}>
                        <td>
                          <input
                            aria-label={`卡牌 ${i + 1} 名称`}
                            value={card.name}
                            maxLength={60}
                            onChange={(e) =>
                              update((m) => {
                                m.collections.find((v) => v.id === c.id)!.cards[
                                  i
                                ].name = e.target.value;
                              })
                            }
                          />
                        </td>
                        <td>
                          <input
                            aria-label={`卡牌 ${i + 1} 分组`}
                            value={card.group}
                            maxLength={60}
                            onChange={(e) =>
                              update((m) => {
                                m.collections.find((v) => v.id === c.id)!.cards[
                                  i
                                ].group = e.target.value;
                              })
                            }
                          />
                        </td>
                        <td>
                          <input
                            aria-label={`卡牌 ${i + 1} 基础值`}
                            type="number"
                            min="0"
                            max="1000000"
                            value={card.value}
                            onChange={(e) =>
                              update((m) => {
                                m.collections.find((v) => v.id === c.id)!.cards[
                                  i
                                ].value = amount(e.target.value);
                              })
                            }
                          />
                        </td>
                        <td>
                          <button
                            className="text-button danger-text"
                            aria-label={`移除卡牌 ${i + 1}`}
                            onClick={() =>
                              update((m) => {
                                m.collections
                                  .find((v) => v.id === c.id)!
                                  .cards.splice(i, 1);
                              })
                            }
                          >
                            移除
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <button
                className="text-button"
                disabled={c.cards.length >= 100}
                onClick={() =>
                  update((m) => {
                    m.collections
                      .find((v) => v.id === c.id)!
                      .cards.push({
                        id: uid("card"),
                        name: "新卡牌",
                        group: "默认",
                        value: 1,
                      });
                  })
                }
              >
                <Plus size={14} />
                添加卡牌
              </button>
              <DefinitionActions
                model={model}
                id={c.id}
                duplicate={() => duplicate(c.id)}
                remove={() => remove(c.id)}
              />
            </section>
          ))}
        </>
      )}
      {!!issues.length && (
        <div className="validation-errors" role="alert">
          {issues.slice(0, 8).map((issue, i) => (
            <p key={i}>
              {issue.path}：{issue.message}
            </p>
          ))}
        </div>
      )}
    </section>
  );
}
