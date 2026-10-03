import type { Kind, Level } from "./engine";
const names: Record<Kind, string> = {
  ginger: "年糕",
  cream: "奶油",
  slate: "灰灰",
  lilac: "芋泥",
  peach: "卷卷",
  gray: "团子",
};
function level(
  id: number,
  name: string,
  cols: number,
  rows: number,
  kinds: Kind[],
  note: string,
): Level {
  return {
    id,
    name,
    cols,
    rows,
    note,
    pieces: kinds.map((kind, i) => ({
      id: "cat-" + i,
      kind,
      name: names[kind] + (kinds.indexOf(kind) !== i ? "弟弟" : ""),
    })),
  };
}
export const LEVELS: Level[] = [
  level(
    1,
    "初来乍到",
    4,
    2,
    ["cream", "lilac", "gray"],
    "先认识三只猫，试着把它们摆进纸箱。",
  ),
  level(
    2,
    "一起午睡",
    4,
    3,
    ["ginger", "cream", "lilac", "gray"],
    "长长的年糕也想加入午睡。",
  ),
  level(
    3,
    "刚刚好",
    4,
    4,
    ["slate", "cream", "peach", "lilac", "gray"],
    "转个方向，可能就刚刚好。",
  ),
  level(
    4,
    "多挤一点",
    5,
    3,
    ["ginger", "cream", "slate", "lilac"],
    "细长的纸箱，也能睡得很舒服。",
  ),
  level(
    5,
    "转个身",
    4,
    5,
    ["cream", "ginger", "peach", "lilac", "gray", "slate"],
    "竖着的纸箱，换个角度想一想。",
  ),
  level(
    6,
    "午后纸箱",
    5,
    4,
    ["ginger", "cream", "slate", "lilac", "peach", "gray"],
    "六只猫，一箱刚刚好的午后。",
  ),
  level(
    7,
    "小小聚会",
    5,
    5,
    ["slate", "cream", "cream", "ginger", "peach", "peach", "gray"],
    "新的朋友来了，给它们留一点位置。",
  ),
  level(
    8,
    "满满当当",
    5,
    5,
    ["slate", "cream", "ginger", "peach", "peach", "lilac", "gray", "lilac"],
    "最后一箱！把所有猫猫都安顿好。",
  ),
];
