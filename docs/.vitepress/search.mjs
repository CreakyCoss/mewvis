export function tokenizeDocumentText(text) {
  return [...new Intl.Segmenter("zh-CN", { granularity: "word" }).segment(text)]
    .filter((segment) => segment.isWordLike)
    .map((segment) => segment.segment);
}
