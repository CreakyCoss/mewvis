import { f } from "./domain.mjs";
export function boardGame(model = f.createBoardModel("港湾棋局")) {
  model.tiles = [
    { id: "start", name: "港口", type: "start", price: 0, rent: 0 },
    { id: "dock", name: "码头", type: "property", price: 5, rent: 30 },
    { id: "market", name: "市场", type: "property", price: 5, rent: 30 },
    { id: "park", name: "广场", type: "rest", price: 0, rent: 0 },
  ];
  Object.assign(model.rules, {
    initialCash: 20,
    salary: 0,
    diceSides: 2,
    maxTurns: 20,
  });
  return model;
}
