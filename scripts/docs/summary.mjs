export function parseSummary(source) {
  const entries = [];
  let group = "文档导航";
  for (const line of source.split("\n")) {
    const heading = /^## (.+)$/.exec(line);
    if (heading) group = heading[1].trim();
    const item = /^( *)- \[([^\]]+)\]\(([^)]+\.md)\)\s*$/.exec(line);
    if (!item) continue;
    if (item[1].length % 2) throw new Error(`目录缩进必须为两个空格：${line}`);
    const depth = item[1].length / 2;
    const previous = entries.at(-1);
    if (
      depth &&
      (!previous || previous.group !== group || depth > previous.depth + 1)
    )
      throw new Error(`目录层级缺少父页面：${line}`);
    if (entries.some((entry) => entry.id === item[3]))
      throw new Error(`重复目录：${item[3]}`);
    if (item[3].startsWith("/") || item[3].split("/").includes(".."))
      throw new Error(`目录越界：${item[3]}`);
    entries.push({ id: item[3], title: item[2], group, depth });
  }
  if (!entries.length) throw new Error("文档目录为空");
  return entries;
}
