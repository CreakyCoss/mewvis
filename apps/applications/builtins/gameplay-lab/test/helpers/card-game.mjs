import { f } from "./domain.mjs";

export function cardGame() {
  const model = f.blankCardModel("流光牌局");
  model.fields.push({
    id: "score",
    name: "得分",
    description: "",
    initial: 0,
    role: "progress",
  });
  model.cards.push(
    { id: "sun", name: "晨光", description: "暖色牌", group: "warm", value: 2 },
    {
      id: "moon",
      name: "月色",
      description: "冷色牌",
      group: "cool",
      value: 4,
    },
  );
  model.decks.push({
    id: "deck",
    name: "星空牌库",
    entries: [
      { card: "sun", count: 3 },
      { card: "moon", count: 3 },
    ],
    handSize: 2,
    initialDraw: 2,
    minSelect: 1,
    maxSelect: 2,
    refill: "after-play",
    recycle: "shuffle-discard",
  });
  model.actions.push({
    id: "play",
    name: "提交星光",
    description: "",
    costs: [],
    requires: [],
    effects: [
      {
        type: "combination",
        collection: "deck",
        field: "score",
        multiplierValue: 1,
        pairBonus: 0,
      },
    ],
  });
  model.goals.push({
    id: "finish",
    name: "目标",
    description: "",
    field: "score",
    threshold: 1000,
  });
  model.flow.maxRounds = 4;
  return model;
}
