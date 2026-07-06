export type SceneNovelParagraphStats = {
  paragraphCount: number;
  charCount: number;
  averageParagraphChars: number;
  maxParagraphChars: number;
  overlongParagraphCount: number;
};

export const countReadableChars = (text: string) => text.replace(/\s/g, "").length;

export const splitSceneNovelParagraphs = (text: string) =>
  text
    .split(/\n{1,}/)
    .map((line) => line.trim())
    .filter(Boolean);

export const getSceneNovelParagraphStats = (text: string, paragraphMaxChars = 180): SceneNovelParagraphStats => {
  const paragraphs = splitSceneNovelParagraphs(text);
  const lengths = paragraphs.map(countReadableChars);
  const charCount = lengths.reduce((sum, value) => sum + value, 0);

  return {
    paragraphCount: paragraphs.length,
    charCount,
    averageParagraphChars: lengths.length > 0 ? Math.round(charCount / lengths.length) : 0,
    maxParagraphChars: lengths.length > 0 ? Math.max(...lengths) : 0,
    overlongParagraphCount: lengths.filter((value) => value > paragraphMaxChars).length,
  };
};
