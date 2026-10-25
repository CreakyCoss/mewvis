import type { FilePreview as FilePreviewResource } from "@/api/applications/files";
import type { FilePreviewOptions } from "@mewvis/app-sdk/files";

export type FilePreviewSource =
  | { filePath: string; applicationId?: string; previewId?: never }
  | { previewId: string; filePath?: never; applicationId?: never };

export type FilePreviewProps = FilePreviewSource &
  Omit<FilePreviewOptions, "mediaControls"> & {
    mediaControls?: boolean;
    className?: string;
    onReady?(resource: FilePreviewResource, url: string): void;
    onError?(message: string): void;
  };
