import { uid } from "../../shared/utils";
export type BoardTileType = "start" | "property" | "rest";
export interface BoardTile {
  id: string;
  name: string;
  type: BoardTileType;
  price: number;
  rent: number;
}
export interface BoardModel {
  format: "gameplay-board-economy-v1";
  id: string;
  name: string;
  description: string;
  tiles: BoardTile[];
  rules: {
    players: [string, string];
    initialCash: number;
    salary: number;
    diceSides: number;
    maxTurns: number;
  };
}
export function createBoardModel(name: string): BoardModel {
  return {
    format: "gameplay-board-economy-v1",
    id: uid("board"),
    name,
    description: "",
    tiles: [],
    rules: {
      players: ["玩家 1", "玩家 2"],
      initialCash: 100,
      salary: 20,
      diceSides: 6,
      maxTurns: 100,
    },
  };
}
export const newBoardTile = (first = false): BoardTile => ({
  id: uid("tile"),
  name: first ? "起点" : "新地块",
  type: first ? "start" : "property",
  price: first ? 0 : 20,
  rent: first ? 0 : 5,
});
export const boardTileNames: Record<BoardTileType, string> = {
  start: "起点",
  property: "地产",
  rest: "休息地",
};
