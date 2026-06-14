import { Tiktoken } from "js-tiktoken/lite";
import o200kBase from "js-tiktoken/ranks/o200k_base";
import type {
  ConversationMessage,
} from "../protocol/context";
import type {
  TokenBudgetModel,
} from "../protocol/session";

const encoder = new Tiktoken(o200kBase);

export const DEFAULT_CONTEXT_WINDOW_TOKENS = 200000;
export const DEFAULT_CONVERSATION_TOKEN_BUDGET = 64000;
export const SUMMARY_TRIGGER_RATIO = 0.85;
export const SUMMARY_TARGET_RATIO = 0.65;

export type { TokenBudgetModel } from "../protocol/session";

const normalizeContextWindow = (value: number | null | undefined) =>
  typeof value === "number" && Number.isFinite(value) && value > 0
    ? Math.floor(value)
    : null;

export const resolveAppContextWindow = (
  model?: TokenBudgetModel,
) => {
  const modelContextWindow = normalizeContextWindow(model?.contextWindow);
  return modelContextWindow ?? DEFAULT_CONTEXT_WINDOW_TOKENS;
};

export const countTextTokens = (text: string) => encoder.encode(text).length;

export const countConversationMessageTokens = (message: ConversationMessage) =>
  // Include a small role/metadata overhead so the budget tracks chat payloads more closely.
  countTextTokens(`${message.role}\n${message.content}`) + 4;

export const countConversationTokens = (messages: ConversationMessage[]) =>
  messages.reduce((total, message) => total + countConversationMessageTokens(message), 0);

export const createConversationTokenBudget = (
  model?: TokenBudgetModel,
) => {
  const contextWindow = model?.contextWindow ?? DEFAULT_CONTEXT_WINDOW_TOKENS;
  const maxTokens = model?.maxTokens ?? 4096;
  const reservedTokens = Math.min(
    Math.max(maxTokens + 4096, 8192),
    Math.max(8192, Math.floor(contextWindow * 0.45)),
  );
  const usableTokens = Math.max(4096, contextWindow - reservedTokens);

  return Math.max(4096, Math.floor(usableTokens * 0.5));
};

export const findConversationTailStartByTokenBudget = (
  messages: ConversationMessage[],
  tokenBudget: number,
) => {
  let tokens = 0;

  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const nextTokens = countConversationMessageTokens(messages[index]);
    if (tokens > 0 && tokens + nextTokens > tokenBudget) {
      return index + 1;
    }
    tokens += nextTokens;
  }

  return 0;
};
