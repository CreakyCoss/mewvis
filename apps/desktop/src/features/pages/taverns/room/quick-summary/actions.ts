import type { TavernQuickSummaryInput } from "@/features/pages/taverns/tavern/runtime/assistants";
import {
  runTavernQuickNovel,
  runTavernQuickSummary,
} from "@/features/pages/taverns/tavern/runtime/assistants";
import type { TavernMessage } from "@/features/pages/taverns/tavern/types";

export const getQuickSummarySourceMessages = (messages: TavernMessage[]) =>
  messages.filter((message) => message.status !== "streaming" && message.content.trim());

export const generateQuickSummary = (input: TavernQuickSummaryInput) =>
  runTavernQuickSummary(input);

export const generateQuickNovel = (input: TavernQuickSummaryInput) =>
  runTavernQuickNovel(input);
