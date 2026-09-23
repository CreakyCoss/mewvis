import type {
  ExtensionUICatalogSource,
  ExtensionUICatalogState,
} from "../protocol/catalog";

/** Suppress stale responses and release even subscriptions that resolve after unmount. */
export function observeUICatalog(
  source: ExtensionUICatalogSource,
  publish: (state: ExtensionUICatalogState) => void,
) {
  let disposed = false;
  let sequence = 0;
  let unsubscribe: (() => void) | undefined;
  const refresh = async () => {
    if (disposed) return;
    const current = ++sequence;
    try {
      const contributions = await source.list();
      if (!disposed && current === sequence)
        publish({ contributions, error: "" });
    } catch (error) {
      if (!disposed && current === sequence)
        publish({ contributions: [], error: String(error) });
    }
  };
  // Refresh again when the subscription is ready to close the initial read/subscribe gap.
  void Promise.resolve()
    .then(() => (disposed ? undefined : source.subscribe(() => void refresh())))
    .then(
      (stop) => {
        if (disposed) stop?.();
        else {
          unsubscribe = stop;
          void refresh();
        }
      },
      () => void refresh(),
    );
  void refresh();
  return {
    refresh,
    dispose() {
      disposed = true;
      unsubscribe?.();
      unsubscribe = undefined;
    },
  };
}
