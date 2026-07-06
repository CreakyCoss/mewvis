import type { TavernReplyMode } from "@/features/pages/taverns/manage/model";

export const normalizeReplyMode = (_value: unknown): TavernReplyMode => "director";
