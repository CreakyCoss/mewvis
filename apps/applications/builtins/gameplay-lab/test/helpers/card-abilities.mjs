import { f } from "./domain.mjs";

export function abilityGame(
  m = f.createFrameworkModel("card-scoring", "自定能力", "base-scoring"),
) {
  m.cards = [
    { id: "a", name: "甲", description: "", group: "同组", value: 2 },
    { id: "b", name: "乙", description: "", group: "异组", value: 7 },
  ];
  Object.assign(m.decks[0], {
    entries: [
      { card: "a", count: 4 },
      { card: "b", count: 4 },
    ],
    handSize: 5,
    initialDraw: 3,
    minSelect: 1,
    maxSelect: 3,
    refill: "none",
    recycle: "stop",
  });
  m.fields.push({
    id: "energy",
    name: "能量",
    description: "",
    initial: 4,
    role: "stock",
  });
  m.goals[0].threshold = 10000;
  f.setCardScoringModuleEnabled(m, "card-abilities", true);
  const exchange = m.extensions["card-abilities"].abilities[0];
  Object.assign(exchange, {
    id: "exchange",
    uses: 3,
    cost: { field: "energy", amount: 2 },
  });
  const focus = { ...f.newCardAbility("focus", m), id: "focus" };
  m.extensions["card-abilities"].abilities.push(focus);
  return m;
}
