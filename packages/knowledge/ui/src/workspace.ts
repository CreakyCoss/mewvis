import { useState, useEffect, useCallback, useRef } from "react";
import {
  KnowledgeError,
  type KnowledgeBase,
  type KnowledgeDocument,
  type KnowledgeSearchHit,
  type KnowledgeSearchResult,
  type KnowledgeSearchMode,
  type KnowledgeJob,
  type KnowledgeInput,
  type KnowledgeMutationOptions,
} from "@mewvis/knowledge-sdk";
import type { KnowledgeApplicationProps, KnowledgeView } from "./index.js";
import { useLoad, usePages } from "./resources.js";
import { activeStates, errorText, jobLabels, kindLabels } from "./helpers.js";

export type KnowledgeDialog =
  | { kind: "create-base" }
  | { kind: "edit-base"; base: KnowledgeBase }
  | { kind: "import"; replace?: KnowledgeDocument }
  | { kind: "status" }
  | {
      kind: "confirm";
      title: string;
      description: string;
      action: () => Promise<void>;
      destructive?: boolean;
    };

export function useKnowledgeWorkspace(props: KnowledgeApplicationProps) {
  const { client } = props;
  const [view, setView] = useState<KnowledgeView>(
    props.initialView ?? "workspace",
  );
  const [baseId, setBaseId] = useState(props.initialKnowledgeBaseId ?? "");
  const [documentId, setDocumentId] = useState("");
  const [version, setVersion] = useState(0);
  const [probeVersion, setProbeVersion] = useState(0);
  const [sidebar, setSidebar] = useState(false);
  const [dialog, setDialog] = useState<KnowledgeDialog>();
  const [notice, setNotice] = useState<{
    text: string;
    tone: "success" | "error" | "warning";
  }>();
  const [activeJob, setActiveJob] = useState<KnowledgeJob>();
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState<KnowledgeSearchMode>("auto");
  const [result, setResult] = useState<KnowledgeSearchResult>();
  const [searching, setSearching] = useState(false);
  const [evidence, setEvidence] = useState<KnowledgeSearchHit>();
  const searchController = useRef<AbortController | undefined>(undefined);
  const refresh = useCallback(() => setVersion((value) => value + 1), []);
  const fail = useCallback(
    (error: unknown) => {
      if (error instanceof KnowledgeError && error.code === "UNAUTHENTICATED")
        props.onUnauthenticated?.();
      else setNotice({ text: errorText(error), tone: "error" });
    },
    [props.onUnauthenticated],
  );
  const connection = useLoad(
    useCallback(
      async (signal: AbortSignal) => {
        const [description, probe] = await Promise.all([
          client.service.describe({ signal }),
          client.service.probe({ signal }),
        ]);
        return { description, probe };
      },
      [client, probeVersion],
    ),
  );
  const baseLoader = useCallback(
    (input: Parameters<typeof client.bases.list>[0], signal: AbortSignal) =>
      client.bases.list(input, { signal }),
    [client],
  );
  const bases = usePages(
    connection.data?.description.capabilities.methods.includes("bases.list")
      ? baseLoader
      : undefined,
    version,
  );
  const description = connection.data?.description;
  const listedBase = bases.items.find((item) => item.id === baseId);
  const baseIsListed = Boolean(listedBase);
  const selectedBase = useLoad(
    useCallback(
      async (signal: AbortSignal) => {
        if (
          !baseId ||
          baseIsListed ||
          !description?.capabilities.methods.includes("bases.get")
        )
          return undefined;
        return client.bases.get({ knowledgeBaseId: baseId }, { signal });
      },
      [client, baseId, baseIsListed, description, version],
    ),
  );
  const base =
    listedBase ??
    (selectedBase.data?.id === baseId ? selectedBase.data : undefined);
  const can = useCallback(
    (method: string, target = base) =>
      Boolean(
        description?.capabilities.methods.includes(method) &&
        (!target || target.capabilities.methods.includes(method)),
      ),
    [description, base],
  );
  const docLoader = useCallback(
    (input: { cursor?: string; limit?: number }, signal: AbortSignal) =>
      client.documents.list({ ...input, knowledgeBaseId: baseId }, { signal }),
    [client, baseId],
  );
  const documents = usePages(
    base && can("documents.list") ? docLoader : undefined,
    version,
  );
  const documentState = useLoad(
    useCallback(
      async (signal: AbortSignal) => {
        if (!baseId || !documentId || !can("documents.get")) return undefined;
        return client.documents.get(
          { knowledgeBaseId: baseId, documentId },
          { signal },
        );
      },
      [client, baseId, documentId, version, can],
    ),
  );
  const chunkLoader = useCallback(
    (input: { cursor?: string; limit?: number }, signal: AbortSignal) =>
      client.chunks.list(
        { ...input, knowledgeBaseId: baseId, documentId },
        { signal },
      ),
    [client, baseId, documentId],
  );
  const chunks = usePages(
    base && documentId && can("chunks.list") ? chunkLoader : undefined,
    version,
  );
  const jobLoader = useCallback(
    (input: { cursor?: string; limit?: number }, signal: AbortSignal) =>
      client.jobs.list({ ...input, knowledgeBaseId: baseId }, { signal }),
    [client, baseId],
  );
  const jobs = usePages(
    baseId && can("jobs.list") && view === "tasks" ? jobLoader : undefined,
    version,
  );

  useEffect(() => {
    setBaseId(props.initialKnowledgeBaseId ?? "");
    setDocumentId("");
    setActiveJob(undefined);
    setNotice(undefined);
    setDialog(undefined);
  }, [client, props.initialKnowledgeBaseId]);

  useEffect(() => {
    if (connection.error) fail(connection.error);
  }, [connection.error, fail]);
  useEffect(() => {
    if (
      selectedBase.error &&
      !(
        view === "tasks" &&
        selectedBase.error instanceof KnowledgeError &&
        selectedBase.error.code === "NOT_FOUND"
      )
    )
      fail(selectedBase.error);
  }, [selectedBase.error, view, fail]);
  useEffect(() => {
    for (const error of [
      bases.error,
      documents.error,
      documentState.error,
      chunks.error,
      jobs.error,
    ])
      if (error) fail(error);
  }, [
    bases.error,
    documents.error,
    documentState.error,
    chunks.error,
    jobs.error,
    fail,
  ]);
  useEffect(() => {
    searchController.current?.abort();
    setResult(undefined);
    setEvidence(undefined);
    setDocumentId("");
    setMode("auto");
    setSearching(false);
  }, [client, baseId]);
  useEffect(() => {
    if (!bases.items.length) return;
    if (!baseId) {
      let saved: string | null = null;
      try {
        saved =
          props.preferences?.getItem(
            `knowledge:${description?.serviceId}:base`,
          ) ?? null;
      } catch {
        /* preferences are optional */
      }
      setBaseId(
        saved &&
          (bases.hasMore || bases.items.some((item) => item.id === saved))
          ? saved
          : bases.items[0]!.id,
      );
    }
  }, [
    bases.items,
    bases.hasMore,
    baseId,
    description?.serviceId,
    props.preferences,
    view,
  ]);
  useEffect(() => {
    if (
      documents.items.length &&
      (!documentId ||
        (!documents.pending &&
          !documents.hasMore &&
          !documents.items.some((item) => item.id === documentId)))
    )
      setDocumentId(documents.items[0]!.id);
    else if (
      !documents.pending &&
      !documents.hasMore &&
      !documents.items.length
    )
      setDocumentId("");
  }, [documents.items, documents.pending, documents.hasMore, documentId]);
  useEffect(() => {
    if (!description) return;
    try {
      setSidebar(
        props.preferences?.getItem(
          `knowledge:${description.serviceId}:sidebar`,
        ) === "true",
      );
    } catch {
      /* optional */
    }
  }, [description?.serviceId, props.preferences]);
  useEffect(() => () => searchController.current?.abort(), [client]);

  useEffect(() => {
    if (!activeJob || !activeStates.has(activeJob.state)) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const job = await client.jobs.get(
          { knowledgeBaseId: activeJob.knowledgeBaseId, jobId: activeJob.id },
          { signal: controller.signal },
        );
        if (controller.signal.aborted) return;
        if (activeStates.has(job.state)) timer = setTimeout(poll, 650);
        else {
          setActiveJob(job);
          refresh();
          if (
            job.kind === "delete-base" &&
            job.state === "succeeded" &&
            baseId === job.knowledgeBaseId
          ) {
            setBaseId("");
            setDocumentId("");
          }
          setNotice({
            tone: ["failed", "partially_succeeded"].includes(job.state)
              ? "warning"
              : "success",
            text: `${kindLabels[job.kind]}：${jobLabels[job.state]}。可在任务中查看详情。`,
          });
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          setActiveJob(undefined);
          fail(error);
        }
      }
    };
    timer = setTimeout(poll, 150);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [activeJob?.id, activeJob?.state, client, refresh, fail, baseId]);
  useEffect(() => {
    if (
      view !== "tasks" ||
      !jobs.items.some((job) => activeStates.has(job.state))
    )
      return;
    const timer = setTimeout(refresh, 1500);
    return () => clearTimeout(timer);
  }, [jobs.items, view, refresh]);

  const selectBase = useCallback(
    (id: string) => {
      setBaseId(id);
      try {
        props.preferences?.setItem(
          `knowledge:${description?.serviceId}:base`,
          id,
        );
      } catch {
        /* optional */
      }
    },
    [description?.serviceId, props.preferences],
  );
  const toggleSidebar = useCallback(() => {
    setSidebar((old) => {
      try {
        props.preferences?.setItem(
          `knowledge:${description?.serviceId}:sidebar`,
          String(!old),
        );
      } catch {
        /* optional */
      }
      return !old;
    });
  }, [description?.serviceId, props.preferences]);
  const mutationOptions = useCallback(
    (): KnowledgeMutationOptions =>
      description?.capabilities.idempotency
        ? { idempotencyKey: crypto.randomUUID() }
        : {},
    [description?.capabilities.idempotency],
  );
  const accepted = useCallback(
    (job: KnowledgeJob) => {
      setActiveJob(job);
      refresh();
      setDialog(undefined);
      setNotice({
        text: `${kindLabels[job.kind]}任务已提交。`,
        tone: "success",
      });
    },
    [refresh],
  );
  const run = useCallback(
    async (action: () => Promise<void>) => {
      if (busy) return;
      setBusy(true);
      try {
        await action();
      } catch (error) {
        fail(error);
        throw error;
      } finally {
        setBusy(false);
      }
    },
    [busy, fail],
  );
  const search = useCallback(async () => {
    if (!base || !query.trim() || !can("search")) return;
    searchController.current?.abort();
    const controller = new AbortController();
    searchController.current = controller;
    setSearching(true);
    setResult(undefined);
    setEvidence(undefined);
    try {
      const value = await client.search(
        { knowledgeBaseIds: [base.id], query: query.trim(), mode, limit: 20 },
        { signal: controller.signal },
      );
      if (!controller.signal.aborted) setResult(value);
    } catch (error) {
      if (!controller.signal.aborted) fail(error);
    } finally {
      if (!controller.signal.aborted) setSearching(false);
    }
  }, [base, query, mode, can, client, fail]);
  const locate = useCallback(
    (hit: KnowledgeSearchHit) => {
      setEvidence(hit);
      if (hit.documentId && can("documents.get")) setDocumentId(hit.documentId);
    },
    [can],
  );
  const importDocuments = useCallback(
    async (
      input: KnowledgeInput<"documents.import">,
      options?: KnowledgeMutationOptions,
    ) => {
      await run(async () => {
        const job = await client.documents.import(
          input,
          options ?? mutationOptions(),
        );
        selectBase(input.knowledgeBaseId);
        accepted(job);
      });
    },
    [run, accepted, client, mutationOptions, selectBase],
  );

  return {
    props,
    client,
    view,
    setView,
    baseId,
    selectBase,
    base,
    basePending: !base && selectedBase.pending,
    bases,
    description,
    connection,
    documents,
    documentId,
    setDocumentId,
    document: documentState.data,
    documentPending: documentState.pending,
    chunks,
    jobs,
    version,
    refresh,
    can,
    sidebar,
    toggleSidebar,
    dialog,
    setDialog,
    notice,
    setNotice,
    activeJob,
    busy,
    run,
    fail,
    accepted,
    mutationOptions,
    query,
    setQuery,
    mode,
    setMode,
    result,
    searching,
    search,
    evidence,
    locate,
    importDocuments,
    globalCan: (method: string) =>
      Boolean(description?.capabilities.methods.includes(method)),
    recheck: () => setProbeVersion((value) => value + 1),
  };
}
export type KnowledgeWorkspace = ReturnType<typeof useKnowledgeWorkspace>;
