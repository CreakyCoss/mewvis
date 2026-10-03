import { useEffect, useRef, useState } from "react";
import {
  Database,
  FolderOpen,
  Plus,
  RefreshCw,
  Save,
  Trash2,
} from "lucide-react";
import {
  getApplicationDataClient,
  type ApplicationStorageValue,
  type ApplicationWorkspace,
} from "@mewvis/app-sdk/data";
import { CodeExample, Feedback, PageHeading, errorText } from "./Example";

const prefix = "playground.demo.";
export const dataCode = [
  'import { getApplicationDataClient } from "@mewvis/app-sdk/data";',
  "",
  "const { storage, workspaces } = getApplicationDataClient();",
  'await storage.setItem("playground.demo.note", { message: "Hello Mewvis" });',
  'const value = await storage.getItem("playground.demo.note");',
  "",
  "// 由宿主选择目录；取消时返回 null。",
  'const workspace = await workspaces.create({ name: "我的工作区" });',
].join("\n");

export function DataExamples() {
  const [tab, setTab] = useState<"storage" | "workspaces">("storage");
  const [key, setKey] = useState("note");
  const [value, setValue] = useState(
    '{\n  "message": "Hello Mewvis",\n  "count": 1\n}',
  );
  const [stored, setStored] = useState<{
    key: string;
    value: ApplicationStorageValue;
    exists: boolean;
  }>();
  const [keys, setKeys] = useState<string[]>([]);
  const [workspaces, setWorkspaces] = useState<ApplicationWorkspace[]>([]);
  const [name, setName] = useState("体验工作区");
  const [busy, setBusy] = useState("");
  const busyRef = useRef(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const run = async (label: string, action: () => Promise<void>) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(label);
    setError("");
    setMessage("");
    try {
      await action();
    } catch (error) {
      setError(errorText(error));
    } finally {
      busyRef.current = false;
      setBusy("");
    }
  };
  const storageKey = () => {
    if (!key.trim() || key.trim().length > 128)
      throw new Error("请填写 1–128 个字符的示例键名。");
    return prefix + key.trim();
  };
  const listKeys = async () => {
    setKeys(
      (await getApplicationDataClient().storage.keys())
        .filter((item) => item.startsWith(prefix))
        .sort(),
    );
  };
  const save = () =>
    run("保存数据", async () => {
      const target = storageKey();
      let parsed: ApplicationStorageValue;
      try {
        parsed = JSON.parse(value);
      } catch {
        throw new Error("JSON 格式不正确，请检查引号、逗号和括号。");
      }
      const { storage } = getApplicationDataClient();
      await storage.setItem(target, parsed);
      setStored({
        key: target,
        value: await storage.getItem(target),
        exists: true,
      });
      await listKeys();
      setMessage("数据已保存，并从宿主重新读取。");
    });
  const read = () =>
    run("读取数据", async () => {
      const target = storageKey();
      const { storage } = getApplicationDataClient();
      const allKeys = await storage.keys();
      const exists = allKeys.includes(target);
      setStored({ key: target, value: await storage.getItem(target), exists });
      setKeys(allKeys.filter((item) => item.startsWith(prefix)).sort());
      setMessage(
        exists ? "已读取宿主中保存的数据。" : "这个示例键还没有保存数据。",
      );
    });
  const remove = () =>
    run("移除数据", async () => {
      const target = storageKey();
      await getApplicationDataClient().storage.removeItem(target);
      setStored({ key: target, value: null, exists: false });
      await listKeys();
      setMessage("已移除此示例键。");
    });
  const reload = () =>
    run("刷新工作区", async () => {
      setWorkspaces(await getApplicationDataClient().workspaces.list());
    });
  useEffect(() => {
    if (tab === "workspaces") void reload();
  }, [tab]);
  const create = () =>
    run("选择目录", async () => {
      const workspace = await getApplicationDataClient().workspaces.create({
        name: name.trim(),
      });
      if (!workspace) {
        setMessage("已取消目录选择，未创建工作区。");
        return;
      }
      setWorkspaces(await getApplicationDataClient().workspaces.list());
      setMessage("已登记工作区：" + workspace.name);
    });
  return (
    <>
      <PageHeading
        title="让应用记住自己的状态"
        description="保存一段 JSON，再读取它；为应用选择独立的业务工作区。"
      />
      <div className="showcase-tabs" aria-label="数据能力">
        <button
          type="button"
          aria-pressed={tab === "storage"}
          disabled={!!busy}
          onClick={() => setTab("storage")}
        >
          <Database />
          业务存储
        </button>
        <button
          type="button"
          aria-pressed={tab === "workspaces"}
          disabled={!!busy}
          onClick={() => setTab("workspaces")}
        >
          <FolderOpen />
          应用工作区
        </button>
      </div>
      {tab === "storage" ? (
        <div className="showcase-split-panel">
          <section className="showcase-panel-body" aria-label="编辑示例数据">
            <h2>写入一段业务数据</h2>
            <p className="showcase-muted">
              在 Mewvis 中跨重启保留；开发预览使用内存，刷新页面后清空。
            </p>
            <label className="showcase-field-label" htmlFor="demo-storage-key">
              示例键名
            </label>
            <div className="showcase-prefixed-input">
              <span>{prefix}</span>
              <input
                id="demo-storage-key"
                value={key}
                maxLength={128}
                disabled={!!busy}
                onChange={(event) => setKey(event.target.value)}
              />
            </div>
            <label
              className="showcase-field-label"
              htmlFor="demo-storage-value"
            >
              JSON 数据
            </label>
            <textarea
              id="demo-storage-value"
              className="showcase-editor"
              spellCheck={false}
              value={value}
              rows={8}
              disabled={!!busy}
              onChange={(event) => setValue(event.target.value)}
            />
            <div className="showcase-actions">
              <button
                type="button"
                className="showcase-button is-primary"
                disabled={!!busy}
                onClick={() => void save()}
              >
                <Save />
                保存数据
              </button>
              <button
                type="button"
                className="showcase-button"
                disabled={!!busy}
                onClick={() => void read()}
              >
                <RefreshCw />
                读取数据
              </button>
              <button
                type="button"
                className="showcase-text-button"
                disabled={!!busy}
                onClick={() => void remove()}
              >
                <Trash2 />
                移除此键
              </button>
            </div>
          </section>
          <section
            className="showcase-panel-body showcase-panel-result"
            aria-label="存储结果"
          >
            <h2>宿主中保存了什么</h2>
            <p className="showcase-muted">示例只读写以 {prefix} 开头的键。</p>
            {stored ? (
              <>
                <p className="showcase-mono showcase-muted">{stored.key}</p>
                <pre className="showcase-json">
                  {stored.exists
                    ? JSON.stringify(stored.value, null, 2)
                    : "尚无保存的数据"}
                </pre>
              </>
            ) : (
              <div className="showcase-empty">
                <Database aria-hidden="true" />
                <p>点击保存或读取，查看实际数据。</p>
              </div>
            )}
            {!!keys.length && (
              <div className="showcase-saved-keys">
                <h3>已保存的示例键</h3>
                {keys.map((item) => (
                  <button
                    type="button"
                    className="showcase-text-button"
                    disabled={!!busy}
                    key={item}
                    onClick={() => {
                      setKey(item.slice(prefix.length));
                      setStored(undefined);
                      setMessage("");
                    }}
                  >
                    {item.slice(prefix.length)}
                  </button>
                ))}
              </div>
            )}
          </section>
        </div>
      ) : (
        <section
          className="showcase-panel-body showcase-panel"
          aria-label="应用工作区"
        >
          <div className="showcase-inline-heading">
            <div>
              <h2>应用自己的工作区</h2>
              <p className="showcase-muted">
                只列出当前应用登记的目录。开发预览展示虚拟目录。
              </p>
            </div>
            <button
              type="button"
              className="showcase-button"
              disabled={!!busy}
              onClick={() => void reload()}
            >
              <RefreshCw />
              刷新
            </button>
          </div>
          <ul className="showcase-workspace-list">
            {workspaces.map((workspace) => (
              <li key={workspace.id}>
                <FolderOpen aria-hidden="true" />
                <div>
                  <strong>
                    {workspace.name}
                    {workspace.isDefault && (
                      <span className="showcase-small-tag">默认</span>
                    )}
                  </strong>
                  <code>{workspace.path}</code>
                </div>
              </li>
            ))}
          </ul>
          {!workspaces.length && !busy && (
            <p className="showcase-muted">尚未加载工作区，点击刷新重试。</p>
          )}
          <div className="showcase-workspace-create">
            <label
              className="showcase-field-label"
              htmlFor="demo-workspace-name"
            >
              新工作区名称
            </label>
            <div className="showcase-actions">
              <input
                id="demo-workspace-name"
                value={name}
                maxLength={512}
                disabled={!!busy}
                onChange={(event) => setName(event.target.value)}
              />
              <button
                type="button"
                className="showcase-button is-primary"
                disabled={!!busy || !name.trim()}
                onClick={() => void create()}
              >
                <Plus />
                选择目录并创建
              </button>
            </div>
          </div>
        </section>
      )}
      {busy && (
        <p className="showcase-muted" role="status">
          正在{busy}…
        </p>
      )}
      <Feedback error={error} message={message} />
      <CodeExample code={dataCode} />
    </>
  );
}
