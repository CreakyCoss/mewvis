import { useEffect, useRef, useState, type FormEvent } from "react";
import { ApplicationForm } from "./Form";
import { FolderOpen, RotateCcw } from "lucide-react";
import { templates, type TemplateId } from "./fixtures";
import {
  projectDirectory,
  projectFile,
  projectRepository,
  type Project,
} from "./storage";

const message = (error: unknown) =>
  error instanceof Error ? error.message : String(error);
export function ProjectCreateForm({
  created,
  close,
  busyChanged,
  beforeCreate,
}: {
  created(project: Project): void;
  close(): void;
  busyChanged(busy: boolean): void;
  beforeCreate(): Promise<void>;
}) {
  const [name, setName] = useState("");
  const [parent, setParent] = useState("");
  const [templateId, setTemplateId] = useState<TemplateId>("development");
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const setWorking = (value: boolean) => {
    setBusy(value);
    busyChanged(value);
  };
  let target = "";
  try {
    if (name.trim() && parent.trim()) target = projectDirectory(parent, name);
  } catch {}
  async function chooseDirectory() {
    setWorking(true);
    setError("");
    try {
      const path = await projectRepository().selectDirectory();
      if (path) setParent(path);
    } catch (cause) {
      setError(message(cause));
    } finally {
      setWorking(false);
    }
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    setWorking(true);
    setError("");
    try {
      await beforeCreate();
      const project = await projectRepository().create({
        name,
        parent,
        templateId,
      });
      if (project) created(project);
    } catch (cause) {
      setError(message(cause));
    } finally {
      setWorking(false);
    }
  }
  return (
    <ApplicationForm onSubmit={(event) => void submit(event)}>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <fieldset disabled={busy} className="project-fields">
        <label className="form-field">
          项目名称
          <input
            required
            maxLength={60}
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="例如：资源与科研策略验证"
          />
        </label>
        <label className="form-field">
          策略模板
          <select
            value={templateId}
            onChange={(event) =>
              setTemplateId(event.target.value as TemplateId)
            }
          >
            {templates.map((item) => (
              <option value={item.id} key={item.id}>
                {item.name}
              </option>
            ))}
          </select>
          <span className="hint">
            {templates.find((item) => item.id === templateId)?.description}
          </span>
        </label>
        <div className="form-field">
          <label htmlFor="project-parent">项目父目录</label>
          <div className="path-input">
            <input
              id="project-parent"
              required
              value={parent}
              onChange={(event) => setParent(event.target.value)}
              placeholder="选择父目录，或输入完整路径"
            />
            <button
              type="button"
              className="button"
              onClick={() => void chooseDirectory()}
            >
              <FolderOpen size={16} />
              选择
            </button>
          </div>
        </div>
        {target && (
          <p className="project-target">
            将创建 <span>{target}</span>
          </p>
        )}
        <p className="hint">
          所选模板将复制为项目自己的 JSON，之后的修改保存在项目目录。
        </p>
        <footer>
          <button type="button" className="button" onClick={close}>
            取消
          </button>
          <button
            type="submit"
            className="button primary"
            disabled={!name.trim() || !parent.trim()}
          >
            {busy ? "正在创建…" : "创建项目"}
          </button>
        </footer>
      </fieldset>
    </ApplicationForm>
  );
}

export function ProjectSettings({
  project,
  busy,
  rename,
  reload,
  reset,
}: {
  project: Project;
  busy: boolean;
  rename(name: string): void;
  reload(): Promise<void>;
  reset(templateId: TemplateId): Promise<void>;
}) {
  const [templateId, setTemplateId] = useState<TemplateId | "">(
    project.templateId ?? "",
  );
  const [confirm, setConfirm] = useState<"switch" | "reset" | "reload" | null>(
    null,
  );
  const [error, setError] = useState("");
  const selected = templates.find((item) => item.id === templateId);
  const confirmation = useRef<HTMLElement>(null);
  useEffect(() => {
    if (confirm) confirmation.current?.scrollIntoView({ block: "nearest" });
  }, [confirm]);
  async function apply() {
    setError("");
    try {
      if (confirm === "reload") await reload();
      else {
        const target = confirm === "reset" ? project.templateId : templateId;
        if (!target) throw new Error("请先选择一个策略模板。");
        await reset(target);
      }
      setConfirm(null);
    } catch (cause) {
      setError(message(cause));
    }
  }
  return (
    <section className="page-content project-settings">
      <div className="page-heading">
        <div>
          <h1>项目设置</h1>
          <p>管理项目名称、文件和策略模板。</p>
        </div>
      </div>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <fieldset disabled={busy} className="project-fields">
        <section className="settings-section">
          <h2>基本信息</h2>
          <label className="form-field">
            项目名称
            <input
              required
              maxLength={60}
              value={project.model.name}
              onChange={(event) => rename(event.target.value)}
            />
          </label>
          <label className="form-field">
            项目目录
            <input readOnly value={project.path} />
          </label>
          <label className="form-field">
            模型文件
            <input readOnly value={projectFile(project.path)} />
          </label>
          <button className="button" onClick={() => setConfirm("reload")}>
            <FolderOpen size={16} />
            从项目文件重新读取
          </button>
        </section>
        <section className="settings-section">
          <h2>策略模板</h2>
          <p className="hint">
            当前模板：
            {templates.find((item) => item.id === project.templateId)?.name ??
              "自定义"}
          </p>
          <label className="form-field">
            选择模板
            <select
              value={templateId}
              onChange={(event) => {
                setTemplateId(event.target.value as TemplateId);
                setConfirm(null);
              }}
            >
              {!project.templateId && <option value="">请选择策略模板</option>}
              {templates.map((item) => (
                <option value={item.id} key={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
          {selected && <p className="hint">{selected.description}</p>}
          <div className="settings-actions">
            <button
              className="button"
              disabled={!templateId || templateId === project.templateId}
              onClick={() => setConfirm("switch")}
            >
              切换到所选模板
            </button>
            <button
              className="button"
              disabled={!project.templateId}
              onClick={() => setConfirm("reset")}
            >
              <RotateCcw size={15} />
              重置当前模板
            </button>
          </div>
          <p className="hint">
            切换和重置会替换当前规则，并先备份到项目的 backups
            文件夹；项目名称和命名版本保留。
          </p>
        </section>
        {confirm && (
          <section ref={confirmation} className="settings-confirm" role="alert">
            <h3>
              {confirm === "reload"
                ? "重新读取项目文件？"
                : confirm === "switch"
                  ? `切换为“${selected?.name}”？`
                  : "重置当前模板？"}
            </h3>
            <p>
              {confirm === "reload"
                ? "将使用磁盘上的 JSON 替换当前编辑内容，尚未保存的修改会舍弃。"
                : "当前规则会先保存备份，再替换为内置模板的初始规则。已开始的对局继续使用原快照。"}
            </p>
            <div className="settings-actions">
              <button className="button" onClick={() => setConfirm(null)}>
                取消
              </button>
              <button className="button primary" onClick={() => void apply()}>
                {busy ? "正在处理…" : "确认操作"}
              </button>
            </div>
          </section>
        )}
      </fieldset>
    </section>
  );
}
