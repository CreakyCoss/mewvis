export interface OriginalFile {
  bytes: Uint8Array;
  fileName: string;
  mediaType: string;
}
export function downloadOriginal(file: OriginalFile) {
  const url = URL.createObjectURL(
    new Blob([Uint8Array.from(file.bytes)], { type: file.mediaType }),
  );
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = file.fileName;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
