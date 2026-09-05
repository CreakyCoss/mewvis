import { useEffect, useState } from "react";
import { getPluginChatClient, type PluginChatInput, type PluginChatSession } from "@isle/plugin-sdk/chat";

/** The transport and shared client are supplied once by the sandbox host. */
export function usePluginChatSession(input: PluginChatInput | null) {
  const key = JSON.stringify(input);
  const [entry, setEntry] = useState<{ key: string; session?: PluginChatSession; error?: string }>({ key: "" });
  useEffect(() => {
    let attached = true;
    if (input)
      void getPluginChatClient()
        .openSession(input)
        .then(
          (session) => {
            if (attached) setEntry({ key, session });
          },
          (error) => {
            if (attached) setEntry({ key, error: String(error?.message ?? error) });
          },
        );
    return () => {
      attached = false;
    };
  }, [key]);
  return entry.key === key ? entry : { key };
}
