import { Copy, Plus } from "lucide-react";
import { useState } from "react";
import { copy, uid } from "../../shared/utils";
import { amount } from "../../turn/rules/EffectsEditor";
import { MAX_CARD_DEFINITIONS, type CardModel } from "../model";

export function CardLibraryEditor({
  model,
  update,
}: {
  model: CardModel;
  update(change: (model: CardModel) => void): void;
}) {
  const [error, setError] = useState("");
  return (
    <section className="settings-section" aria-label="卡牌定义">
      <div className="section-title">
        <h2>卡牌定义</h2>
        <button
          className="button"
          disabled={model.cards.length >= MAX_CARD_DEFINITIONS}
          onClick={() =>
            update((model) => {
              model.cards.push({
                id: uid("card"),
                name: "新卡牌",
                description: "",
                group: "默认",
                value: 1,
              });
            })
          }
        >
          <Plus size={15} />
          添加卡牌定义
        </button>
      </div>
      <p className="hint">
        这里定义一种牌的属性；牌库中设置数量。试玩中的每张副本都有独立标识，修改定义只影响新的试玩。
      </p>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {!model.cards.length ? (
        <p className="hint">从自己的第一种卡牌开始，再将它加入牌库。</p>
      ) : (
        <div className="table-scroll">
          <table className="data-table card-library-table">
            <thead>
              <tr>
                <th>卡牌名称</th>
                <th>分组</th>
                <th>基础值</th>
                <th>说明</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {model.cards.map((card, i) => (
                <tr key={card.id}>
                  <td>
                    <input
                      aria-label={`卡牌定义 ${i + 1} 名称`}
                      maxLength={300}
                      value={card.name}
                      onChange={(event) =>
                        update((model) => {
                          model.cards[i].name = event.target.value;
                        })
                      }
                    />
                  </td>
                  <td>
                    <input
                      aria-label={`卡牌定义 ${i + 1} 分组`}
                      maxLength={300}
                      value={card.group}
                      onChange={(event) =>
                        update((model) => {
                          model.cards[i].group = event.target.value;
                        })
                      }
                    />
                  </td>
                  <td>
                    <input
                      aria-label={`卡牌定义 ${i + 1} 基础值`}
                      type="number"
                      min={0}
                      max={1_000_000}
                      value={card.value}
                      onChange={(event) =>
                        update((model) => {
                          model.cards[i].value = amount(event.target.value);
                        })
                      }
                    />
                  </td>
                  <td>
                    <input
                      aria-label={`卡牌定义 ${i + 1} 说明`}
                      maxLength={2000}
                      value={card.description}
                      onChange={(event) =>
                        update((model) => {
                          model.cards[i].description = event.target.value;
                        })
                      }
                    />
                  </td>
                  <td>
                    <div className="settings-actions">
                      <button
                        className="text-button"
                        aria-label={`复制卡牌定义 ${i + 1}`}
                        disabled={model.cards.length >= MAX_CARD_DEFINITIONS}
                        onClick={() =>
                          update((model) => {
                            model.cards.push({
                              ...copy(card),
                              id: uid("card"),
                              name: `${card.name.slice(0, 290)} 副本`,
                            });
                          })
                        }
                      >
                        <Copy size={14} />
                        复制
                      </button>
                      <button
                        className="text-button danger-text"
                        aria-label={`删除卡牌定义 ${i + 1}`}
                        onClick={() => {
                          const refs = model.decks.filter((deck) =>
                            deck.entries.some(
                              (entry) => entry.card === card.id,
                            ),
                          );
                          if (refs.length) {
                            setError(
                              `请先从牌库中移除这张牌：${refs.map((deck) => deck.name).join("、")}`,
                            );
                            return;
                          }
                          setError("");
                          update((model) => {
                            model.cards.splice(i, 1);
                          });
                        }}
                      >
                        删除
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
