import { createContext, useCallback, useContext, type PropsWithChildren } from "react";
import { getApplicationFileClient } from "@mewvis/app-sdk/files";
import type { MediaRuntime } from "./types";

const RuntimeContext = createContext<MediaRuntime | undefined>(undefined);

/** Configure the file host once at the application boundary, never per media kind. */
export function MediaProvider({ value, children }: PropsWithChildren<{ value?: MediaRuntime }>) {
  return <RuntimeContext.Provider value={value}>{children}</RuntimeContext.Provider>;
}

export function useMediaRuntime() {
  const runtime = useContext(RuntimeContext);
  return useCallback(() => {
    if (runtime) return runtime;
    const files = getApplicationFileClient();
    return { ...files.preview, reveal: files.reveal };
  }, [runtime]);
}
