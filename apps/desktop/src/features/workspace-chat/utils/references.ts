import type { ActiveReferenceToken, FileReferenceMatch, ResolvedFileReference } from "../page-types";
import type { WorkspaceFileEntry } from "../types";

export const quoteReferencePath = (path: string) =>
  /[\s，。；,;]/.test(path) ? `@"${path}"` : `@${path}`;

export const getActiveReferenceToken = (
  text: string,
  cursor: number,
): ActiveReferenceToken | null => {
  const beforeCursor = text.slice(0, cursor);
  const atIndex = beforeCursor.lastIndexOf("@");

  if (atIndex < 0) {
    return null;
  }

  const tokenPrefix = beforeCursor.slice(atIndex + 1);
  if (/[\s，。；,;]/.test(tokenPrefix)) {
    return null;
  }

  const previousChar = atIndex > 0 ? text[atIndex - 1] : "";
  if (previousChar && !/[\s([{，。；,;]/.test(previousChar)) {
    return null;
  }

  const afterCursor = text.slice(cursor);
  const suffixMatch = afterCursor.match(/^[^\s，。；,;]*/);
  const suffix = suffixMatch?.[0] ?? "";

  return {
    start: atIndex,
    end: cursor + suffix.length,
    query: `${tokenPrefix}${suffix}`.trim(),
  };
};

const extractFileReferenceTokens = (text: string) => {
  const tokens = new Set<string>();
  const matcher = /@(?:"([^"]+)"|'([^']+)'|([^\s，。；；,;]+))/g;
  let match: RegExpExecArray | null;

  while ((match = matcher.exec(text))) {
    const token = (match[1] ?? match[2] ?? match[3] ?? "").trim();
    if (token) {
      tokens.add(token);
    }
  }

  return [...tokens];
};

export const resolveFileReferenceMatches = (
  text: string,
  files: WorkspaceFileEntry[],
): FileReferenceMatch[] => {
  const selectable = files.filter((file) => !file.isDirectory);

  return extractFileReferenceTokens(text).map((token) => {
    const normalizedToken = token.toLowerCase();
    const exactMatches = selectable.filter((file) => {
      const path = file.path.toLowerCase();
      const name = file.name.toLowerCase();
      return path === normalizedToken || name === normalizedToken;
    });

    if (exactMatches.length > 0) {
      return { token, matches: exactMatches };
    }

    return {
      token,
      matches: selectable.filter((file) => {
        const path = file.path.toLowerCase();
        const name = file.name.toLowerCase();
        return path.includes(normalizedToken) || name.includes(normalizedToken);
      }),
    };
  });
};

export const summarizeReferenceMatches = (matches: FileReferenceMatch[]) => {
  const resolved = matches.flatMap((match) =>
    match.matches.length === 1 ? [match.matches[0]] : [],
  );

  const uniquePaths = new Set<string>();
  return resolved.filter((file) => {
    if (uniquePaths.has(file.path)) {
      return false;
    }
    uniquePaths.add(file.path);
    return true;
  });
};

export const appendReferencesToPrompt = (
  text: string,
  references: ResolvedFileReference[],
) => {
  if (references.length === 0) {
    return text;
  }

  return [
    text,
    "",
    "用户在消息中引用了以下文件，请优先使用这些文件作为上下文：",
    references
      .map((file) => [
        `## ${file.path}`,
        "```",
        file.content.slice(0, 20000),
        "```",
      ].join("\n"))
      .join("\n\n"),
  ].join("\n");
};
