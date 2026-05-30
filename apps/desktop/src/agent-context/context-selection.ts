const DEFAULT_CHUNK_CHARS = 1600;
const MAX_QUERY_TERMS = 80;

type ScoredChunk = {
  index: number;
  text: string;
  score: number;
};

const escapeRegExp = (value: string) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const countOccurrences = (text: string, term: string) => {
  if (!term) {
    return 0;
  }

  const matcher = new RegExp(escapeRegExp(term), "g");
  return text.match(matcher)?.length ?? 0;
};

const extractQueryTerms = (query: string) => {
  const terms = new Set<string>();
  const normalized = query.toLowerCase();
  const tokenMatches = normalized.match(/[\p{L}\p{N}_-]+/gu) ?? [];

  tokenMatches.forEach((token) => {
    const trimmed = token.trim();
    if (trimmed.length >= 2 && trimmed.length <= 64) {
      terms.add(trimmed);
    }

    const cjkChars = [...trimmed].filter((char) => /[\u4e00-\u9fff]/.test(char));
    cjkChars.forEach((char) => terms.add(char));
    for (let index = 0; index < cjkChars.length - 1; index += 1) {
      terms.add(`${cjkChars[index]}${cjkChars[index + 1]}`);
    }
  });

  return [...terms].slice(0, MAX_QUERY_TERMS);
};

const splitIntoChunks = (text: string, chunkChars = DEFAULT_CHUNK_CHARS) => {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const chunks: string[] = [];
  let current: string[] = [];
  let currentLength = 0;

  const flush = () => {
    if (current.length === 0) {
      return;
    }
    chunks.push(current.join("\n").trim());
    current = [];
    currentLength = 0;
  };

  lines.forEach((line) => {
    if (line.length > chunkChars) {
      flush();
      for (let index = 0; index < line.length; index += chunkChars) {
        chunks.push(line.slice(index, index + chunkChars));
      }
      return;
    }

    if (currentLength + line.length + 1 > chunkChars) {
      flush();
    }

    current.push(line);
    currentLength += line.length + 1;
  });

  flush();
  return chunks.filter(Boolean);
};

const takeHead = (text: string, maxChars: number) =>
  `${text.slice(0, Math.max(0, maxChars))}\n\n[内容已按上下文预算截断]`;

export const selectRelevantText = (
  text: string,
  query: string | undefined,
  maxChars: number,
) => {
  if (text.length <= maxChars) {
    return text;
  }

  const terms = extractQueryTerms(query ?? "");
  if (terms.length === 0) {
    return takeHead(text, maxChars);
  }

  const scoredChunks: ScoredChunk[] = splitIntoChunks(text).map((chunk, index) => {
    const lowerChunk = chunk.toLowerCase();
    const score = terms.reduce((total, term) => {
      const weight = term.length === 1 ? 0.25 : Math.min(term.length, 12);
      return total + countOccurrences(lowerChunk, term) * weight;
    }, index === 0 ? 0.15 : 0);

    return {
      index,
      text: chunk,
      score,
    };
  });

  const relevantChunks = scoredChunks
    .filter((chunk) => chunk.score > 0)
    .sort((left, right) => right.score - left.score || left.index - right.index);

  if (relevantChunks.length === 0) {
    return takeHead(text, maxChars);
  }

  const selected: ScoredChunk[] = [];
  let remainingChars = Math.max(0, maxChars - 80);
  for (const chunk of relevantChunks) {
    if (remainingChars <= 0) {
      break;
    }

    const clippedText = chunk.text.length > remainingChars
      ? `${chunk.text.slice(0, remainingChars)}\n[片段已按上下文预算截断]`
      : chunk.text;
    selected.push({ ...chunk, text: clippedText });
    remainingChars -= clippedText.length + 40;
  }

  return [
    "[已选择与当前请求最相关的片段，省略其余内容]",
    ...selected
      .sort((left, right) => left.index - right.index)
      .map((chunk) => `\n[片段 ${chunk.index + 1}]\n${chunk.text}`),
  ].join("\n").slice(0, maxChars);
};
