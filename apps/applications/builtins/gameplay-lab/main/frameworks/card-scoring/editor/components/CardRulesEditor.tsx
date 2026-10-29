import { Plus } from "lucide-react";
import {
  MAX_DECKS,
  newDeck,
  type CardModel,
} from "../../../../domains/card/model";
import { validateCardModel } from "../../../../domains/card/validation";
import { FlowEditor } from "../../../../shared/turn/FlowEditor";
import { CardLibraryEditor } from "./CardLibraryEditor";
import { DeckEditor } from "./DeckEditor";

export function CardRulesEditor({
  model,
  update,
}: {
  model: CardModel;
  update(change: (model: CardModel) => void): void;
}) {
  const issues = validateCardModel(model);
  return (
    <section className="page-content rules-page">
      <div className="page-heading">
        <div>
          <h1>卡牌与回合</h1>
          <p>先定义卡牌，再用数量构建牌库；设置手牌、出牌与抽补牌规则。</p>
        </div>
      </div>
      <CardLibraryEditor model={model} update={update} />
      <div className="section-title section-gap">
        <h2>牌库与抽牌</h2>
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
        <p className="hint">
          添加牌库后，将卡牌定义加入其中并设置数量。计分行动通过牌库引用执行选牌。
        </p>
      )}
      {model.decks.map((deck) => (
        <DeckEditor key={deck.id} model={model} deck={deck} update={update} />
      ))}
      <FlowEditor
        model={model}
        update={(change) => update((model) => change(model))}
      />
      {!!issues.length && (
        <div className="validation-errors" role="alert">
          {issues.slice(0, 12).map((issue, i) => (
            <p key={i}>
              {issue.path}：{issue.message}
            </p>
          ))}
        </div>
      )}
    </section>
  );
}
