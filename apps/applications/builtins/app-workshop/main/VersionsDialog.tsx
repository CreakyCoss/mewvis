import { useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  Check,
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
  blockedReason,
  hasUnsavedChanges,
  onClose,
  onSave,
  onCreate,
  onRestore,
}: {
  project: ProjectDetail;
  pending: string;
  disabled: boolean;
  blockedReason: string;
  hasUnsavedChanges: boolean;
  onClose(): void;
  onSave(): void;
  onCreate(): void;
  onRestore(id: string): void;
}) {
  const [stage, setStage] = useState<"list" | "create" | "restore">("list");
  const [selectedId, setSelectedId] = useState("");
  const primaryAction = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    primaryAction.current?.focus();
  }, [stage]);
  const currentNumber = getVersionNumber(project);
  const selectedNumber = getVersionNumber(project, selectedId);
  const restoringCurrent = selectedId === project.savedVersionId;
  const beginCreate = () => {
    if (blockedReason) {
      toast.info(blockedReason);
      return;
    }
    if (project.versions.length >= 100) {
      toast.info("最多保存 100 个版本。");
      return;
    }
    if (!project.versions.length) onSave();
    else setStage("create");
  };
  return (
    <Modal
      title={
        stage === "create"
          ? "创建新版本"
          : stage === "restore"
            ? restoringCurrent
              ? "还原到当前版本"
              : `切换到版本 ${selectedNumber}`
            : "版本管理"
      }
      className="wk-version-modal"
      onClose={onClose}
      busy={!!pending}
    >
      {stage === "list" ? (
        <>
          <div className="wk-version-summary">
            <span>当前版本</span>
            <strong>
              {currentNumber ? `版本 ${currentNumber}` : "未保存"}
            </strong>
            {currentNumber && (
              <span
                className={`wk-version-badge ${hasUnsavedChanges ? "is-unsaved" : ""}`}
              >
                {hasUnsavedChanges ? "草稿有修改" : "草稿已同步"}
              </span>
            )}
          </div>
          <div className="wk-version-list">
            {project.versions.length ? (
              project.versions.map((version, index) => {
                const current = version.id === project.savedVersionId;
                return (
                  <div
                    className={`wk-version-row ${current ? "is-current" : ""}`}
                    key={version.id}
                  >
                    <span className="wk-version-icon">
                      {current ? <Check /> : <Layers />}
                    </span>
                    <div className="wk-version-info">
                      <strong>版本 {project.versions.length - index}</strong>
                      <span>
                        创建于 {new Date(version.createdAt).toLocaleString()}
                      </span>
                    </div>
                    <button
                      className="wk-button is-small"
                      disabled={disabled || (current && !hasUnsavedChanges)}
                      onClick={() => {
                        if (!hasUnsavedChanges) {
                          onRestore(version.id);
                          return;
                        }
                        setSelectedId(version.id);
                        setStage("restore");
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
                <span>构建预览后，保存第一个版本。</span>
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
              {project.versions.length ? "创建新版本" : "保存首个版本"}
            </button>
          </footer>
        </>
      ) : (
        <>
          <div className="wk-modal-body wk-version-confirm">
            <div className="wk-version-flow">
              <span>
                {stage === "create" ? "当前草稿" : `版本 ${selectedNumber}`}
              </span>
              <ArrowRight />
              <strong>
                {stage === "create"
                  ? `版本 ${project.versions.length + 1}`
                  : "当前草稿"}
              </strong>
            </div>
            {stage === "create" ? (
              <p>将当前草稿保存为新版本，并切换到它。已有版本会保留。</p>
            ) : (
              <div className="wk-version-warning">
                <AlertTriangle />
                <p>
                  {restoringCurrent
                    ? `将丢弃未保存到当前版本的修改，用版本 ${selectedNumber} 的内容覆盖草稿。`
                    : `草稿有未保存到版本的修改，切换后这些修改将被丢弃，并用版本 ${selectedNumber} 的内容覆盖草稿。`}
                </p>
              </div>
            )}
          </div>
          <footer>
            <button
              className="wk-button"
              disabled={!!pending}
              onClick={() => setStage("list")}
            >
              返回版本列表
            </button>
            <button
              ref={primaryAction}
              className="wk-button is-primary"
              disabled={
                disabled ||
                (stage === "restore" && restoringCurrent && !hasUnsavedChanges)
              }
              onClick={() =>
                stage === "create" ? onCreate() : onRestore(selectedId)
              }
            >
              {pending ? (
                <LoaderCircle className="wk-spin" />
              ) : stage === "create" ? (
                <Plus />
              ) : (
                <ArrowRight />
              )}
              {pending
                ? "处理中…"
                : stage === "create"
                  ? "创建版本"
                  : restoringCurrent
                    ? "还原到当前版本"
                    : "切换版本"}
            </button>
          </footer>
        </>
      )}
    </Modal>
  );
}
