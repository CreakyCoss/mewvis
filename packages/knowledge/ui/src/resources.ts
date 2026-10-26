import { useEffect, useRef, useState, useCallback } from "react";
import type { PageLoader } from "./helpers.js";

export function useLoad<T>(
  loader: ((signal: AbortSignal) => Promise<T>) | undefined,
) {
  const [state, setState] = useState<{
    data?: T;
    pending: boolean;
    error?: unknown;
  }>({ pending: Boolean(loader) });
  useEffect(() => {
    const controller = new AbortController();
    setState({ pending: Boolean(loader) });
    if (loader)
      void loader(controller.signal).then(
        (data) => {
          if (!controller.signal.aborted) setState({ data, pending: false });
        },
        (error: unknown) => {
          if (!controller.signal.aborted) setState({ pending: false, error });
        },
      );
    return () => controller.abort();
  }, [loader]);
  return state;
}

export function usePages<T>(
  loader: PageLoader<T> | undefined,
  version: number,
) {
  const [items, setItems] = useState<readonly T[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [pending, setPending] = useState(Boolean(loader));
  const [error, setError] = useState<unknown>();
  const generation = useRef(0);
  const previousLoader = useRef(loader);
  const current = useRef<AbortController | undefined>(undefined);
  useEffect(() => {
    const epoch = ++generation.current;
    const controller = new AbortController();
    current.current = controller;
    if (previousLoader.current !== loader || !loader) {
      setItems([]);
      setCursor(null);
    }
    previousLoader.current = loader;
    setError(undefined);
    setPending(Boolean(loader));
    if (loader)
      void loader({ limit: 100 }, controller.signal).then(
        (page) => {
          if (!controller.signal.aborted && epoch === generation.current) {
            setItems(page.items);
            setCursor(page.nextCursor);
            setPending(false);
          }
        },
        (reason: unknown) => {
          if (!controller.signal.aborted && epoch === generation.current) {
            setError(reason);
            setPending(false);
          }
        },
      );
    return () => {
      controller.abort();
      current.current?.abort();
    };
  }, [loader, version]);
  const more = useCallback(async () => {
    if (!loader || !cursor || pending) return;
    const epoch = generation.current;
    const controller = new AbortController();
    current.current = controller;
    setPending(true);
    setError(undefined);
    try {
      const page = await loader({ limit: 100, cursor }, controller.signal);
      if (!controller.signal.aborted && epoch === generation.current) {
        setItems((old) => [...old, ...page.items]);
        setCursor(page.nextCursor);
      }
    } catch (reason) {
      if (!controller.signal.aborted && epoch === generation.current)
        setError(reason);
    } finally {
      if (epoch === generation.current) setPending(false);
    }
  }, [cursor, loader, pending]);
  useEffect(() => () => current.current?.abort(), []);
  return { items, pending, error, hasMore: cursor !== null, more };
}
