import { MediaDialog } from "./dialog";
import { MediaView } from "./view";
import type { MediaProps } from "./types";

export { MediaProvider } from "./runtime";
export type { MediaProps, MediaRuntime } from "./types";

/** Public facade for both inline media and its full preview dialog. */
export function Media(props: MediaProps) {
  if (props.presentation === "dialog") return <MediaDialog key={props.preview.id} {...props} />;
  return <MediaView {...props} />;
}
