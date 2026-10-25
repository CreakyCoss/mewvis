import type {
  ApplicationFileClient,
  ApplicationFilePreview,
  ApplicationFilePreviewResource,
  FilePreviewOptions,
} from "@mewvis/app-sdk/files";

export type MediaRuntime = Pick<ApplicationFileClient["preview"], "open" | "openDialog"> &
  Pick<ApplicationFileClient, "reveal">;

/** A path owns its preview lease; an already authorized resource borrows its owner's lease. */
type MediaSource =
  { filePath: string; resource?: never } | { resource: ApplicationFilePreviewResource; filePath?: never };

type MediaLabelOptions = {
  /** Format the generated type label. An empty result hides its visible badge, retaining an accessible name. */
  formatLabel?(label: string): string | null | undefined;
};

export type MediaContentProps = MediaSource &
  MediaLabelOptions &
  Omit<FilePreviewOptions, "mediaControls"> & {
    mediaControls?: boolean;
    name?: string;
    /** Optional loading hints; resolved file metadata takes precedence. */
    type?: ApplicationFilePreviewResource["kind"];
    mimeType?: string;
    size?: number;
    className?: string;
    /** Inline includes hover information and opens the shared host dialog. Preview renders its body. */
    presentation?: "inline" | "preview";
    onError?(message: string): void;
  };

/** A host may borrow an authorized resource while leaving the entire dialog UI to Media. */
export type MediaDialogProps = MediaLabelOptions & {
  presentation: "dialog";
  preview: ApplicationFilePreview;
  resource?: ApplicationFilePreviewResource;
  loading?: boolean;
  error?: string;
  onClose(): void;
  onRestoreFocus?(): void;
  /** Optional capability adapter; hosts can revalidate their lease before revealing the file. */
  onReveal?(): Promise<void>;
};

export type MediaProps = MediaContentProps | MediaDialogProps;
