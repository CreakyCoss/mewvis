import { getApplicationViewClient } from "@mewvis/app-sdk/views";

export async function exportFile(blob: Blob, name: string): Promise<string> {
  const client = getApplicationViewClient();
  let id: string | undefined;
  try {
    ({ id } = await client.request<{ id: string }>("file.export.begin", {
      name,
      size: blob.size,
      mime: blob.type,
    }));
    const bytes = new Uint8Array(await blob.arrayBuffer());
    for (let offset = 0; offset < bytes.length; offset += 48 * 1024) {
      const chunk = bytes.subarray(offset, offset + 48 * 1024);
      let raw = "";
      for (const byte of chunk) raw += String.fromCharCode(byte);
      await client.request("file.export.chunk", {
        id,
        offset,
        data: btoa(raw),
      });
    }
    return (
      await client.request<{ path: string }>("file.export.finish", { id })
    ).path;
  } catch (error) {
    if (id) await client.request("file.export.cancel", { id }).catch(() => {});
    throw error;
  }
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
    const canvas = document.createElement("canvas");
    let edge = 1400;
    for (let attempt = 0; attempt < 6; attempt++) {
      const scale = Math.min(1, edge / Math.max(image.width, image.height));
      canvas.width = Math.max(1, Math.round(image.width * scale));
      canvas.height = Math.max(1, Math.round(image.height * scale));
      canvas
        .getContext("2d")!
        .drawImage(image, 0, 0, canvas.width, canvas.height);
      const src = canvas.toDataURL("image/webp", 0.85 - attempt * 0.07);
      if (src.length <= 90000)
        return { src, width: image.width, height: image.height };
      edge *= 0.8;
    }
    throw new Error("图片内容过大，请裁剪后再导入。");
  } finally {
    URL.revokeObjectURL(url);
  }
}
