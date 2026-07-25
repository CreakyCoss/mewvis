import type { Ref } from "react";
import type { RuntimeModelInput } from "@/agent-client/types";

export type {
  CreateLedgerInput,
  LedgerAuxiliaryEntry,
  LedgerDisplaySummary,
  LedgerMessage,
  LedgerMessageInput,
  LedgerResult,
  LedgerRuntimeLink,
} from "@/api/conversation-ledger";

export type ConversationLedgerHandle = {
  refresh: () => Promise<void>;
  refreshSummary: () => Promise<void>;
};

export type ConversationLedgerProps = {
  bind?: Ref<ConversationLedgerHandle>;
  workspacePath: string;
  chatId: string | null;
  runtimeModel?: RuntimeModelInput | null;
  summaryInstruction?: string | null;
};
