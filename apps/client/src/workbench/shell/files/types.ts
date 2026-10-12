import type { FilePreview as FilePreviewResource } from "@/api/applications/files";

export type FilePreviewSource =
  | { filePath: string; applicationId?: string; previewId?: never }
  | { previewId: string; filePath?: never; applicationId?: never };

export type FilePreviewProps = FilePreviewSource & {
  className?: string;
  onReady?(resource: FilePreviewResource, url: string): void;
};
