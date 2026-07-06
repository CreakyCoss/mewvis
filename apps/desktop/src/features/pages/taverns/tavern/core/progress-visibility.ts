import type { TavernProgressVisibility } from "../types";

export const isTavernProgressVisibilityVisibleToUser = (
  visibility?: TavernProgressVisibility | string | null,
) => visibility !== "hidden" && visibility !== "debug" && visibility !== "director";
