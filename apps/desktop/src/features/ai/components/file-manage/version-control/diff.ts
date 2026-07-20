import type { WorkspaceVersionFileDiff } from "@/api/workspace-files";
import type { SideBySideDiffRow } from "./types";

const parseUnifiedDiff = (patch: string): SideBySideDiffRow[] => {
  const rows: SideBySideDiffRow[] = [];
  const removedLines: Array<{ line: number; text: string }> = [];
  const addedLines: Array<{ line: number; text: string }> = [];
  let oldLine = 0;
  let newLine = 0;
  let isInsideHunk = false;

  const flushChangedLines = () => {
    const pairedCount = Math.min(removedLines.length, addedLines.length);
    for (let index = 0; index < pairedCount; index += 1) {
      rows.push({
        kind: "changed",
        oldLine: removedLines[index].line,
        newLine: addedLines[index].line,
        oldText: removedLines[index].text,
        newText: addedLines[index].text,
      });
    }

    for (let index = pairedCount; index < removedLines.length; index += 1) {
      rows.push({
        kind: "removed",
        oldLine: removedLines[index].line,
        newLine: null,
        oldText: removedLines[index].text,
        newText: "",
      });
    }

    for (let index = pairedCount; index < addedLines.length; index += 1) {
      rows.push({
        kind: "added",
        oldLine: null,
        newLine: addedLines[index].line,
        oldText: "",
        newText: addedLines[index].text,
      });
    }

    removedLines.length = 0;
    addedLines.length = 0;
  };

  for (const line of patch.replace(/\n$/, "").split("\n")) {
    const hunkMatch = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@(.*)$/.exec(line);
    if (hunkMatch) {
      flushChangedLines();
      oldLine = Number(hunkMatch[1]);
      newLine = Number(hunkMatch[2]);
      isInsideHunk = true;
      rows.push({ kind: "hunk", text: line });
      continue;
    }

    if (!isInsideHunk) {
      if (
        line.startsWith("Binary files ") ||
        line.startsWith("new file mode ") ||
        line.startsWith("deleted file mode ")
      ) {
        rows.push({ kind: "meta", text: line });
      }
      continue;
    }

    if (line.startsWith("\\ No newline")) {
      continue;
    }

    if (line.startsWith("-") && !line.startsWith("---")) {
      removedLines.push({ line: oldLine, text: line.slice(1) });
      oldLine += 1;
      continue;
    }

    if (line.startsWith("+") && !line.startsWith("+++")) {
      addedLines.push({ line: newLine, text: line.slice(1) });
      newLine += 1;
      continue;
    }

    if (line.startsWith(" ")) {
      flushChangedLines();
      const text = line.slice(1);
      rows.push({
        kind: "context",
        oldLine,
        newLine,
        oldText: text,
        newText: text,
      });
      oldLine += 1;
      newLine += 1;
    }
  }

  flushChangedLines();
  return rows;
};

const splitDiffContentLines = (content: string) => {
  if (!content) {
    return [];
  }

  const normalized = content.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const lines = normalized.split("\n");
  if (normalized.endsWith("\n")) {
    lines.pop();
  }
  return lines;
};

const compactChangedRows = (
  rows: Array<
    | {
        kind: "context";
        oldLine: number;
        newLine: number;
        text: string;
      }
    | {
        kind: "removed";
        oldLine: number;
        text: string;
      }
    | {
        kind: "added";
        newLine: number;
        text: string;
      }
  >,
): SideBySideDiffRow[] => {
  const compactRows: SideBySideDiffRow[] = [];
  let removedLines: Array<{ line: number; text: string }> = [];
  let addedLines: Array<{ line: number; text: string }> = [];

  const flush = () => {
    const pairedCount = Math.min(removedLines.length, addedLines.length);
    for (let index = 0; index < pairedCount; index += 1) {
      compactRows.push({
        kind: "changed",
        oldLine: removedLines[index].line,
        newLine: addedLines[index].line,
        oldText: removedLines[index].text,
        newText: addedLines[index].text,
      });
    }
    for (let index = pairedCount; index < removedLines.length; index += 1) {
      compactRows.push({
        kind: "removed",
        oldLine: removedLines[index].line,
        newLine: null,
        oldText: removedLines[index].text,
        newText: "",
      });
    }
    for (let index = pairedCount; index < addedLines.length; index += 1) {
      compactRows.push({
        kind: "added",
        oldLine: null,
        newLine: addedLines[index].line,
        oldText: "",
        newText: addedLines[index].text,
      });
    }
    removedLines = [];
    addedLines = [];
  };

  for (const row of rows) {
    if (row.kind === "context") {
      flush();
      compactRows.push({
        kind: "context",
        oldLine: row.oldLine,
        newLine: row.newLine,
        oldText: row.text,
        newText: row.text,
      });
    } else if (row.kind === "removed") {
      removedLines.push({ line: row.oldLine, text: row.text });
    } else {
      addedLines.push({ line: row.newLine, text: row.text });
    }
  }

  flush();
  return compactRows;
};

