import type { TavernProgressVisibility } from "@/features/pages/taverns/manage/model";

export const isTavernProgressVisibilityVisibleToUser = (visibility?: TavernProgressVisibility | string | null) =>
  visibility !== "hidden" && visibility !== "debug" && visibility !== "director";
