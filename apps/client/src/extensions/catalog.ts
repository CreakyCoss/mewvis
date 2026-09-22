import { useEffect, useState } from "react";
import { listen } from "@/transport";
import { observeConnection } from "@/transport/events";
import { listExtensionUIContributions, type ExtensionUIContribution } from "@/api/extensions";

/** Contributions are discovered without evaluating any plugin in the desktop realm. */
export function useExtensionCatalog() {
  const [contributions, setContributions] = useState<ExtensionUIContribution[]>([]);
  const [error, setError] = useState("");
  useEffect(() => {
    let disposed = false,
      sequence = 0;
    const refresh = async () => {
      const current = ++sequence;
      try {
        const result = await listExtensionUIContributions();
        if (!disposed && current === sequence) {
          setContributions(result);
          setError("");
        }
      } catch (error) {
        if (!disposed && current === sequence) {
          setContributions([]);
          setError(String(error));
        }
      }
    };
    const subscription = listen("extensions_changed", () => void refresh());
    void subscription.then(refresh).catch(() => void refresh());
    const disconnect = observeConnection(() => void refresh());
    window.addEventListener("focus", refresh);
    void refresh();
    return () => {
      disposed = true;
      disconnect();
      window.removeEventListener("focus", refresh);
      void subscription.then((stop) => stop()).catch(() => {});
    };
  }, []);
  return { contributions, error };
}
