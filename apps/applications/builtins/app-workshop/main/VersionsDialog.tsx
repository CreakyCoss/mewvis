import { useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  Circle,
  CircleCheck,
  Layers,
  LoaderCircle,
  Plus,
} from "lucide-react";
import { toast } from "sonner";
import type { ProjectDetail } from "./contracts";
import { Modal } from "./components";

export function getVersionNumber(
  project: ProjectDetail,
  id: string | null = project.savedVersionId,
) {
  const index = project.versions.findIndex((version) => version.id === id);
  return index < 0 ? null : project.versions.length - index;
}

export function VersionsDialog({
  project,
  pending,
  disabled,
  hasUnsavedChanges,
  onClose,
  onCreate,
  onRestore,
}: {
  project: ProjectDetail;
  pending: string;
  disabled: boolean;
  hasUnsavedChanges: boolean;
  onClose(): void;
  onCreate(): void;
  onRestore(id: string): void;
}) {
  const [confirmation, setConfirmation] = useState<"create" | "restore" | null>(
    null,
  );
  const [selectedId, setSelectedId] = useState("");
  const primaryAction = useRef<HTMLButtonElement>(null);
  const confirmationAction = useRef<HTMLButtonElement>(null);
  const returnAction = useRef<HTMLButtonElement | null>(null);
  const list = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (pending) return;
    (confirmation
      ? confirmationAction.current
      : (returnAction.current ?? primaryAction.current)
    )?.focus();
  }, [confirmation, pending]);
  useEffect(() => {
    setConfirmation(null);
    list.current?.scrollTo({ top: 0 });
  }, [project.versions.length]);
  const currentNumber = getVersionNumber(project);
  const selectedNumber = getVersionNumber(project, selectedId);
  const restoringCurrent = selectedId === project.savedVersionId;
  const beginCreate = () => {
    if (project.versions.length >= 100) {
      toast.info("最多保存 100 个版本。");
      return;
    }
    returnAction.current = primaryAction.current;
    setConfirmation("create");
  };
  return (
    <>
      <Modal
        title="版本管理"
        className="wk-version-modal"
        onClose={onClose}
        busy={!!pending}
      >
        <div className="wk-version-summary">
          <span>当前版本</span>
          <strong>
            {currentNumber ? `版本 ${currentNumber}` : "未保存"}
          </strong>
          {currentNumber && (
            <span
              className={`wk-version-state ${hasUnsavedChanges ? "is-unsaved" : ""}`}
            >
              <Circle aria-hidden="true" />
              {hasUnsavedChanges ? "内容有修改" : "内容已同步"}
            </span>
          )}
        </div>
        <div className="wk-version-list" ref={list}>
          {project.versions.length ? (
            project.versions.map((version, index) => {
              const current = version.id === project.savedVersionId;
              return (
                <div
                  className={`wk-version-row ${current ? "is-current" : ""}`}
                  key={version.id}
                >
                  <span className="wk-version-icon">
                    {current ? <CircleCheck /> : <Layers />}
                  </span>
                  <div className="wk-version-info">
                    <div className="wk-version-name">
                      <strong>
                        版本 {project.versions.length - index}
                      </strong>
                      {current && (
                        <span className="wk-version-current">当前版本</span>
                      )}
                    </div>
                    <span>
                      创建于 {new Date(version.createdAt).toLocaleString()}
                    </span>
                  </div>
                  <button
                    className={`wk-button is-small wk-version-action ${current ? "is-current" : ""}`}
                    disabled={disabled || (current && !hasUnsavedChanges)}
                    onClick={(event) => {
                      returnAction.current = event.currentTarget;
                      setSelectedId(version.id);
                      setConfirmation("restore");
                    }}
                  >
                    {current ? "还原到当前版本" : "切换"}
                  </button>
                </div>
              );
            })
          ) : (
            <div className="wk-version-empty">
              <Layers />
              <strong>还没有保存版本</strong>
              <span>保存当前内容，创建第一个版本。</span>
            </div>
          )}
        </div>
        <footer className="wk-version-footer">
          <span>共 {project.versions.length} 个版本</span>
          <button
            ref={primaryAction}
            className="wk-button is-primary"
            disabled={disabled}
            onClick={beginCreate}
          >
            <Plus />
            {project.versions.length ? "创建新版本" : "创建首个版本"}
          </button>
        </footer>
      </Modal>
      {confirmation === "create" && (
        <Modal
          title={`创建版本 ${project.versions.length + 1}`}
          className="wk-version-confirm-modal"
          onClose={() => setConfirmation(null)}
          busy={!!pending}
        >
          <div className="wk-modal-body">
            <p>
              将当前内容保存为版本 {project.versions.length + 1}，并切换到它。
              {project.versions.length > 0 && "已有版本会保留。"}
            </p>
          </div>
          <footer>
            <button
              className="wk-button"
              disabled={!!pending}
              onClick={() => setConfirmation(null)}
            >
              取消
            </button>
            <button
              ref={confirmationAction}
              className="wk-button is-primary"
              disabled={disabled}
              onClick={onCreate}
            >
              {pending && <LoaderCircle className="wk-spin" />}
              {pending ? "创建中…" : "确认创建"}
            </button>
          </footer>
        </Modal>
      )}
      {confirmation === "restore" && (
        <Modal
          title={
            restoringCurrent
              ? "还原到当前版本"
              : `切换到版本 ${selectedNumber}`
          }
          className="wk-version-confirm-modal"
          onClose={() => setConfirmation(null)}
          busy={!!pending}
        >
          <div className="wk-modal-body wk-version-confirm">
            <p>
              {restoringCurrent
                ? `当前内容将还原到版本 ${selectedNumber}。`
                : `切换后将使用版本 ${selectedNumber} 的内容。`}
            </p>
            {hasUnsavedChanges && (
              <div className="wk-version-warning">
                <AlertTriangle aria-hidden="true" />
                <p>当前有未保存到版本的修改，确认后将丢弃这些修改。</p>
              </div>
            )}
          </div>
          <footer>
            <button
              className="wk-button"
              disabled={!!pending}
              onClick={() => setConfirmation(null)}
            >
              取消
            </button>
            <button
              ref={confirmationAction}
              className="wk-button is-primary"
              disabled={disabled || (restoringCurrent && !hasUnsavedChanges)}
              onClick={() => onRestore(selectedId)}
            >
              {pending && <LoaderCircle className="wk-spin" />}
              {pending
                ? "处理中…"
                : restoringCurrent
                  ? "确认还原"
                  : "确认切换"}
            </button>
          </footer>
        </Modal>
      )}
    </>
  );
}
