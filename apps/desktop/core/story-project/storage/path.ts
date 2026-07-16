const DEFAULT_STORY_ROOT = "story/";

export const canonicalStoryPath = (value: string) =>
  value
    .trim()
    .replace(/\\/g, "/")
    .replace(/^\/+|\/+$/g, "");

export const normalizeStoryDocumentPath = (input: string) => {
  const path = canonicalStoryPath(input);
  const rooted = path.startsWith(DEFAULT_STORY_ROOT) ? path : `${DEFAULT_STORY_ROOT}${path}`;
  const segments = rooted.split("/");
  if (
    (!rooted.endsWith(".json") && !rooted.endsWith(".md")) ||
    segments[0] !== "story" ||
    segments.slice(1).some((segment) => !segment || segment === "." || segment === ".." || /[\0<>:"|?*]/.test(segment))
  ) {
    throw new Error("文件路径必须是 story/ 下的安全 .json 或 .md 路径。");
  }
  return rooted;
};
