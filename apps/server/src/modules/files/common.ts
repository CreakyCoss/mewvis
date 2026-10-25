import { ServiceError } from "../../shared/validation.js";

export type FileInfo = {
  filePath: string;
  name: string;
  type: "file" | "directory";
  size: number;
  modifiedAt: number;
};
export type PreviewKind =
  "image" | "video" | "audio" | "pdf" | "text" | "unsupported";
export type FilePreview = {
  id: string;
  filePath: string;
  name: string;
  size: number;
  mimeType: string;
  kind: PreviewKind;
  expiresAt: number;
};
export const lifetime = 10 * 60_000;
export const chunkLimit = 64 * 1024;
export function fileError(code: string, message: string, status = 400): never {
  throw new ServiceError(status, code, message);
}
