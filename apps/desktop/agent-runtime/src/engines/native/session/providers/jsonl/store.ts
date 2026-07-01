import { randomUUID } from "node:crypto";
import { appendFile, readFile, writeFile } from "node:fs/promises";
import type {
  RuntimeLedgerEntry,
  RuntimeLedgerHeader,
  RuntimeLeafEntry,
  RuntimeMessage,
  RuntimeMessageMetadata,
  RuntimeMessageEntry,
  RuntimeRequestContextEntry,
  RuntimeInstructionEntry,
  RuntimeBranchSummaryEntry,
} from "../../model/ledger.js";

const nowIso = () => new Date().toISOString();

const createShortId = (existing: { has(id: string): boolean }) => {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const id = randomUUID().replace(/-/g, "").slice(0, 10);
    if (!existing.has(id)) {
      return id;
    }
  }

  return randomUUID();
};

const parseJsonLine = <T>(line: string, filePath: string, lineNumber: number): T => {
  try {
    return JSON.parse(line) as T;
  } catch (error: unknown) {
    throw new Error(`无法解析 runtime ledger：${filePath}:${lineNumber} ${String(error)}`);
  }
};

const isHeader = (value: unknown): value is RuntimeLedgerHeader =>
  Boolean(value) &&
  typeof value === "object" &&
  (value as { type?: unknown }).type === "runtime_session";

const leafIdAfterEntry = (entry: RuntimeLedgerEntry): string | null =>
  entry.type === "leaf" ? entry.targetId : entry.id;

export class RuntimeLedgerStorage {
  private readonly byId: Map<string, RuntimeLedgerEntry>;

  private constructor(
    readonly filePath: string,
    readonly header: RuntimeLedgerHeader,
    private readonly entries: RuntimeLedgerEntry[],
    private leafId: string | null,
  ) {
    this.byId = new Map(entries.map((entry) => [entry.id, entry]));
  }

  static async openOrCreate(input: {
    filePath: string;
    workspacePath: string;
    sessionRootDir: string;
  }): Promise<RuntimeLedgerStorage> {
    try {
      return await RuntimeLedgerStorage.open(input.filePath);
    } catch {
      const header: RuntimeLedgerHeader = {
        type: "runtime_session",
        version: 1,
        id: randomUUID(),
        timestamp: nowIso(),
        workspacePath: input.workspacePath,
        sessionRootDir: input.sessionRootDir,
      };
      await writeFile(input.filePath, `${JSON.stringify(header)}\n`, "utf8");
      return new RuntimeLedgerStorage(input.filePath, header, [], null);
    }
  }

  static async open(filePath: string): Promise<RuntimeLedgerStorage> {
    const content = await readFile(filePath, "utf8");
    const lines = content.split("\n").filter((line) => line.trim());
    const [headerLine, ...entryLines] = lines;
    if (!headerLine) {
      throw new Error(`runtime ledger 缺少 header：${filePath}`);
    }

    const header = parseJsonLine<unknown>(headerLine, filePath, 1);
    if (!isHeader(header)) {
      throw new Error(`runtime ledger header 不合法：${filePath}`);
    }

    const entries = entryLines.map((line, index) =>
      parseJsonLine<RuntimeLedgerEntry>(line, filePath, index + 2)
    );
    const leafId = entries.reduce<string | null>(
      (_current, entry) => leafIdAfterEntry(entry),
      null,
    );

    return new RuntimeLedgerStorage(filePath, header, entries, leafId);
  }

  getLeafId() {
    return this.leafId;
  }

  getEntries() {
    return [...this.entries];
  }

  getEntry(id: string) {
    return this.byId.get(id);
  }

  createEntryId() {
    return createShortId(this.byId);
  }

  async appendEntry<TEntry extends RuntimeLedgerEntry>(entry: TEntry): Promise<TEntry> {
    await appendFile(this.filePath, `${JSON.stringify(entry)}\n`, "utf8");
    this.entries.push(entry);
    this.byId.set(entry.id, entry);
    this.leafId = leafIdAfterEntry(entry);
    return entry;
  }

  async appendMessage(
    message: RuntimeMessage,
    parentId: string | null = this.leafId,
    id = this.createEntryId(),
  ): Promise<RuntimeMessageEntry> {
    return this.appendEntry({
      type: "message",
      id,
      parentId,
      timestamp: nowIso(),
      message,
    });
  }

  async appendRequestContext(
    content: string,
    metadata: RuntimeMessageMetadata | null,
    parentId: string | null = this.leafId,
  ): Promise<RuntimeRequestContextEntry> {
    return this.appendEntry({
      type: "request_context",
      id: this.createEntryId(),
      parentId,
      timestamp: nowIso(),
      content,
      metadata,
    });
  }

  async appendRuntimeInstruction(
    content: string,
    metadata: RuntimeMessageMetadata | null,
    parentId: string | null = this.leafId,
  ): Promise<RuntimeInstructionEntry> {
    return this.appendEntry({
      type: "runtime_instruction",
      id: this.createEntryId(),
      parentId,
      timestamp: nowIso(),
      content,
      metadata,
    });
  }

  async appendCustom(
    customType: string,
    data?: unknown,
    parentId: string | null = this.leafId,
  ) {
    return this.appendEntry({
      type: "custom",
      id: this.createEntryId(),
      parentId,
      timestamp: nowIso(),
      customType,
      data,
    });
  }

  async appendBranchSummary(
    fromId: string,
    summary: string,
    details?: unknown,
    parentId: string | null = null,
  ): Promise<RuntimeBranchSummaryEntry> {
    if (!this.byId.has(fromId)) {
      throw new Error(`runtime ledger compact 来源 entry 不存在：${fromId}`);
    }

    return this.appendEntry({
      type: "branch_summary",
      id: this.createEntryId(),
      parentId,
      timestamp: nowIso(),
      fromId,
      summary,
      details,
    });
  }

  async setLeafId(targetId: string | null): Promise<RuntimeLeafEntry> {
    if (targetId !== null && !this.byId.has(targetId)) {
      throw new Error(`runtime ledger entry 不存在：${targetId}`);
    }

    return this.appendEntry({
      type: "leaf",
      id: this.createEntryId(),
      parentId: this.leafId,
      timestamp: nowIso(),
      targetId,
    });
  }

  getPathToRoot(leafId: string | null = this.leafId) {
    if (leafId === null) {
      return [] satisfies RuntimeLedgerEntry[];
    }

    const path: RuntimeLedgerEntry[] = [];
    let current = this.byId.get(leafId);
    if (!current) {
      throw new Error(`runtime ledger leaf 不存在：${leafId}`);
    }

    while (current) {
      path.unshift(current);
      current = current.parentId ? this.byId.get(current.parentId) : undefined;
    }

    return path;
  }
}
