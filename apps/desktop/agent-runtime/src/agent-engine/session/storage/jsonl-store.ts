import { randomUUID } from "node:crypto";
import { appendFile, readFile, writeFile } from "node:fs/promises";
import type {
  BridgeLedgerEntry,
  BridgeLedgerHeader,
  BridgeLeafEntry,
  BridgeMessage,
  BridgeMessageMetadata,
  BridgeMessageEntry,
  BridgeRequestContextEntry,
  BridgeRuntimeInstructionEntry,
} from "../core/types.js";

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

const isHeader = (value: unknown): value is BridgeLedgerHeader =>
  Boolean(value) &&
  typeof value === "object" &&
  (value as { type?: unknown }).type === "bridge_session";

const leafIdAfterEntry = (entry: BridgeLedgerEntry): string | null =>
  entry.type === "leaf" ? entry.targetId : entry.id;

export class BridgeLedgerStorage {
  private readonly byId: Map<string, BridgeLedgerEntry>;

  private constructor(
    readonly filePath: string,
    readonly header: BridgeLedgerHeader,
    private readonly entries: BridgeLedgerEntry[],
    private leafId: string | null,
  ) {
    this.byId = new Map(entries.map((entry) => [entry.id, entry]));
  }

  static async openOrCreate(input: {
    filePath: string;
    workspacePath: string;
    sessionRootDir: string;
  }): Promise<BridgeLedgerStorage> {
    try {
      return await BridgeLedgerStorage.open(input.filePath);
    } catch {
      const header: BridgeLedgerHeader = {
        type: "bridge_session",
        version: 1,
        id: randomUUID(),
        timestamp: nowIso(),
        workspacePath: input.workspacePath,
        sessionRootDir: input.sessionRootDir,
      };
      await writeFile(input.filePath, `${JSON.stringify(header)}\n`, "utf8");
      return new BridgeLedgerStorage(input.filePath, header, [], null);
    }
  }

  static async open(filePath: string): Promise<BridgeLedgerStorage> {
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
      parseJsonLine<BridgeLedgerEntry>(line, filePath, index + 2)
    );
    const leafId = entries.reduce<string | null>(
      (_current, entry) => leafIdAfterEntry(entry),
      null,
    );

    return new BridgeLedgerStorage(filePath, header, entries, leafId);
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

  async appendEntry<TEntry extends BridgeLedgerEntry>(entry: TEntry): Promise<TEntry> {
    await appendFile(this.filePath, `${JSON.stringify(entry)}\n`, "utf8");
    this.entries.push(entry);
    this.byId.set(entry.id, entry);
    this.leafId = leafIdAfterEntry(entry);
    return entry;
  }

  async appendMessage(
    message: BridgeMessage,
    parentId: string | null = this.leafId,
    id = this.createEntryId(),
  ): Promise<BridgeMessageEntry> {
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
    metadata: BridgeMessageMetadata | null,
    parentId: string | null = this.leafId,
  ): Promise<BridgeRequestContextEntry> {
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
    metadata: BridgeMessageMetadata | null,
    parentId: string | null = this.leafId,
  ): Promise<BridgeRuntimeInstructionEntry> {
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

  async setLeafId(targetId: string | null): Promise<BridgeLeafEntry> {
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
      return [] satisfies BridgeLedgerEntry[];
    }

    const path: BridgeLedgerEntry[] = [];
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
