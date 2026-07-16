export const normalizeStoryTypePath = (input: string) => {
  const path = input
    .trim()
    .replace(/\\/g, "/")
    .replace(/^\/+|\/+$/g, "");
  if (!path || path.split("/").some((part) => !part || part === "." || part === "..")) {
    throw new Error(`非法故事文件路径：${input}`);
  }
  return path;
};
