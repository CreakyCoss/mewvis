export const MODEL_FILE = "models/core.json";
export const normalize = (path: string) => {
  const root = path.replaceAll("\\", "/").replace(/\/+$/, "");
  return /^[a-z]:$/i.test(root) ? `${root}/` : root || "/";
};
export const projectFile = (path: string) =>
  `${normalize(path).replace(/\/$/, "")}/${MODEL_FILE}`;
export function projectDirectory(parent: string, name: string) {
  const root = normalize(parent.trim());
  if (!parent.trim() || !/^(\/|[a-z]:\/)/i.test(root))
    throw new Error("请选择项目父目录，或输入完整的绝对路径。");
  const leaf = name
    .replace(/[\x00-\x1f\x7f/\\:*?"<>|]+/g, "-")
    .replace(/^[. -]+|[. -]+$/g, "")
    .trim();
  if (!leaf) throw new Error("项目名称不能用作文件夹名称。");
  return `${root.replace(/\/$/, "")}/${leaf}`;
}
