import type { TavernQuickSummaryInput } from "../../../runtime/quick-summary";
import {
  runTavernQuickNovel,
  runTavernQuickSummary,
} from "../../../runtime/quick-summary";
import type { TavernMessage } from "../../../types";

export const getQuickSummarySourceMessages = (messages: TavernMessage[]) =>
  messages.filter((message) => message.status !== "streaming" && message.content.trim());

export const generateQuickSummary = (input: TavernQuickSummaryInput) =>
  runTavernQuickSummary(input);

export const generateQuickNovel = (input: TavernQuickSummaryInput) =>
  runTavernQuickNovel(input);
