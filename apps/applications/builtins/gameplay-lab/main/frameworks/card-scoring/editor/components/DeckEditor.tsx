import {
  NativeSelect,
  NativeSelectOption,
} from "design-system/components/ui/native-select";
import { Copy, Plus } from "lucide-react";
import { useState } from "react";
import {
  MAX_DECKS,
  MAX_DECK_SIZE,
  type CardModel,
  type DeckDefinition,
} from "../../../../domains/card/model";
import { amount } from "../../../../shared/turn/EffectsEditor";
import { copy, uid } from "../../../../shared/utils";

export const refillNames = {
  "after-play": "出牌后补满手牌",
  "turn-start": "自己的行动阶段开始时补满",
  none: "不自动补牌",
};
export const recycleNames = {
  "shuffle-discard": "弃牌洗回抽牌区后继续抽取",
  stop: "停止抽牌，弃牌不回收",
};

export function DeckEditor({
  model,
  deck,
  update,
}: {
  model: CardModel;
  deck: DeckDefinition;
  update(change: (model: CardModel) => void): void;
}) {
  const [error, setError] = useState("");
  const patch = (change: (deck: DeckDefinition) => void) =>
    update((model) => {
      const value = model.decks.find((value) => value.id === deck.id);
      if (value) change(value);
    });
  const unused = model.cards.filter(
    (card) => !deck.entries.some((entry) => entry.card === card.id),
  );
  const total = deck.entries.reduce((sum, entry) => sum + entry.count, 0);
  const numbers: {
    key: "handSize" | "initialDraw" | "minSelect" | "maxSelect";
    name: string;
    min: number;
  }[] = [
    { key: "handSize", name: "手牌容量", min: 1 },
    { key: "initialDraw", name: "开局抽牌数", min: 0 },
    { key: "minSelect", name: "最少出牌数", min: 1 },
    { key: "maxSelect", name: "最多出牌数", min: 1 },
  ];
  return (
    <section
      className="settings-section"
      aria-label={`牌库 ${deck.name}`}
      data-content-key={`deck:${deck.id}`}
      tabIndex={-1}
    >
      <div className="section-title">
        <h2>{deck.name || "未命名牌库"}</h2>
        <span className="muted">
          {total} / {MAX_DECK_SIZE} 张
        </span>
      </div>
      <label className="form-field">
        牌库名称
        <input
          aria-label="牌库名称"
          maxLength={300}
          value={deck.name}
          onChange={(event) =>
            patch((deck) => {
              deck.name = event.target.value;
            })
          }
        />
      </label>
      <div className="rule-grid">
        {numbers.map(({ key, name, min }) => (
          <label className="form-field" key={key}>
            {name}
            <input
              aria-label={name}
              type="number"
              min={min}
              max={10}
              value={deck[key]}
              onChange={(event) =>
                patch((deck) => {
                  deck[key] = amount(event.target.value, min, 10);
                })
              }
            />
          </label>
        ))}
      </div>
      <div className="rule-grid">
        <label className="form-field">
          补牌时机
          <NativeSelect
            aria-label="补牌时机"
            value={deck.refill}
            size="sm"
            onChange={(event) =>
              patch((deck) => {
                deck.refill = event.target.value as DeckDefinition["refill"];
              })
            }
          >
            {Object.entries(refillNames).map(([value, name]) => (
              <NativeSelectOption key={value} value={value}>
                {name}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </label>
        <label className="form-field">
          抽牌区耗尽时
          <NativeSelect
            aria-label="抽牌区耗尽时"
            value={deck.recycle}
            size="sm"
            onChange={(event) =>
              patch((deck) => {
                deck.recycle = event.target.value as DeckDefinition["recycle"];
              })
            }
          >
            {Object.entries(recycleNames).map(([value, name]) => (
              <NativeSelectOption key={value} value={value}>
                {name}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </label>
      </div>
      <p className="hint">
        开局只按“开局抽牌数”抽牌。出牌进入弃牌区；阶段开始补牌发生在该玩家下一次开始行动时。抽牌不足时保留已有手牌，少于最少出牌数时不能提交组合。
      </p>
      <h3>牌库组成</h3>
      {deck.entries.map((entry, i) => {
        const known = model.cards.some((card) => card.id === entry.card);
        return (
          <div className="deck-entry" key={i}>
            <label className="form-field">
              卡牌
              <NativeSelect
                aria-label={`牌库卡牌 ${i + 1}`}
                size="sm"
                value={entry.card}
                onChange={(event) =>
                  patch((deck) => {
                    deck.entries[i].card = event.target.value;
                  })
                }
              >
                {!known && (
                  <NativeSelectOption value={entry.card}>
                    缺失定义：{entry.card}
                  </NativeSelectOption>
                )}
                {model.cards
                  .filter(
                    (card) =>
                      card.id === entry.card ||
                      !deck.entries.some((other) => other.card === card.id),
                  )
                  .map((card) => (
                    <NativeSelectOption key={card.id} value={card.id}>
                      {card.name} · {card.group} · {card.value}
                    </NativeSelectOption>
                  ))}
              </NativeSelect>
            </label>
            <label className="form-field">
              数量
              <input
                aria-label={`牌库卡牌 ${i + 1} 数量`}
                type="number"
                min={1}
                max={100}
                value={entry.count}
                onChange={(event) =>
                  patch((deck) => {
                    deck.entries[i].count = amount(event.target.value, 1, 100);
                  })
                }
              />
            </label>
            <button
              className="text-button danger-text"
              aria-label={`移除牌库卡牌 ${i + 1}`}
              onClick={() =>
                patch((deck) => {
                  deck.entries.splice(i, 1);
                })
              }
            >
              移除
            </button>
          </div>
        );
      })}
      <button
        className="text-button"
        disabled={!unused.length}
        onClick={() =>
          patch((deck) => {
            deck.entries.push({ card: unused[0].id, count: 1 });
          })
        }
      >
        <Plus size={14} />
        添加卡牌到牌库
      </button>
      {!model.cards.length && (
        <p className="hint">先在“卡牌定义”中创建自己的卡牌。</p>
      )}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <div className="definition-actions settings-actions">
        <button
          className="button"
          disabled={model.decks.length >= MAX_DECKS}
          onClick={() =>
            update((model) => {
              model.decks.push({
                ...copy(deck),
                id: uid("deck"),
                name: `${deck.name.slice(0, 290)} 副本`,
              });
            })
          }
        >
          <Copy size={14} />
          复制牌库
        </button>
        <button
          className="text-button danger-text"
          onClick={() => {
            const refs = model.actions.filter((action) =>
              action.effects.some(
                (effect) =>
                  effect.type === "combination" &&
                  effect.collection === deck.id,
              ),
            );
            if (refs.length) {
              setError(
                `请先解除计分行动的引用：${refs.map((action) => action.name).join("、")}`,
              );
              return;
            }
            setError("");
            update((model) => {
              model.decks = model.decks.filter((value) => value.id !== deck.id);
            });
          }}
        >
          删除牌库
        </button>
      </div>
    </section>
  );
}
