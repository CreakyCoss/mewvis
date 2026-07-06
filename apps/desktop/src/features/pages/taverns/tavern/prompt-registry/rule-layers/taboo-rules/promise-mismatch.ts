import type { TavernTabooRule } from "../types";

export const promiseMismatchTabooRule: TavernTabooRule = {
  id: "promise-mismatch",
  label: "承诺落空",
  description: "避免文名、文案、设定卖点和实际推进货不对板。",
  bridgeAddendum: "雷点规则：承诺落空。摘要保留文案承诺、设定卖点、主线目标和必须兑现的读者期待。",
  directorAddendum: "承诺落空：文名、文案和设定承诺必须持续兑现，避免只堆悬疑、只转移主线或让卖点长期失踪。",
  characterAddendum: "承诺落空：角色发言和行动要服务已建立的卖点、关系承诺或主线方向，不做无关气氛填充。",
};
