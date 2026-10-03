import { useState } from "react";
import {
  Check,
  Copy,
  Download,
  Pencil,
  Plus,
  RefreshCw,
  Rss,
  Trash2,
  Upload,
} from "lucide-react";
import { writeClipboardText } from "@mewvis/app-sdk/browser";
import { Dialog } from "./Dialog";
import { errorText, tool } from "./useReader";
import { httpUrl, record, string, type Feed } from "./model";

type Preview = {
  addedCount: number;
  existedCount: number;
  skippedCount: number;
  changes: Feed[];
  skipped: { title?: string; reason?: string }[];
};
export function Subscriptions({
  feeds,
  mode,
  errors,
  syncing,
  onClose,
  onChanged,
  onSync,
}: {
  feeds: Feed[];
  mode: "add" | "manage";
  errors: Record<string, string>;
  syncing: boolean;
  onClose: () => void;
  onChanged: (syncUrl?: string) => Promise<void>;
  onSync: (feed: Feed) => Promise<void>;
}) {
  const [screen, setScreen] = useState<"list" | "edit" | "import" | "export">(
    mode === "add" ? "edit" : "list",
  );
  const [editing, setEditing] = useState<Feed | null>(null);
  const [url, setUrl] = useState(""),
    [name, setName] = useState(""),
    [category, setCategory] = useState("");
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  const [checked, setChecked] = useState<Record<string, unknown> | null>(null);
  const [opml, setOpml] = useState(""),
    [preview, setPreview] = useState<Preview | null>(null);
  const [removing, setRemoving] = useState<Feed | null>(null),
    [filter, setFilter] = useState("");
  const startEdit = (feed: Feed | null) => {
    setEditing(feed);
    setUrl(feed?.url ?? "");
    setName(feed?.name ?? "");
    setCategory(feed?.category ?? "");
    setChecked(null);
    setError("");
    setMessage("");
    setScreen("edit");
  };
  const run = async (job: () => Promise<void>) => {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await job();
    } catch (cause) {
      setError(errorText(cause));
    } finally {
      setBusy(false);
    }
  };
  const back = () => {
    setScreen("list");
    setError("");
    setMessage("");
    setPreview(null);
    setRemoving(null);
  };
  const duplicate = !editing && feeds.some((feed) => feed.url === httpUrl(url));
  const title =
    screen === "edit"
      ? editing
        ? "编辑订阅"
        : "添加订阅"
      : screen === "import"
        ? "导入 OPML"
        : screen === "export"
          ? "导出 OPML"
          : "管理订阅";
  return (
    <Dialog
      title={title}
      description={
        screen === "list"
          ? "整理来源、分组，也把你的订阅带到别处。"
          : screen === "edit"
            ? "订阅喜欢的内容，按自己的节奏阅读。"
            : undefined
      }
      onClose={onClose}
      busy={busy}
      wide={screen !== "edit"}
    >
      <div className="dialog-body">
        {error && (
          <div className="notice error" role="alert">
            {error}
          </div>
        )}
        {message && (
          <div className="notice success" role="status">
            {message}
          </div>
        )}
        {screen === "list" && (
          <>
            <div className="manage-actions">
              <button
                className="primary-button"
                disabled={busy || syncing}
                onClick={() => startEdit(null)}
              >
                <Plus size={16} />
                添加订阅
              </button>
              <button
                className="secondary-button"
                disabled={busy || syncing}
                onClick={() => {
                  setScreen("import");
                  setOpml("");
                  setPreview(null);
                  setMessage("");
                  setError("");
                }}
              >
                <Upload size={16} />
                导入 OPML
              </button>
              <button
                className="secondary-button"
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    const result = await tool("rss_opml_export");
                    setOpml(string(result.opml));
                    setScreen("export");
                  })
                }
              >
                <Download size={16} />
                导出
              </button>
            </div>
            <label className="sr-only" htmlFor="feed-filter">
              搜索订阅
            </label>
            <input
              id="feed-filter"
              placeholder="搜索名称、地址或分组"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            />
            <div className="manage-list">
              {feeds
                .filter((feed) =>
                  `${feed.name} ${feed.url} ${feed.category}`
                    .toLowerCase()
                    .includes(filter.toLowerCase()),
                )
                .map((feed) => (
                  <div className="manage-row" key={feed.url}>
                    <Rss size={18} />
                    <div>
                      <strong>{feed.name}</strong>
                      <span>
                        {feed.category || "未分组"} ·{" "}
                        {new URL(feed.url).hostname}
                      </span>
                      <small>{feed.url}</small>
                      {errors[feed.url] && (
                        <p className="source-error">{errors[feed.url]}</p>
                      )}
                    </div>
                    <button
                      className="icon-button"
                      title="刷新订阅"
                      aria-label={`刷新 ${feed.name}`}
                      disabled={busy || syncing}
                      onClick={() => void onSync(feed)}
                    >
                      <RefreshCw size={16} />
                    </button>
                    <button
                      className="icon-button"
                      aria-label={`编辑 ${feed.name}`}
                      disabled={busy || syncing}
                      onClick={() => startEdit(feed)}
                    >
                      <Pencil size={16} />
                    </button>
                    <button
                      className="icon-button destructive"
                      aria-label={`移除 ${feed.name}`}
                      disabled={busy || syncing}
                      onClick={() => setRemoving(feed)}
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                ))}
              {!feeds.length && (
                <p className="empty-hint">
                  还没有订阅，添加一个 RSS 或 Atom 地址开始阅读。
                </p>
              )}
            </div>
            {removing && (
              <div className="remove-confirm" role="alert">
                <strong>移除“{removing.name}”？</strong>
                <p>已收藏和稍后读的文章会保留。订阅地址可再次添加。</p>
                <div>
                  <button
                    className="secondary-button"
                    disabled={busy}
                    onClick={() => setRemoving(null)}
                  >
                    取消
                  </button>
                  <button
                    className="danger-button"
                    disabled={busy}
                    onClick={() =>
                      void run(async () => {
                        await tool("rss_remove", { url: removing.url });
                        setRemoving(null);
                        await onChanged();
                        setMessage("已移除订阅，阅读资料仍然保留。");
                      })
                    }
                  >
                    {busy ? "正在移除…" : "确认移除"}
                  </button>
                </div>
              </div>
            )}
          </>
        )}
        {screen === "edit" && (
          <form
            id="rss-subscription-form"
            onSubmit={(event) => {
              event.preventDefault();
              void run(async () => {
                const address = httpUrl(url);
                if (!address)
                  throw new Error(
                    "请输入有效的 HTTP(S) 订阅地址，不含账号或密码。",
                  );
                if (duplicate)
                  throw new Error("这个订阅已经添加，可在管理订阅中修改。");
                if (!editing && !checked) {
                  const result = record(
                    await tool("rss_check", { url: address }),
                  );
                  setChecked(result);
                  if (!name.trim()) setName(string(result.title));
                  return;
                }
                await tool(editing ? "rss_update" : "rss_add", {
                  url: editing?.url ?? address,
                  name: name.trim(),
                  category: category.trim(),
                });
                await onChanged(editing ? undefined : address);
                back();
                setMessage(
                  editing ? "订阅信息已保存。" : "已添加订阅，文章正在更新。",
                );
              });
            }}
          >
            <label htmlFor="subscription-url">RSS / Atom 地址</label>
            <input
              id="subscription-url"
              required
              type="url"
              placeholder="https://example.com/feed.xml"
              value={url}
              disabled={busy || !!editing}
              onChange={(e) => {
                setUrl(e.target.value);
                setChecked(null);
              }}
            />
            {duplicate && (
              <p className="source-error">这个地址已在订阅列表中。</p>
            )}
            {checked && (
              <div className="checked-feed" role="status">
                <Check size={18} />
                <div>
                  <strong>{string(checked.title) || "订阅源可用"}</strong>
                  <p>
                    {string(checked.feedType).toUpperCase()} ·{" "}
                    {Number(checked.entryCount) || 0} 篇文章
                  </p>
                </div>
              </div>
            )}
            <label htmlFor="subscription-name">
              订阅名称 <span>{editing ? "" : "可选"}</span>
            </label>
            <input
              id="subscription-name"
              maxLength={160}
              required={!!editing}
              placeholder="使用订阅源名称"
              value={name}
              disabled={busy}
              onChange={(e) => setName(e.target.value)}
            />
            <label htmlFor="subscription-category">
              分组 <span>可选</span>
            </label>
            <input
              id="subscription-category"
              list="rss-groups"
              maxLength={80}
              placeholder="例如：技术与产品"
              value={category}
              disabled={busy}
              onChange={(e) => setCategory(e.target.value)}
            />
            <datalist id="rss-groups">
              {[
                ...new Set(feeds.map((feed) => feed.category).filter(Boolean)),
              ].map((item) => (
                <option key={item} value={item} />
              ))}
            </datalist>
          </form>
        )}
        {screen === "import" && (
          <>
            <label htmlFor="opml-file" className="upload-label">
              <Upload size={18} />
              选择 OPML 文件
              <input
                id="opml-file"
                type="file"
                accept=".opml,.xml,text/xml,application/xml"
                disabled={busy}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (!file) return;
                  if (file.size > 1024 * 1024) {
                    setError("文件不能超过 1 MiB。");
                    return;
                  }
                  void file
                    .text()
                    .then((text) => {
                      setOpml(text);
                      setPreview(null);
                      setError("");
                    })
                    .catch((cause) => setError(errorText(cause)));
                }}
              />
            </label>
            <label htmlFor="opml-text">或粘贴 OPML 内容</label>
            <textarea
              id="opml-text"
              rows={9}
              value={opml}
              disabled={busy}
              onChange={(e) => {
                setOpml(e.target.value);
                setPreview(null);
              }}
              placeholder={
                '<?xml version="1.0"?>\n<opml version="2.0">…</opml>'
              }
            />
            {preview && (
              <div className="import-preview" role="status">
                <strong>
                  新增 {preview.addedCount} · 已有 {preview.existedCount} · 跳过{" "}
                  {preview.skippedCount}
                </strong>
                {preview.changes.length > 0 && (
                  <>
                    <p>以下已有订阅的名称或分组会更新：</p>
                    <ul>
                      {preview.changes.map((feed) => (
                        <li key={feed.url}>
                          {feed.name} — {feed.category || "未分组"}
                        </li>
                      ))}
                    </ul>
                  </>
                )}
                {preview.skipped.map((item, i) => (
                  <p key={i}>
                    {item.title || "无标题"}：{item.reason}
                  </p>
                ))}
              </div>
            )}
          </>
        )}
        {screen === "export" && (
          <>
            <p className="muted">
              包含订阅地址、名称和分组，可导入其他 RSS 阅读器。
            </p>
            <label htmlFor="export-opml">OPML 内容</label>
            <textarea id="export-opml" readOnly rows={12} value={opml} />
          </>
        )}
      </div>
      <footer>
        {screen !== "list" ? (
          <button className="secondary-button" disabled={busy} onClick={back}>
            返回管理
          </button>
        ) : (
          <span className="muted">{feeds.length} 个订阅</span>
        )}
        {screen === "edit" && (
          <button
            className="primary-button"
            form="rss-subscription-form"
            type="submit"
            disabled={busy || duplicate}
          >
            {busy
              ? "处理中…"
              : editing
                ? "保存修改"
                : checked
                  ? "添加订阅"
                  : "检查地址"}
          </button>
        )}
        {screen === "import" && (
          <button
            className="primary-button"
            disabled={busy || !opml.trim()}
            onClick={() =>
              void run(async () => {
                if (!preview) {
                  setPreview(await tool<Preview>("rss_opml_preview", { opml }));
                  return;
                }
                const result = await tool("rss_opml_import", { opml });
                await onChanged();
                back();
                setMessage(
                  `已导入 ${Number(result.addedCount) || 0} 个新订阅。点击刷新获取文章。`,
                );
              })
            }
          >
            {busy ? "处理中…" : preview ? "确认导入" : "预览导入"}
          </button>
        )}
        {screen === "export" && (
          <button
            className="primary-button"
            disabled={busy}
            onClick={() =>
              void run(async () => {
                await writeClipboardText(opml);
                setMessage("OPML 已复制。");
              })
            }
          >
            <Copy size={16} />
            复制 OPML
          </button>
        )}
        {screen === "list" && (
          <button
            className="secondary-button"
            disabled={busy}
            onClick={onClose}
          >
            完成
          </button>
        )}
      </footer>
    </Dialog>
  );
}