const buildFullContentDiff = (beforeContent: string, afterContent: string): SideBySideDiffRow[] => {
  const beforeLines = splitDiffContentLines(beforeContent);
  const afterLines = splitDiffContentLines(afterContent);
  const rowCountProduct = beforeLines.length * afterLines.length;

  if (beforeLines.length === 0 && afterLines.length === 0) {
    return [];
  }

  if (rowCountProduct > 2_000_000) {
    return compactChangedRows([
      ...beforeLines.map((text, index) => ({
        kind: "removed" as const,
        oldLine: index + 1,
        text,
      })),
      ...afterLines.map((text, index) => ({
        kind: "added" as const,
        newLine: index + 1,
        text,
      })),
    ]);
  }

  const columnCount = afterLines.length + 1;
  const table = new Uint32Array((beforeLines.length + 1) * columnCount);
  const at = (beforeIndex: number, afterIndex: number) => beforeIndex * columnCount + afterIndex;

  for (let beforeIndex = beforeLines.length - 1; beforeIndex >= 0; beforeIndex -= 1) {
    for (let afterIndex = afterLines.length - 1; afterIndex >= 0; afterIndex -= 1) {
      table[at(beforeIndex, afterIndex)] =
        beforeLines[beforeIndex] === afterLines[afterIndex]
          ? table[at(beforeIndex + 1, afterIndex + 1)] + 1
          : Math.max(table[at(beforeIndex + 1, afterIndex)], table[at(beforeIndex, afterIndex + 1)]);
    }
  }

  const rawRows: Parameters<typeof compactChangedRows>[0] = [];
  let beforeIndex = 0;
  let afterIndex = 0;

  while (beforeIndex < beforeLines.length || afterIndex < afterLines.length) {
    if (
      beforeIndex < beforeLines.length &&
      afterIndex < afterLines.length &&
      beforeLines[beforeIndex] === afterLines[afterIndex]
    ) {
      rawRows.push({
        kind: "context",
        oldLine: beforeIndex + 1,
        newLine: afterIndex + 1,
        text: beforeLines[beforeIndex],
      });
      beforeIndex += 1;
      afterIndex += 1;
    } else if (
      beforeIndex < beforeLines.length &&
      (afterIndex >= afterLines.length ||
        table[at(beforeIndex + 1, afterIndex)] >= table[at(beforeIndex, afterIndex + 1)])
    ) {
      rawRows.push({
        kind: "removed",
        oldLine: beforeIndex + 1,
        text: beforeLines[beforeIndex],
      });
      beforeIndex += 1;
    } else if (afterIndex < afterLines.length) {
      rawRows.push({
        kind: "added",
        newLine: afterIndex + 1,
        text: afterLines[afterIndex],
      });
      afterIndex += 1;
    }
  }

  return compactChangedRows(rawRows);
};

export const buildSideBySideDiffRows = (diff: WorkspaceVersionFileDiff | null): SideBySideDiffRow[] => {
  if (typeof diff?.beforeContent === "string" || typeof diff?.afterContent === "string") {
    return buildFullContentDiff(diff?.beforeContent ?? "", diff?.afterContent ?? "");
  }
  return parseUnifiedDiff(diff?.patch ?? "");
};

export const getDiffChangeRowIndexes = (rows: SideBySideDiffRow[]) =>
  rows.reduce<number[]>((indexes, row, index) => {
    if (!("text" in row) && row.kind !== "context") {
      indexes.push(index);
    }
    return indexes;
  }, []);
