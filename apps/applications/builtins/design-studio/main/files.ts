import type { Design } from "./model";
import type { DesignRepository, Project } from "./repository";

const mimeFor = (src: string) =>
  `image/${src.endsWith(".jpeg") ? "jpeg" : src.split(".").at(-1)}`;
export function dataUrl(bytes: Uint8Array, mime: string) {
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 8192)
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
  return `data:${mime};base64,${btoa(binary)}`;
}

export async function readImage(file: File) {
  if (
    file.size > 10 * 1024 * 1024 ||
    !["image/png", "image/jpeg", "image/webp"].includes(file.type)
  )
    throw new Error("请选择 10 MiB 以内的 PNG、JPEG 或 WebP 图片。");
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    if (image.width * image.height > 40_000_000)
      throw new Error("图片像素过多，请选择 4000 万像素以内的图片。");
    return {
      bytes: new Uint8Array(await file.arrayBuffer()),
      width: image.width,
      height: image.height,
    };
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Keep preview URLs outside the design and undo history. Only relative paths are persisted. */
export function createAssets(repository: DesignRepository, project: Project) {
  const cache = new Map<string, Promise<{ bytes: Uint8Array; url: string }>>();
  let disposed = false;
  async function load(src: string) {
    if (disposed) throw new Error("工作区已关闭。");
    let pending = cache.get(src);
    if (!pending) {
      pending = repository
        .readAsset(project, src)
        .then((bytes) => {
          if (disposed) throw new Error("工作区已关闭。");
          return {
            bytes,
            url: URL.createObjectURL(new Blob([bytes], { type: mimeFor(src) })),
          };
        })
        .catch((error) => {
          cache.delete(src);
          throw error;
        });
      cache.set(src, pending);
    }
    return pending;
  }
  return {
    async sources(
      design: Design,
      embed = false,
    ): Promise<Record<string, string>> {
      const sources: Record<string, string> = {};
      for (const src of new Set(
        design.layers
          .filter((layer) => layer.kind === "image" && !layer.hidden)
          .map((layer) => layer.src),
      )) {
        const asset = await load(src);
        sources[src] = embed ? dataUrl(asset.bytes, mimeFor(src)) : asset.url;
      }
      return sources;
    },
    dispose() {
      disposed = true;
      for (const pending of cache.values())
        void pending
          .then(({ url }) => URL.revokeObjectURL(url))
          .catch(() => {});
      cache.clear();
    },
  };
}
