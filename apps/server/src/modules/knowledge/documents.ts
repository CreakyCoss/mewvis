import * as fs from "node:fs/promises";
import { join, basename, extname, relative } from "node:path";
import { invalid } from "../../shared/validation.js";
const supported = (p: string) =>
  [
    ".txt",
    ".md",
    ".markdown",
    ".json",
    ".csv",
    ".ts",
    ".tsx",
    ".js",
    ".jsx",
    ".rs",
    ".toml",
    ".yaml",
    ".yml",
  ].includes(extname(p).toLowerCase());
export async function discover(path: string): Promise<any[]> {
  const results: any[] = [];
  let visited = 0;
  async function walk(p: string) {
    if (++visited > 100000) invalid("知识源文件数量超过限制");
    const s = await fs.lstat(p);
    if (s.isSymbolicLink()) return;
    if (s.isDirectory()) {
      for (const entry of await fs.readdir(p, { withFileTypes: true }))
        if (
          !entry.name.startsWith(".") &&
          !["node_modules", "dist", "build"].includes(entry.name)
        )
          await walk(join(p, entry.name));
    } else if (s.isFile() && supported(p) && s.size <= 50 * 1024 * 1024)
      results.push({
        path: p,
        name: basename(p),
        relativePath: relative(path, p) || basename(p),
        sizeBytes: s.size,
        modifiedAt: Math.trunc(s.mtimeMs),
      });
  }
  await walk(path);
  return results.sort((a, b) => a.path.localeCompare(b.path));
}
/** Same Unicode offsets, semantic boundaries and overlap as Rust chunk_document. */
export function chunkDocument(content: string) {
  const chars = Array.from(content),
    chunks: {
      index: number;
      content: string;
      charStart: number;
      charEnd: number;
    }[] = [];
  let start = 0;
  while (start < chars.length) {
    const hardEnd = Math.min(start + 1200, chars.length);
    let end = hardEnd;
    if (hardEnd !== chars.length) {
      const preferred = Math.min(start + 720, hardEnd);
      let found = false;
      for (const boundary of [
        (c: string) => "\n\r。！？；!?;".includes(c),
        (c: string) => /\s/u.test(c),
      ]) {
        for (let n = hardEnd; n >= preferred; n--)
          if (n > start && boundary(chars[n - 1])) {
            end = n;
            found = true;
            break;
          }
        if (found) break;
      }
    }
    let left = start,
      right = end;
    while (left < right && /\s/u.test(chars[left])) left++;
    while (right > left && /\s/u.test(chars[right - 1])) right--;
    if (left < right)
      chunks.push({
        index: chunks.length,
        content: chars.slice(left, right).join("").replace(/\r\n?/g, "\n"),
        charStart: left,
        charEnd: right,
      });
    if (end === chars.length) break;
    start = end - 160 > start ? end - 160 : end;
  }
  return chunks;
}
