import type {
  ApplicationFileClient,
  ApplicationFilePreviewResource,
  FilePreviewContainer,
  FilePreviewInput,
  FilePreviewView,
} from "./index.js";
export declare function renderFilePreview(
  container: FilePreviewContainer,
  resource: ApplicationFilePreviewResource,
  options?: {
    onReady?(resource: ApplicationFilePreviewResource): void;
    onError?(error: Error): void;
  },
): { ready: Promise<void>; close(): void; fail(error: unknown): void };
export declare function mountFilePreview(
  container: FilePreviewContainer,
  input: FilePreviewInput,
  files: ApplicationFileClient,
): FilePreviewView;
