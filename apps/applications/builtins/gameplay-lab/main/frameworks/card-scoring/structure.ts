import {
  blankCardModel,
  newDeck,
  type CardModel,
} from "../../domains/card/model";
import { uid } from "../../shared/utils";

export function scoringRules(model: CardModel) {
  return model.actions.flatMap((action) => {
    const effect = action.effects.find(
      (effect) => effect.type === "combination",
    );
    return effect
      ? [
          {
            action,
            effect,
            deck: model.decks.find((deck) => deck.id === effect.collection),
          },
        ]
      : [];
  });
}
/** Framework structure is created deliberately; no sample cards or player content is inserted. */
export function addScoringStructure(model: CardModel) {
  if (scoringRules(model).length) throw new Error("项目已有组合计分规则。");
  if (
    model.fields.length >= 80 ||
    model.actions.length >= 80 ||
    model.goals.length >= 80
  )
    throw new Error("定义数量已达上限，无法添加计分结构。");
  const deck = model.decks[0] ?? { ...newDeck(), name: "主牌库" };
  if (!model.decks.length) model.decks.push(deck);
  const score = uid("score");
  model.fields.push({
    id: score,
    name: "累计得分",
    description: "本局通过提交组合获得的分数",
    initial: 0,
    role: "progress",
  });
  model.actions.push({
    id: uid("play"),
    name: "提交组合",
    description: "选择手牌组合并结算得分。",
    costs: [],
    requires: [],
    effects: [
      {
        type: "combination",
        collection: deck.id,
        field: score,
        multiplierValue: 1,
        pairBonus: 15,
      },
    ],
  });
  model.goals.push({
    id: uid("goal"),
    name: "目标得分",
    description: "达到分数后完成本局",
    field: score,
    threshold: 100,
  });
}
export function createCardScoringModel(name: string): CardModel {
  const model = blankCardModel(name);
  addScoringStructure(model);
  return model;
}
