import type { State } from "../../turn/engine";
import { instanceLabel } from "../collections";
import type { CardModel } from "../model";

export function CardZones({
  model,
  state,
}: {
  model: CardModel;
  state: State;
}) {
  return (
    <section className="card-zones">
      <h2>牌区检查</h2>
      <p className="hint">
        展开查看当前快照中的实体牌。抽牌区按顶部到尾部显示，检查不会改变抽牌顺序。
      </p>
      {state.players.flatMap((player) =>
        model.decks.map((deck) => {
          const pile = player.collections[deck.id];
          const zones = [
            { name: "抽牌区", cards: [...pile.draw].reverse() },
            { name: "手牌区", cards: pile.hand },
            { name: "弃牌区", cards: pile.discard },
          ];
          return (
            <details
              key={`${player.id}:${deck.id}`}
              className="card-zone-details"
            >
              <summary>
                {player.name} · {deck.name} · 抽牌 {pile.draw.length} / 手牌{" "}
                {pile.hand.length} / 弃牌 {pile.discard.length}
              </summary>
              {zones.map((zone) => (
                <div key={zone.name}>
                  <h3>
                    {zone.name} · {zone.cards.length} 张
                  </h3>
                  {zone.cards.length ? (
                    <ol>
                      {zone.cards.map((card) => (
                        <li key={card.id}>
                          <strong>{instanceLabel(card)}</strong> · {card.group}{" "}
                          · {card.value}
                        </li>
                      ))}
                    </ol>
                  ) : (
                    <p className="hint">空</p>
                  )}
                </div>
              ))}
            </details>
          );
        }),
      )}
    </section>
  );
}
