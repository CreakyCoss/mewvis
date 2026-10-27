import { useCallback, useState, type ReactNode } from "react";
import {
  Database,
  FileText,
  MoreVertical,
  Search,
  Upload,
  ExternalLink,
  RefreshCw,
  Trash2,
  Pencil,
  ArrowLeft,
  LoaderCircle,
  ListTodo,
} from "lucide-react";
import { Button } from "design-system/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "design-system/components/ui/dropdown-menu";
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "design-system/components/ui/tabs";
import type { KnowledgeBase, KnowledgeJob } from "@mewvis/knowledge-sdk";
import type { KnowledgeWorkspace } from "./workspace.js";
import { KnowledgeDocumentView, KnowledgeSearchPanel } from "./reader.js";
import {
  activeStates,
  baseLabels,
  formatTime,
  jobLabels,
  kindLabels,
  locationText,
} from "./helpers.js";
import { useLoad } from "./resources.js";

export function KnowledgeEmpty({
  title,
  children,
  action,
}: {
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="knowledge-empty">
      <FileText size={32} />
      <h2>{title}</h2>
      {children && <p>{children}</p>}
      {action}
    </div>
  );
}

function BaseActions({
  workspace: w,
  base,
}: {
  workspace: KnowledgeWorkspace;
  base: KnowledgeBase;
}) {
  const allowed = (method: string) => w.can(method, base);
  if (
    !["bases.update", "bases.reindex", "bases.delete", "documents.import"].some(
      allowed,
    )
  )
    return null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label={`${base.name}的更多操作`}
        >
          <MoreVertical size={18} />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="knowledge-menu">
        {allowed("bases.update") && (
          <DropdownMenuItem
            onSelect={() => w.setDialog({ kind: "edit-base", base })}
          >
            <Pencil />
            编辑信息
          </DropdownMenuItem>
        )}
        {allowed("documents.import") && (
          <DropdownMenuItem
            onSelect={() => {
              w.selectBase(base.id);
              w.setDialog({ kind: "import" });
            }}
          >
            <Upload />
            导入资料
          </DropdownMenuItem>
        )}
        {allowed("bases.reindex") && (
          <DropdownMenuItem
            onSelect={() =>
              w.setDialog({
                kind: "confirm",
                title: "重建知识库索引",
                description: `将根据「${base.name}」已保存的正文重建全部索引。完成前继续使用现有索引。`,
                action: async () =>
                  w.accepted(
                    await w.client.bases.reindex(
                      { knowledgeBaseId: base.id },
                      w.mutationOptions(),
                    ),
                  ),
              })
            }
          >
            <RefreshCw />
            重建索引
          </DropdownMenuItem>
        )}
        {allowed("bases.delete") && (
          <DropdownMenuItem
            variant="destructive"
            onSelect={() =>
              w.setDialog({
                kind: "confirm",
                title: "删除知识库",
                description: `将删除「${base.name}」中的全部文档、片段和索引，此操作无法撤销。用户的源文件不会被删除。`,
                destructive: true,
                action: async () =>
                  w.accepted(
                    await w.client.bases.delete(
                      { knowledgeBaseId: base.id },
                      w.mutationOptions(),
                    ),
                  ),
              })
            }
          >
            <Trash2 />
            删除知识库
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function KnowledgeManagerPage({
  workspace: w,
}: {
  workspace: KnowledgeWorkspace;
}) {
  const [filter, setFilter] = useState("");
  const bases = w.bases.items.filter((base) =>
    `${base.name} ${base.description ?? ""}`
      .toLowerCase()
      .includes(filter.toLowerCase()),
  );
  return (
    <section className="knowledge-management">
      <div className="knowledge-list-heading">
        <h2>
          全部知识库{" "}
          <span>
            {w.bases.items.length}
            {w.bases.hasMore ? "+" : ""}
          </span>
        </h2>
        <div className="knowledge-filter">
          <Search size={18} />
          <input
            aria-label="搜索知识库"
            placeholder="搜索知识库"
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
          />
        </div>
      </div>
      <div className="knowledge-table-scroll">
        <table className="knowledge-base-table">
          <thead>
            <tr>
              <th>知识库</th>
              <th>文档</th>
              <th>片段</th>
              <th>状态</th>
              <th>最近更新</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {bases.map((base) => (
              <tr key={base.id}>
                <td>
                  <div className="knowledge-base-identity">
                    <span className="knowledge-icon-tile">
                      <Database />
                    </span>
                    <div>
                      <strong>{base.name}</strong>
                      <p>{base.description || "尚未添加描述"}</p>
                    </div>
                  </div>
                </td>
                <td>{base.documentCount ?? "—"}</td>
                <td>{base.chunkCount ?? "—"}</td>
                <td>
                  <span className={`knowledge-state is-${base.state}`}>
                    {baseLabels[base.state]}
                  </span>
                </td>
                <td>{formatTime(base.updatedAt)}</td>
                <td>
                  <div className="knowledge-row-actions">
                    <Button
                      variant={
                        base.state === "empty" &&
                        w.can("documents.import", base)
                          ? "ghost"
                          : "outline"
                      }
                      onClick={() => {
                        w.selectBase(base.id);
                        w.setView("workspace");
                        if (
                          base.state === "empty" &&
                          w.can("documents.import", base)
                        )
                          w.setDialog({ kind: "import" });
                      }}
                    >
                      {base.state === "empty" &&
                      w.can("documents.import", base) ? (
                        <>
                          <Upload />
                          导入资料
                        </>
                      ) : (
                        <>
                          <ExternalLink />
                          打开
                        </>
                      )}
                    </Button>
                    <BaseActions workspace={w} base={base} />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!bases.length && (
        <KnowledgeEmpty
          title={
            w.bases.pending
              ? "正在加载知识库…"
              : filter
                ? "没有匹配的知识库"
                : "从一个知识库开始"
          }
        >
          {filter
            ? "试试其他名称。"
            : "新建知识库，然后导入需要整理和检索的资料。"}
        </KnowledgeEmpty>
      )}
      <div className="knowledge-list-footer">
        <span>已加载 {w.bases.items.length} 个知识库</span>
        {w.bases.items.some(
          (base) =>
            w.can("bases.update", base) ||
            w.can("bases.reindex", base) ||
            w.can("bases.delete", base),
        ) && <span>名称、描述及索引操作可在更多菜单中管理。</span>}
      </div>
      {w.bases.hasMore && (
        <Button
          variant="outline"
          onClick={() => void w.bases.more()}
          disabled={w.bases.pending}
        >
          加载更多知识库
        </Button>
      )}
    </section>
  );
}

export function KnowledgeWorkbench({
  workspace: w,
}: {
  workspace: KnowledgeWorkspace;
}) {
  const [filter, setFilter] = useState("");
  const [tab, setTab] = useState("text");
  const document = w.document;
  const invoke = (action: () => Promise<void>) => {
    void w.run(action).catch(() => {});
  };
  return (
    <div className={`knowledge-workbench ${w.sidebar ? "with-sidebar" : ""}`}>
      {w.sidebar && (
        <aside className="knowledge-documents" aria-label="文档导航">
          <h2>
            文档 <span>{w.base?.documentCount ?? 0}</span>
          </h2>
          <div className="knowledge-filter">
            <Search size={16} />
            <input
              aria-label="搜索已加载文档"
              placeholder="搜索文档"
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
            />
          </div>
          <div className="knowledge-document-list">
            {w.documents.items
              .filter((item) =>
                item.title.toLowerCase().includes(filter.toLowerCase()),
              )
              .map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={item.id === w.documentId ? "is-selected" : ""}
                  onClick={() => {
                    w.setDocumentId(item.id);
                    w.locate({
                      id: "selection",
                      knowledgeBaseId: item.knowledgeBaseId,
                      documentId: item.id,
                      title: item.title,
                      text: "",
                    });
                  }}
                >
                  <FileText size={18} />
                  <span>
                    {item.title}
                    <small>{item.chunkCount ?? 0} 个片段</small>
                  </span>
                </button>
              ))}
            {w.documents.hasMore && (
              <Button
                variant="ghost"
                disabled={w.documents.pending}
                onClick={() => void w.documents.more()}
              >
                加载更多文档
              </Button>
            )}
          </div>
        </aside>
      )}
      <section className="knowledge-reader-pane" aria-label="文档阅读">
        <div className="knowledge-reader-toolbar">
          <FileText size={19} />
          <span>{w.base?.name}</span>
          <span>/</span>
          <select
            aria-label="选择文档"
            value={w.documentId}
            onChange={(event) => {
              w.setDocumentId(event.target.value);
              setTab("text");
            }}
            disabled={!w.documents.items.length}
          >
            <option value="" disabled>
              选择文档
            </option>
            {w.documents.items.map((item) => (
              <option key={item.id} value={item.id}>
                {item.title}
              </option>
            ))}
          </select>
          {document &&
            (w.can("documents.delete") ||
              w.can("documents.reindex") ||
              (w.can("documents.import") && Boolean(document.externalId))) && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" aria-label="文档操作">
                    <MoreVertical />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="knowledge-menu">
                  {w.can("documents.import") && document.externalId && (
                    <DropdownMenuItem
                      onSelect={() =>
                        w.setDialog({ kind: "import", replace: document })
                      }
                    >
                      <Upload />
                      替换文档
                    </DropdownMenuItem>
                  )}
                  {w.can("documents.reindex") && (
                    <DropdownMenuItem
                      onSelect={() =>
                        w.setDialog({
                          kind: "confirm",
                          title: "重建文档索引",
                          description: `重新生成「${document.title}」的片段和索引，完成前保留现有内容。`,
                          action: async () =>
                            w.accepted(
                              await w.client.documents.reindex(
                                {
                                  knowledgeBaseId: document.knowledgeBaseId,
                                  documentIds: [document.id],
                                },
                                w.mutationOptions(),
                              ),
                            ),
                        })
                      }
                    >
                      <RefreshCw />
                      重建索引
                    </DropdownMenuItem>
                  )}
                  {w.can("documents.delete") && (
                    <DropdownMenuItem
                      variant="destructive"
                      onSelect={() =>
                        w.setDialog({
                          kind: "confirm",
                          title: "删除文档",
                          description: `将删除「${document.title}」的正文、片段和索引，此操作无法撤销。`,
                          destructive: true,
                          action: async () => {
                            w.accepted(
                              await w.client.documents.delete(
                                {
                                  knowledgeBaseId: document.knowledgeBaseId,
                                  documentIds: [document.id],
                                },
                                w.mutationOptions(),
                              ),
                            );
                            w.setDocumentId("");
                          },
                        })
                      }
                    >
                      <Trash2 />
                      删除文档
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
        </div>
        {w.documents.hasMore && (
          <Button
            variant="ghost"
            onClick={() => void w.documents.more()}
            disabled={w.documents.pending}
          >
            加载更多文档
          </Button>
        )}
        {document ? (
          <div className="knowledge-reader-content">
            <div className="knowledge-document-heading">
              <h1>{document.title.replace(/\.(md|markdown|txt)$/i, "")}</h1>
              <p>
                {document.state === "ready" ? "已就绪" : "处理中"} ·{" "}
                {document.chunkCount ?? 0} 个片段 ·{" "}
                {formatTime(document.updatedAt)} 更新
              </p>
            </div>
            <Tabs
              value={
                w.evidence?.documentId === document.id &&
                w.evidence.id !== "selection"
                  ? "text"
                  : tab
              }
              onValueChange={(value) => {
                setTab(value);
                if (w.evidence)
                  w.locate({
                    id: "selection",
                    knowledgeBaseId: document.knowledgeBaseId,
                    documentId: document.id,
                    title: document.title,
                    text: "",
                  });
              }}
            >
              <TabsList variant="line">
                <TabsTrigger value="text">原文</TabsTrigger>
                {w.can("chunks.list") && (
                  <TabsTrigger value="chunks">片段</TabsTrigger>
                )}
              </TabsList>
              <TabsContent value="text">
                <KnowledgeDocumentView
                  document={document}
                  {...(w.evidence ? { evidence: w.evidence } : {})}
                />
              </TabsContent>
              <TabsContent value="chunks">
                <div className="knowledge-chunks">
                  {w.chunks.items.map((chunk) => (
                    <article key={chunk.id}>
                      <div>
                        <strong>片段 {chunk.ordinal + 1}</strong>
                        <span>{locationText(chunk)}</span>
                      </div>
                      <p>{chunk.text}</p>
                      <Button
                        variant="link"
                        onClick={() => {
                          setTab("text");
                          w.locate({ ...chunk, chunkId: chunk.id });
                        }}
                      >
                        定位到原文 <ArrowLeft size={14} />
                      </Button>
                    </article>
                  ))}
                  {w.chunks.hasMore && (
                    <Button
                      variant="outline"
                      disabled={w.chunks.pending}
                      onClick={() => void w.chunks.more()}
                    >
                      加载更多片段
                    </Button>
                  )}
                </div>
              </TabsContent>
            </Tabs>
            {document.source?.attachmentId &&
              w.props.onOpenAttachment &&
              w.can("attachments.createDownload") && (
                <Button
                  variant="outline"
                  onClick={() =>
                    invoke(async () =>
                      w.props.onOpenAttachment!({
                        knowledgeBaseId: document.knowledgeBaseId,
                        attachmentId: document.source!.attachmentId!,
                      }),
                    )
                  }
                >
                  查看原件
                </Button>
              )}
            {document.source?.attachmentId &&
              w.props.onDownloadAttachment &&
              w.can("attachments.createDownload") && (
                <Button
                  variant="outline"
                  onClick={() =>
                    invoke(async () =>
                      w.props.onDownloadAttachment!({
                        knowledgeBaseId: document.knowledgeBaseId,
                        attachmentId: document.source!.attachmentId!,
                      }),
                    )
                  }
                >
                  下载原件
                </Button>
              )}
            {document.source?.attachmentId &&
              document.externalId &&
              w.props.onReparseDocument &&
              w.can("documents.import") &&
              w.can("attachments.createDownload") && (
                <Button
                  variant="outline"
                  onClick={() =>
                    w.setDialog({
                      kind: "confirm",
                      title: "重新解析原件",
                      description:
                        "从保存的原始文件重新提取正文并生成索引。成功前保留现有正文与索引。",
                      action: async () => {
                        const parsed =
                          await w.props.onReparseDocument!(document);
                        w.accepted(
                          await w.client.documents.import(
                            {
                              knowledgeBaseId: document.knowledgeBaseId,
                              duplicatePolicy: "replace",
                              documents: [
                                { ...parsed, externalId: document.externalId! },
                              ],
                            },
                            w.mutationOptions(),
                          ),
                        );
                      },
                    })
                  }
                >
                  重新解析
                </Button>
              )}
          </div>
        ) : (
          <KnowledgeEmpty
            title={
              w.documentPending || w.documents.pending
                ? "正在加载资料…"
                : w.documents.items.length
                  ? "请选择一份文档"
                  : w.can("documents.import")
                    ? "让资料成为可检索的知识"
                    : "当前知识库还没有资料"
            }
            action={
              w.can("documents.import") ? (
                <Button onClick={() => w.setDialog({ kind: "import" })}>
                  <Upload />
                  导入文档
                </Button>
              ) : undefined
            }
          >
            {w.can("documents.import")
              ? "导入文件，或粘贴一段文本。"
              : "可以切换其他知识库，或联系资料管理员。"}
          </KnowledgeEmpty>
        )}
      </section>
      {w.base && (
        <KnowledgeSearchPanel
          knowledgeBaseName={w.base.name}
          capabilities={w.base.capabilities}
          query={w.query}
          onQueryChange={w.setQuery}
          mode={w.mode}
          onModeChange={w.setMode}
          onSearch={() => void w.search()}
          onLocate={(hit) => {
            setTab("text");
            w.locate(hit);
          }}
          pending={w.searching}
          {...(w.result ? { result: w.result } : {})}
          {...(w.evidence ? { selectedHitId: w.evidence.id } : {})}
        />
      )}
    </div>
  );
}

function JobDetails({
  workspace: w,
  job,
}: {
  workspace: KnowledgeWorkspace;
  job: KnowledgeJob;
}) {
  const loaded = useLoad(
    useCallback(
      (signal: AbortSignal) =>
        w.client.jobs.get(
          { knowledgeBaseId: job.knowledgeBaseId, jobId: job.id },
          { signal },
        ),
      [w.client, job.id, job.updatedAt],
    ),
  );
  const data = loaded.data ?? job;
  return (
    <div className="knowledge-job-detail">
      <p>任务 ID：{job.id}</p>
      {data.error && <p className="knowledge-error">{data.error.message}</p>}
      {data.result?.documents.map((item, index) => (
        <div key={index}>
          <span>
            {w.documents.items.find(
              (document) => document.id === item.documentId,
            )?.title ?? `资料 ${index + 1}`}
          </span>
          <strong
            className={
              item.status === "failed" ? "knowledge-error" : "knowledge-success"
            }
          >
            {
              { succeeded: "成功", skipped: "已跳过", failed: "失败" }[
                item.status
              ]
            }
          </strong>
          {item.error && (
            <p className="knowledge-error">{item.error.message}</p>
          )}
        </div>
      ))}
      {loaded.pending && <p>正在读取详情…</p>}
    </div>
  );
}

export function KnowledgeTasksPage({
  workspace: w,
}: {
  workspace: KnowledgeWorkspace;
}) {
  const [expanded, setExpanded] = useState("");
  const jobs = w.jobs.items;
  return (
    <section className="knowledge-tasks">
      <div className="knowledge-list-heading">
        <h2>{w.base?.name ?? "已删除知识库"}的任务</h2>
        <Button variant="outline" onClick={w.refresh} disabled={w.jobs.pending}>
          <RefreshCw />
          刷新
        </Button>
      </div>
      {!jobs.length && (
        <KnowledgeEmpty title={w.jobs.pending ? "正在读取任务…" : "还没有任务"}>
          导入、删除和索引维护的处理进度会显示在这里。
        </KnowledgeEmpty>
      )}
      {jobs.map((job) => (
        <article className="knowledge-job" key={job.id}>
          <div className="knowledge-job-heading">
            <ListTodo size={22} />
            <div>
              <h3>{kindLabels[job.kind]}</h3>
              <p>
                {formatTime(job.createdAt)} · 已处理 {job.progress.processed} /{" "}
                {job.progress.total ?? "—"} · 失败 {job.progress.failed} · 跳过{" "}
                {job.progress.skipped}
              </p>
            </div>
            <span
              className={
                job.state === "failed" ? "knowledge-error" : "knowledge-muted"
              }
            >
              {activeStates.has(job.state) && (
                <LoaderCircle size={14} className="knowledge-spin" />
              )}
              {jobLabels[job.state]}
            </span>
            <Button
              variant="ghost"
              onClick={() => setExpanded(expanded === job.id ? "" : job.id)}
            >
              {expanded === job.id ? "收起" : "详情"}
            </Button>
            {activeStates.has(job.state) &&
              job.state !== "cancelling" &&
              w.can("jobs.cancel") && (
                <Button
                  variant="outline"
                  disabled={w.busy}
                  onClick={() => {
                    void w
                      .run(async () =>
                        w.accepted(
                          await w.client.jobs.cancel(
                            {
                              knowledgeBaseId: job.knowledgeBaseId,
                              jobId: job.id,
                            },
                            w.mutationOptions(),
                          ),
                        ),
                      )
                      .catch(() => {});
                  }}
                >
                  取消任务
                </Button>
              )}
          </div>
          {expanded === job.id && <JobDetails workspace={w} job={job} />}
        </article>
      ))}
      {w.jobs.hasMore && (
        <Button
          variant="outline"
          onClick={() => void w.jobs.more()}
          disabled={w.jobs.pending}
        >
          加载更多任务
        </Button>
      )}
    </section>
  );
}
