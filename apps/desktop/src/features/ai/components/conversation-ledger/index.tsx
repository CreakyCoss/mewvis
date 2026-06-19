import { useCallback, useEffect, useImperativeHandle, useMemo, useState } from "react";
import {
  resolveRuntimeModelInput,
  useLlmSettingsStore,
} from "@/features/pages/settings/llm/store";
import { readLedger, summarizeLedger } from "./api";
import { LedgerDetail } from "./detail";
import { LedgerList } from "./list";
import { resolveLedgerSessionRootDir } from "./path";
import type {
  ConversationLedgerProps,
  LedgerResult,
} from "./types";

const DEFAULT_SUMMARY_INSTRUCTION = [
  "请生成当前会话的前端展示摘要。",
  "摘要仅用于界面查看，不参与后续上下文构建。",
  "优先保留用户目标、关键决策、当前进展、未完成事项和重要运行状态。",
].join("\n");

export const ConversationLedger = ({
  bind,
  workspacePath,
  chatId,
  runtimeModel,
  agentId,
  summaryInstruction,
}: ConversationLedgerProps) => {
  const loadLlmSettings = useLlmSettingsStore((store) => store.loadSettings);
  const [ledger, setLedger] = useState<LedgerResult | null>(null);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSummaryRefreshing, setIsSummaryRefreshing] = useState(false);
  const [selectedLinkId, setSelectedLinkId] = useState<string | null>(null);
  const sessionRootDir = useMemo(
    () => resolveLedgerSessionRootDir(chatId),
    [chatId],
  );
  const links = useMemo(
    () => [...(ledger?.runtimeLinks ?? [])].sort((left, right) =>
      (right.startedAt ?? 0) - (left.startedAt ?? 0)
    ),
    [ledger?.runtimeLinks],
  );
  const selectedLink = useMemo(
    () => selectedLinkId
      ? links.find((link) => link.linkId === selectedLinkId) ?? null
      : null,
    [links, selectedLinkId],
  );
  const resolveSummaryRuntimeModel = useCallback(async () => {
    if (runtimeModel) {
      return runtimeModel;
    }

    await loadLlmSettings();
    const settingsState = useLlmSettingsStore.getState();
    const defaultRuntimeModel = settingsState.runtimeModels[0] ?? null;
    const runtimeModelInput = resolveRuntimeModelInput(defaultRuntimeModel?.id);
    if (!runtimeModelInput) {
      throw new Error(settingsState.error || "请先在设置中配置可用的 LLM 模型。");
    }
    return runtimeModelInput;
  }, [loadLlmSettings, runtimeModel]);

  const refresh = useCallback(async () => {
    if (!workspacePath || !sessionRootDir) {
      setLedger(null);
      setError("");
      return;
    }

    setIsLoading(true);
    try {
      const result = await readLedger({
        workspacePath,
        sessionRootDir,
      });
      setLedger(result);
      setError("");
    } catch (caught) {
      setError(String(caught));
    } finally {
      setIsLoading(false);
    }
  }, [sessionRootDir, workspacePath]);

  const refreshSummary = useCallback(async () => {
    if (!workspacePath || !sessionRootDir) {
      return;
    }

    setIsSummaryRefreshing(true);
    try {
      const summaryRuntimeModel = await resolveSummaryRuntimeModel();
      const result = await summarizeLedger({
        workspacePath,
        sessionRootDir,
        agentId,
        runtimeModel: summaryRuntimeModel,
        summaryInstruction: summaryInstruction ?? DEFAULT_SUMMARY_INSTRUCTION,
      });
      setLedger(result);
      setError("");
    } catch (caught) {
      setError(String(caught));
    } finally {
      setIsSummaryRefreshing(false);
    }
  }, [
    agentId,
    resolveSummaryRuntimeModel,
    sessionRootDir,
    summaryInstruction,
    workspacePath,
  ]);

  useImperativeHandle(bind, () => ({
    refresh,
    refreshSummary,
  }), [refresh, refreshSummary]);

  useEffect(() => {
    setSelectedLinkId(null);
    void refresh();
  }, [refresh]);

  return (
    <>
      <LedgerDetail
        selectedLink={selectedLink}
        ledger={ledger}
        onClose={() => setSelectedLinkId(null)}
      />
      <LedgerList
        ledger={ledger}
        links={links}
        selectedLink={selectedLink}
        isLoading={isLoading}
        error={error}
        isSummaryRefreshing={isSummaryRefreshing}
        onSelectLink={setSelectedLinkId}
        onRefresh={() => void refresh()}
        onRefreshSummary={() => void refreshSummary()}
      />
    </>
  );
};
