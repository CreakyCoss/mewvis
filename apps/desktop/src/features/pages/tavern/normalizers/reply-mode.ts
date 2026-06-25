import type {
  TavernReplyMode,
} from "../types";

export const normalizeReplyMode = (value: unknown): TavernReplyMode =>
  value === "round" || value === "director" ? value : "active";
