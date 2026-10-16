import { useEffect, useMemo, useState } from "react";
import { useChatSnapshot } from "@mewvis/app-sdk/chat/react";
import { getApplicationDataClient } from "@mewvis/app-sdk/data";
import { getApplicationFileClient } from "@mewvis/app-sdk/files";
import { Check, FileCheck2, X } from "lucide-react";
import { Dialog } from "../components/Dialog";
import { ASSET_KINDS, type FilmProject } from "../model";
import {
  CHANGE_FIELDS,
  changeDependencies,
  changeStatus,
  type FilmProposal,
  type ProposalChange,
} from "./proposals";
import { createAssistantStore, type ProposalIndex } from "./store";

type Props = {
  project: FilmProject;
  episodeId: string;
  chatId: string;
  onApply: (proposal: FilmProposal, selected: string[]) => Promise<void>;
};
export function ProposalTray(props: Props) {
  const snapshot = useChatSnapshot();
  const store = useMemo(
    () =>
      createAssistantStore(
        getApplicationDataClient().storage,
        getApplicationFileClient(),
      ),
    [],
  );
  const [entries, setEntries] = useState<
    Array<{ index: ProposalIndex; proposal: FilmProposal }>
  >([]);
  const [review, setReview] = useState<string>(),
    [error, setError] = useState(""),
    [retry, setRetry] = useState(0);
  const signal = snapshot.messages
    .flatMap((message) =>
      message.role === "assistant"
        ? message.blocks
            .filter(
              (block) =>
                block.type === "tool" &&
                block.name === "film_propose_changes" &&
                block.status === "done",
            )
            .map((block) => block.id)
        : [],
    )
    .join(":");
  useEffect(() => {
    let active = true;
    void store
      .list(props.project.id, props.episodeId, props.chatId)
      .then(async (indexes) => {
        const loaded = await Promise.all(
          indexes.map(async (index) => ({
            index,
            proposal: await store.read(index),
          })),
        );
        if (active) {
          setEntries(loaded);
          setError("");
        }
      })
      .catch((reason) => {
        if (active)
          setError(reason instanceof Error ? reason.message : String(reason));
      });
    return () => {
      active = false;
    };
  }, [
    store,
    props.project.id,
    props.episodeId,
    props.chatId,
    signal,
    snapshot.phase === "idle",
    retry,
  ]);
  const pending = entries.filter((entry) =>
    entry.proposal.changes.some(
      (change) =>
        changeStatus(props.project, entry.proposal, change) !== "applied",
    ),
  );
  const opened = entries.find((entry) => entry.index.id === review);
  if (!entries.length && !error) return null;
  return (
    <>
      <section className="film-proposal-tray" aria-label="助手创作建议">
        {error && (
          <p className="film-error" role="alert">
            {error}{" "}
            <button onClick={() => setRetry((value) => value + 1)}>
              重新读取
            </button>
          </p>
        )}
        {pending.length ? (
          pending.map(({ index, proposal }) => (
            <div className="film-proposal-summary" key={index.id}>
              <FileCheck2 size={16} />
              <span>
                <strong>{index.title}</strong>
                <small>
                  {
                    proposal.changes.filter(
                      (change) =>
                        changeStatus(props.project, proposal, change) !==
                        "applied",
                    ).length
                  }{" "}
                  项待采用
                </small>
              </span>
              <button
                onClick={() => {
                  setError("");
                  setReview(index.id);
                }}
              >
                预览建议
              </button>
              <button
                className="film-icon-button"
                aria-label={`忽略建议 ${index.title}`}
                onClick={() => {
                  void store
                    .dismiss(index)
                    .then(() =>
                      setEntries((current) =>
                        current.filter((entry) => entry.index.id !== index.id),
                      ),
                    )
                    .catch((reason) => setError(String(reason)));
                }}
              >
                <X size={14} />
              </button>
            </div>
          ))
        ) : (
          <p className="film-proposal-adopted">
            <Check size={14} />
            当前会话的建议已采用
          </p>
        )}
      </section>
      {opened && (
        <ProposalReview
          key={opened.index.id}
          {...props}
          proposal={opened.proposal}
          onClose={() => setReview(undefined)}
        />
      )}
    </>
  );
}

