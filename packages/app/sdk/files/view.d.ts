import type {
  ApplicationFileClient,
  ApplicationFilePreviewResource,
  FilePreviewContainer,
  FilePreviewInput,
  FilePreviewView,
  FilePreviewOptions,
} from "./index.js";
export declare function renderFilePreview(
  container: FilePreviewContainer,
  resource: ApplicationFilePreviewResource,
  options?: FilePreviewOptions & {
    onReady?(resource: ApplicationFilePreviewResource): void;
    onError?(error: Error): void;
  },
): { ready: Promise<void>; close(): void; fail(error: unknown): void };
export declare function mountFilePreview(
  container: FilePreviewContainer,
  input: FilePreviewInput,
  files: ApplicationFileClient,
  options?: FilePreviewOptions,
): FilePreviewView;
