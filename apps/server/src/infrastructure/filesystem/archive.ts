import { open as openZip, type ZipFile, type Entry } from "yauzl";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { relativePath } from "./paths.js";
import { invalid } from "../../shared/validation.js";
export async function extractZip(
  file: string,
  destination: string,
  maxFiles = 500,
  maxBytes = 50 * 1024 * 1024,
) {
  const zip = await new Promise<ZipFile>((resolve, reject) =>
    openZip(file, { lazyEntries: true, validateEntrySizes: true }, (e, z) =>
      e ? reject(e) : resolve(z!),
    ),
  );
  let count = 0,
    total = 0;
  const seen = new Set<string>();
  await new Promise<void>((resolve, reject) => {
    const fail = (e: unknown) => {
      zip.close();
      reject(e);
    };
    zip.on("error", fail);
    zip.on("end", resolve);
    zip.on("entry", (entry: Entry) => {
      void (async () => {
        if (++count > maxFiles) invalid("压缩包文件过多");
        const name = relativePath(entry.fileName),
          kind = (entry.externalFileAttributes >>> 16) & 0xf000;
        if (kind === 0xa000 || (kind && kind !== 0x8000 && kind !== 0x4000))
          invalid("压缩包不能包含链接或特殊文件");
        if (seen.has(name)) invalid("压缩包包含重复路径");
        seen.add(name);
        const path = join(destination, name);
        if (entry.fileName.endsWith("/")) {
          await mkdir(path, { recursive: true });
          zip.readEntry();
          return;
        }
        total += entry.uncompressedSize;
        if (total > maxBytes) invalid("压缩包超过大小限制");
        const stream = await new Promise<NodeJS.ReadableStream>(
          (resolve, reject) =>
            zip.openReadStream(entry, (e, s) => (e ? reject(e) : resolve(s!))),
        );
        const buffers: Buffer[] = [];
        let actual = 0;
        for await (const part of stream) {
          actual += Buffer.byteLength(part);
          if (actual > entry.uncompressedSize || actual > maxBytes)
            invalid("压缩文件大小不合法");
          buffers.push(Buffer.from(part));
        }
        await mkdir(dirname(path), { recursive: true });
        await writeFile(path, Buffer.concat(buffers), {
          flag: "wx",
          mode: 0o600,
        });
        zip.readEntry();
      })().catch(fail);
    });
    zip.readEntry();
  });
}
