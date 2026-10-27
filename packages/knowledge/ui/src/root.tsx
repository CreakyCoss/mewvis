import { useState } from "react";
import {
  BookOpen,
  Database,
  ListTodo,
  PanelLeft,
  Plus,
  Settings,
  X,
  CircleCheck,
  AlertCircle,
  LoaderCircle,
} from "lucide-react";
import { PageHeader } from "design-system/components/page-header";
import { Button } from "design-system/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "design-system/components/ui/dialog";
import type { KnowledgeApplicationProps } from "./index.js";
import { KnowledgeBaseDialog, KnowledgeImportDialog } from "./dialogs.js";
import {
  KnowledgeWorkbench,
  KnowledgeManagerPage,
  KnowledgeTasksPage,
  KnowledgeEmpty,
} from "./pages.js";
import { useKnowledgeWorkspace, type KnowledgeWorkspace } from "./workspace.js";
import { errorText } from "./helpers.js";

function Confirmation({ workspace: w }: { workspace: KnowledgeWorkspace }) {
  const [error, setError] = useState("");
  const dialog = w.dialog;
  if (dialog?.kind !== "confirm") return null;
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !w.busy) w.setDialog(undefined);
      }}
    >
      <DialogContent
        className="knowledge-ui knowledge-confirm-dialog"
        showCloseButton={!w.busy}
        onEscapeKeyDown={(event) => {
          if (w.busy) event.preventDefault();
        }}
        onInteractOutside={(event) => {
          if (w.busy) event.preventDefault();
        }}
      >
        <DialogTitle>{dialog.title}</DialogTitle>
        <DialogDescription>{dialog.description}</DialogDescription>
        {error && (
          <p className="knowledge-error" role="alert">
            {error}
          </p>
        )}
        <div className="knowledge-dialog-actions">
          <Button
            variant="outline"
            onClick={() => w.setDialog(undefined)}
            disabled={w.busy}
          >
            取消
          </Button>
          <Button
            variant={dialog.destructive ? "destructive" : "default"}
            disabled={w.busy}
            onClick={() => {
              void w
                .run(dialog.action)
                .catch((reason) => setError(errorText(reason)));
            }}
          >
            {w.busy ? "提交中…" : "确认"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function KnowledgeRoot(props: KnowledgeApplicationProps) {
  const w = useKnowledgeWorkspace(props);
  const managing = w.view === "manage",
    tasks = w.view === "tasks";
  const probe = w.connection.data?.probe;
  const status =
    probe?.status === "ready"
      ? "服务可用"
      : probe?.status === "degraded"
        ? "部分能力可用"
        : "服务不可用";
  return (
    <div
      className={`knowledge-ui knowledge-app ${props.navigation ? "has-navigation" : ""}`}
    >
      {props.navigation && (
        <nav className="knowledge-rail" aria-label="知识库导航">
          <Button
            variant="ghost"
            size="icon"
            aria-label="知识库工作台"
            aria-current={w.view === "workspace" ? "page" : undefined}
            onClick={() => w.setView("workspace")}
          >
            <BookOpen />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label="管理知识库"
            aria-current={managing ? "page" : undefined}
            onClick={() => w.setView("manage")}
          >
            <Database />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label="任务中心"
            aria-current={tasks ? "page" : undefined}
            onClick={() => w.setView("tasks")}
          >
            <ListTodo />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label="连接状态"
            onClick={() => w.setDialog({ kind: "status" })}
          >
            <Settings />
          </Button>
        </nav>
      )}
      <main className="knowledge-main">
        <PageHeader
          className="knowledge-header"
          title={managing ? "管理知识库" : tasks ? "任务" : "知识库"}
          titleAs="h1"
          description={
            managing
              ? "组织资料，管理每个知识库。"
              : tasks
                ? "查看资料处理进度与结果。"
                : "整理资料，验证检索。"
          }
          icon={managing ? <Database /> : tasks ? <ListTodo /> : <BookOpen />}
          {...(w.view !== "workspace"
            ? { onBack: () => w.setView("workspace"), backLabel: "返回工作台" }
            : {})}
          actions={
            managing ? (
              w.globalCan("bases.create") && (
                <Button onClick={() => w.setDialog({ kind: "create-base" })}>
                  <Plus />
                  新建知识库
                </Button>
              )
            ) : (
              <>
                {w.base && w.can("documents.import") && (
                  <Button onClick={() => w.setDialog({ kind: "import" })}>
                    <Plus />
                    导入文档
                  </Button>
                )}
                {!tasks && (
                  <Button variant="ghost" onClick={() => w.setView("tasks")}>
                    <ListTodo />
                    任务
                  </Button>
                )}
              </>
            )
          }
        />
        <div className="knowledge-context-toolbar">
          {w.view === "workspace" && (
            <Button
              variant="outline"
              size="icon"
              aria-label={w.sidebar ? "收起文档导航" : "展开文档导航"}
              aria-expanded={w.sidebar}
              onClick={w.toggleSidebar}
            >
              <PanelLeft />
            </Button>
          )}
          {managing ? (
            <div className="knowledge-service-label">
              <Database size={20} />
              {props.serviceLabel ?? "知识库服务"}
            </div>
          ) : (
            <>
              <select
                className="knowledge-base-select"
                aria-label="选择知识库"
                value={w.baseId}
                onChange={(event) => w.selectBase(event.target.value)}
                disabled={!w.bases.items.length}
              >
                <option value="" disabled>
                  选择知识库
                </option>
                {!w.base && w.baseId && (
                  <option value={w.baseId}>已删除知识库</option>
                )}
                {w.base &&
                  !w.bases.items.some((base) => base.id === w.baseId) && (
                    <option value={w.base.id}>{w.base.name}</option>
                  )}
                {w.bases.items.map((base) => (
                  <option value={base.id} key={base.id}>
                    {base.name}
                  </option>
                ))}
              </select>
              {w.bases.hasMore && (
                <Button
                  variant="ghost"
                  disabled={w.bases.pending}
                  onClick={() => void w.bases.more()}
                >
                  加载更多知识库
                </Button>
              )}
              {w.view === "workspace" && (
                <span className="knowledge-document-count">
                  {w.base?.documentCount ?? 0} 份文档
                </span>
              )}
            </>
          )}
          <div className="knowledge-context-actions">
            <Button
              variant="ghost"
              className={`knowledge-service-status is-${probe?.status ?? "unavailable"}`}
              onClick={() => w.setDialog({ kind: "status" })}
            >
              {probe?.status === "ready" ? (
                <CircleCheck size={14} />
              ) : (
                <AlertCircle size={14} />
              )}
              {w.connection.pending ? "连接中…" : status}
            </Button>
            {!managing && (
              <Button variant="ghost" onClick={() => w.setView("manage")}>
                <Settings />
                管理知识库
              </Button>
            )}
          </div>
        </div>
        {w.notice && (
          <div
            className={`knowledge-notice is-${w.notice.tone}`}
            role={w.notice.tone === "error" ? "alert" : "status"}
          >
            <span>{w.notice.text}</span>
            <Button
              variant="ghost"
              size="icon"
              aria-label="关闭提示"
              onClick={() => w.setNotice(undefined)}
            >
              <X size={16} />
            </Button>
          </div>
        )}
        {w.connection.pending ? (
          <KnowledgeEmpty title="正在连接知识库…" />
        ) : w.connection.error ? (
          <KnowledgeEmpty
            title="暂时无法连接服务"
            action={
              <div className="knowledge-dialog-actions">
                <Button variant="outline" onClick={w.recheck}>
                  重试
                </Button>
                {props.onConnectionSettings && (
                  <Button onClick={props.onConnectionSettings}>连接设置</Button>
                )}
              </div>
            }
          >
            {errorText(w.connection.error)}
          </KnowledgeEmpty>
        ) : managing ? (
          <KnowledgeManagerPage workspace={w} />
        ) : tasks ? (
          <KnowledgeTasksPage workspace={w} />
        ) : w.base ? (
          <KnowledgeWorkbench workspace={w} />
        ) : (
          <KnowledgeEmpty
            title={
              w.bases.pending || w.basePending
                ? "正在读取知识库…"
                : "从一个知识库开始"
            }
            action={
              w.globalCan("bases.create") ? (
                <Button onClick={() => w.setDialog({ kind: "create-base" })}>
                  <Plus />
                  新建知识库
                </Button>
              ) : undefined
            }
          >
            创建知识库，导入资料，再用一个问题验证检索。
          </KnowledgeEmpty>
        )}
        {w.activeJob &&
          ["queued", "running", "cancelling"].includes(w.activeJob.state) && (
            <button
              type="button"
              className="knowledge-active-job"
              onClick={() => {
                w.selectBase(w.activeJob!.knowledgeBaseId);
                w.setView("tasks");
              }}
            >
              <LoaderCircle className="knowledge-spin" size={16} />
              资料正在处理中，查看任务
            </button>
          )}
      </main>
      {(w.dialog?.kind === "create-base" || w.dialog?.kind === "edit-base") && (
        <KnowledgeBaseDialog
          key={w.dialog.kind === "edit-base" ? w.dialog.base.id : "create"}
          {...(w.dialog.kind === "edit-base" ? { base: w.dialog.base } : {})}
          pending={w.busy}
          onClose={() => w.setDialog(undefined)}
          onSubmit={async (input) =>
            w.run(async () => {
              if (w.dialog?.kind === "edit-base")
                await w.client.bases.update(
                  { knowledgeBaseId: w.dialog.base.id, patch: input },
                  w.mutationOptions(),
                );
              else {
                const base = await w.client.bases.create(
                  input,
                  w.mutationOptions(),
                );
                w.selectBase(base.id);
                w.setView("workspace");
              }
              w.refresh();
              w.setDialog(undefined);
            })
          }
        />
      )}
      {w.dialog?.kind === "import" && (
        <KnowledgeImportDialog
          bases={w.bases.items}
          knowledgeBaseId={w.baseId}
          {...(w.dialog.replace ? { replacement: w.dialog.replace } : {})}
          pending={w.busy}
          idempotency={w.description?.capabilities.idempotency ?? false}
          {...(props.parseFile ? { parseFile: props.parseFile } : {})}
          {...(props.acceptedFileTypes
            ? { acceptedFileTypes: props.acceptedFileTypes }
            : {})}
          {...(props.fileFormatLabel
            ? { fileFormatLabel: props.fileFormatLabel }
            : {})}
          {...(props.onDiscardDocument
            ? { onDiscardDocument: props.onDiscardDocument }
            : {})}
          onClose={() => w.setDialog(undefined)}
          onSubmit={w.importDocuments}
        />
      )}
      {w.dialog?.kind === "confirm" && <Confirmation workspace={w} />}
      {w.dialog?.kind === "status" && (
        <Dialog
          open
          onOpenChange={(open) => {
            if (!open) w.setDialog(undefined);
          }}
        >
          <DialogContent className="knowledge-ui knowledge-status-dialog">
            <DialogTitle>连接状态</DialogTitle>
            <DialogDescription>
              {props.serviceLabel ?? "知识库服务"} · {status}
            </DialogDescription>
            <div className="knowledge-checks">
              {probe?.checks.map((check, index) => (
                <div key={index}>
                  {check.status === "ok" ? (
                    <CircleCheck className="knowledge-success" size={18} />
                  ) : (
                    <AlertCircle className="knowledge-warning" size={18} />
                  )}
                  <span>{check.message ?? check.name}</span>
                </div>
              ))}
            </div>
            <div className="knowledge-dialog-actions">
              {props.onConnectionSettings && (
                <Button variant="outline" onClick={props.onConnectionSettings}>
                  连接设置
                </Button>
              )}
              <Button onClick={w.recheck} disabled={w.connection.pending}>
                重新检查
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
