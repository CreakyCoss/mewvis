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
  onClose,
  onSave,
  onCreate,
  onRestore,
}: {
  project: ProjectDetail;
  pending: string;
  disabled: boolean;
  blockedReason: string;
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
              ? "恢复草稿"
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
              <span className="wk-version-badge">正在使用</span>
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
                      disabled={disabled}
                      onClick={() => {
                        setSelectedId(version.id);
                        setStage("restore");
                      }}
                    >
                      {current ? "恢复草稿" : "切换"}
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
                <p>当前草稿将被替换。之后保存会更新版本 {selectedNumber}。</p>
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
              disabled={disabled}
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
                    ? "恢复草稿"
                    : "切换版本"}
            </button>
          </footer>
        </>
      )}
    </Modal>
  );
}