function ProposalReview({
  project,
  proposal,
  onApply,
  onClose,
}: Props & { proposal: FilmProposal; onClose: () => void }) {
  const [selected, setSelected] = useState(
    () =>
      new Set(
        proposal.changes
          .filter(
            (change) => changeStatus(project, proposal, change) === "ready",
          )
          .map((change) => change.id),
      ),
  );
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [retrySave, setRetrySave] = useState(false);
  const choose = (change: ProposalChange, checked: boolean) => {
    const next = new Set(selected);
    if (checked) {
      next.add(change.id);
      for (const id of changeDependencies(proposal, change)) {
        const dependency = proposal.changes.find((item) => item.id === id)!;
        if (changeStatus(project, proposal, dependency) === "conflict") {
          setError("镜头引用的新增素材存在冲突，请重新生成建议。");
          return;
        }
        next.add(id);
      }
    } else {
      next.delete(change.id);
      for (const item of proposal.changes)
        if (changeDependencies(proposal, item).includes(change.id))
          next.delete(item.id);
    }
    setError("");
    setSelected(next);
  };
  const selectedIds = proposal.changes
    .filter(
      (change) =>
        selected.has(change.id) &&
        changeStatus(project, proposal, change) === "ready",
    )
    .map((change) => change.id);
  const hasConflict = proposal.changes.some(
    (change) => changeStatus(project, proposal, change) === "conflict",
  );
  const canRetrySave =
    retrySave &&
    selected.size > 0 &&
    proposal.changes
      .filter((change) => selected.has(change.id))
      .every((change) => changeStatus(project, proposal, change) === "applied");
  return (
    <Dialog
      title="预览创作建议"
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <div className="film-proposal-review">
        <header>
          <strong>{proposal.title}</strong>
          <p>只采用勾选的内容。未涉及的文字、素材文件和图片版本会保留。</p>
        </header>
        {hasConflict && (
          <p className="film-proposal-conflict" role="status">
            部分内容在建议生成后已修改，已禁止覆盖。你仍可采用其他建议。
          </p>
        )}
        <div className="film-proposal-changes">
          {proposal.changes.map((change) => {
            const status = changeStatus(project, proposal, change);
            const title =
              change.kind === "script"
                ? "更新剧本"
                : `${change.create ? "新增" : "更新"}${change.kind === "asset" ? ASSET_KINDS[change.assetKind] : "镜头"}`;
            return (
              <article
                key={change.id}
                className={`film-proposal-change is-${status}`}
              >
                <label className="film-proposal-change-heading">
                  <input
                    type="checkbox"
                    checked={
                      status === "applied" ||
                      (status === "ready" && selected.has(change.id))
                    }
                    disabled={busy || status !== "ready"}
                    onChange={(event) => choose(change, event.target.checked)}
                  />
                  <strong>
                    {title} · {change.label}
                  </strong>
                  <span>
                    {status === "applied"
                      ? "已采用"
                      : status === "conflict"
                        ? "已有新修改"
                        : "待采用"}
                  </span>
                </label>
                {change.kind === "script" ? (
                  <Difference
                    before={
                      status === "conflict"
                        ? (project.episodes.find(
                            (episode) => episode.id === proposal.episodeId,
                          )?.script ?? "（分集已删除）")
                        : change.before
                    }
                    after={change.after}
                  />
                ) : (
                  Object.entries(change.after).map(([key, value]) => (
                    <div className="film-proposal-field" key={key}>
                      <h4>{CHANGE_FIELDS[key]}</h4>
                      <Difference
                        before={
                          change.create
                            ? undefined
                            : status === "conflict"
                              ? currentValue(project, proposal, change, key)
                              : (change.before as Record<string, unknown>)[key]
                        }
                        after={value}
                        format={(value) =>
                          formatValue(project, proposal, key, value)
                        }
                      />
                    </div>
                  ))
                )}
                {!!changeDependencies(proposal, change).length && (
                  <p className="film-muted">关联的新素材会随镜头一起采用。</p>
                )}
              </article>
            );
          })}
        </div>
        {error && (
          <p className="film-error" role="alert">
            {error}
          </p>
        )}
        <footer>
          <span>{selectedIds.length} 项已勾选</span>
          <button disabled={busy} onClick={onClose}>
            关闭
          </button>
          <button
            className="film-primary"
            disabled={busy || (!selectedIds.length && !canRetrySave)}
            onClick={() => {
              setBusy(true);
              setError("");
              void onApply(proposal, selectedIds)
                .then(() => {
                  setRetrySave(false);
                  onClose();
                })
                .catch((reason) => {
                  setError(
                    reason instanceof Error ? reason.message : String(reason),
                  );
                  setRetrySave(true);
                })
                .finally(() => setBusy(false));
            }}
          >
            {busy
              ? "保存中…"
              : canRetrySave && !selectedIds.length
                ? "重试保存"
                : `采用所选 ${selectedIds.length} 项`}
          </button>
        </footer>
      </div>
    </Dialog>
  );
}
function Difference({
  before,
  after,
  format = (value) =>
    Array.isArray(value) ? value.join("、") : String(value ?? ""),
}: {
  before?: unknown;
  after: unknown;
  format?: (value: unknown) => string;
}) {
  return (
    <div
      className={`film-proposal-diff ${before === undefined ? "is-new" : ""}`}
    >
      {before !== undefined && (
        <div>
          <small>当前内容</small>
          <pre>{format(before) || "（空）"}</pre>
        </div>
      )}
      <div>
        {before !== undefined && <small>建议内容</small>}
        <pre>{format(after) || "（空）"}</pre>
      </div>
    </div>
  );
}
function formatValue(
  project: FilmProject,
  proposal: FilmProposal,
  key: string,
  value: unknown,
): string {
  if (["sceneId", "speakerId", "characterIds"].includes(key)) {
    const name = (id: string) =>
      project.assets.find((asset) => asset.id === id)?.name ||
      proposal.changes.find(
        (change) => change.kind === "asset" && change.targetId === id,
      )?.label ||
      id;
    return Array.isArray(value)
      ? value.map(name).join("、")
      : value
        ? name(String(value))
        : "未指定";
  }
  return String(value ?? "");
}

function currentValue(
  project: FilmProject,
  proposal: FilmProposal,
  change: ProposalChange,
  key: string,
): unknown {
  const target =
    change.kind === "asset"
      ? project.assets.find((asset) => asset.id === change.targetId)
      : project.episodes
          .find((episode) => episode.id === proposal.episodeId)
          ?.shots.find((shot) => shot.id === change.targetId);
  return target
    ? (target as unknown as Record<string, unknown>)[key]
    : "（目标已删除）";
}
