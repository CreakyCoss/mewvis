export type ApplicationFileInfo = Readonly<{
  filePath: string;
  name: string;
  type: "file" | "directory";
  size: number;
  modifiedAt: number;
}>;
export type ApplicationFileRoots = Readonly<{
  dataPath: string;
  workspacePaths: string[];
}>;
export type ApplicationFilePreview = Readonly<{
  id: string;
  name: string;
  size: number;
  mimeType: string;
  kind: "image" | "video" | "audio" | "pdf" | "text" | "unsupported";
  expiresAt: number;
}>;
export type FilePreviewInput = Readonly<{ filePath: string }>;
export type ApplicationFilePreviewResource = ApplicationFilePreview &
  Readonly<{
    resourcePath: string;
    /** Present in browser transports; grants only this file's temporary read-only access. */
    resourceUrl?: string;
    /** Trusted, self-contained PDF worker supplied by the host UI. */
    workerSource?: string;
    pdfSource?: string;
  }>;
export interface FilePreviewContainer {
  readonly ownerDocument: { readonly defaultView: unknown };
  readonly isConnected: boolean;
}
export interface FilePreviewView {
  readonly ready: Promise<void>;
  close(): Promise<void>;
}
export type ApplicationFileWriteOptions = Readonly<{
  /** Defaults to false. An existing file requires an explicit overwrite. */
  overwrite?: boolean;
  /** Optional optimistic concurrency check against stat().modifiedAt. */
  expectedModifiedAt?: number;
}>;
export interface ApplicationFileClient {
  roots(): Promise<ApplicationFileRoots>;
  stat(filePath: string): Promise<ApplicationFileInfo>;
  /** Immediate ordinary children; symbolic links are never included. */
  list(filePath: string): Promise<ApplicationFileInfo[]>;
  mkdir(filePath: string): Promise<ApplicationFileInfo>;
  /** Files and empty directories only; never a data/workspace root or managed file. */
  remove(filePath: string): Promise<void>;
  /** File-only operations. Destination must not exist; both paths are checked. */
  copy(source: string, destination: string): Promise<ApplicationFileInfo>;
  move(source: string, destination: string): Promise<ApplicationFileInfo>;
  readChunks(filePath: string): AsyncIterable<Uint8Array>;
  /** Defaults to a 16 MiB allocation limit; use readChunks for larger files. */
  readBinary(
    filePath: string,
    options?: { maxBytes?: number },
  ): Promise<Uint8Array>;
  readText(filePath: string, options?: { maxBytes?: number }): Promise<string>;
  /** Atomic replacement after commit. Existing files require overwrite: true. */
  writeBinary(
    filePath: string,
    bytes: Uint8Array,
    options?: ApplicationFileWriteOptions,
  ): Promise<ApplicationFileInfo>;
  writeText(
    filePath: string,
    text: string,
    options?: ApplicationFileWriteOptions,
  ): Promise<ApplicationFileInfo>;
  beginWrite(
    filePath: string,
    options?: ApplicationFileWriteOptions,
  ): Promise<string>;
  /** Ordered chunks, up to 64 KiB each. */
  writeChunk(id: string, offset: number, bytes: Uint8Array): Promise<void>;
  commitWrite(id: string): Promise<ApplicationFileInfo>;
  abortWrite(id: string): Promise<void>;
  readonly preview: {
    create(input: FilePreviewInput): Promise<ApplicationFilePreviewResource>;
    describe(id: string): Promise<ApplicationFilePreviewResource>;
    open(
      container: FilePreviewContainer,
      input: FilePreviewInput,
    ): Promise<FilePreviewView>;
    openDialog(
      input: FilePreviewInput,
    ): Promise<ApplicationFilePreviewResource>;
    subscribe(listener: (event: { id: string }) => void): () => void;
    close(id: string): Promise<void>;
  };
}
export type ApplicationFileRequest = Readonly<{
  version: 1;
  method:
    | "roots"
    | "stat"
    | "list"
    | "mkdir"
    | "remove"
    | "copy"
    | "move"
    | "read"
    | "write.begin"
    | "write.chunk"
    | "write.commit"
    | "write.abort"
    | "preview.create"
    | "preview.describe"
    | "preview.openDialog"
    | "preview.close";
  params?: Record<string, string | number | boolean>;
}>;
export type ApplicationFileResponse =
  | { ok: true; value: unknown }
  | { ok: false; error: { code: string; message: string } };
export interface ApplicationFileTransport {
  readonly version: 1;
  request(request: ApplicationFileRequest): Promise<ApplicationFileResponse>;
  subscribe?(listener: (event: { id: string }) => void): () => void;
}
export declare class ApplicationFileError extends Error {
  readonly code: string;
  constructor(code: string, message: string, options?: { cause?: unknown });
}
export declare function createApplicationFileClient(
  transport: ApplicationFileTransport,
): ApplicationFileClient;
export declare function getApplicationFileClient(): ApplicationFileClient;
