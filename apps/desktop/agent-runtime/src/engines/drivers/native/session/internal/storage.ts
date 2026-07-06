import type {
  RuntimeBranchSummaryEntry,
  RuntimeCustomEntry,
  RuntimeInstructionEntry,
  RuntimeLedgerEntry,
  RuntimeLedgerHeader,
  RuntimeLeafEntry,
  RuntimeMessage,
  RuntimeMessageEntry,
  RuntimeMessageMetadata,
  RuntimeRequestContextEntry,
} from "../model/ledger.js";
import type { RuntimeSessionPathInput, RuntimeSessionPaths, RuntimeSessionTraceRecord } from "../providers/types.js";

export type RuntimeSessionStore = {
  readonly header: RuntimeLedgerHeader;
  getLeafId(): string | null;
  getEntries(): RuntimeLedgerEntry[];
  getEntry(id: string): RuntimeLedgerEntry | undefined;
  createEntryId(): string;
  appendMessage(message: RuntimeMessage, parentId?: string | null, id?: string): Promise<RuntimeMessageEntry>;
  appendRequestContext(
    content: string,
    metadata: RuntimeMessageMetadata | null,
    parentId?: string | null,
  ): Promise<RuntimeRequestContextEntry>;
  appendRuntimeInstruction(
    content: string,
    metadata: RuntimeMessageMetadata | null,
    parentId?: string | null,
  ): Promise<RuntimeInstructionEntry>;
  appendCustom(customType: string, data?: unknown, parentId?: string | null): Promise<RuntimeCustomEntry>;
  appendBranchSummary(
    fromId: string,
    summary: string,
    details?: unknown,
    parentId?: string | null,
  ): Promise<RuntimeBranchSummaryEntry>;
  setLeafId(targetId: string | null): Promise<RuntimeLeafEntry>;
  getPathToRoot(leafId?: string | null): RuntimeLedgerEntry[];
};

export type RuntimeSessionHandle = {
  paths: RuntimeSessionPaths;
  storage: RuntimeSessionStore;
  appendTrace<TRecord extends RuntimeSessionTraceRecord>(record: TRecord): Promise<TRecord>;
  refreshManifest(): Promise<void>;
};

export type RuntimeSessionStorageProvider = {
  resolvePaths(input: RuntimeSessionPathInput): Promise<RuntimeSessionPaths>;
  openOrCreate(input: RuntimeSessionPathInput): Promise<RuntimeSessionHandle>;
};
