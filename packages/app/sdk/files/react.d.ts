import type { CSSProperties, ReactElement } from "react";
import type { FilePreviewInput, FilePreviewOptions } from "./index.js";
export interface FilePreviewProps extends FilePreviewInput, FilePreviewOptions {
  className?: string;
  style?: CSSProperties;
}
export interface FilePreviewDialogProps extends FilePreviewInput {
  open: boolean;
  onOpenChange?(open: boolean): void;
}
export declare function FilePreview(props: FilePreviewProps): ReactElement;
export declare function FilePreviewDialog(
  props: FilePreviewDialogProps,
): ReactElement;
