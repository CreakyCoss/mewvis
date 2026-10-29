import {
  NativeSelect,
  NativeSelectOption,
} from "design-system/components/ui/native-select";
import { FolderOpen, RotateCcw } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  defaultFramework,
  frameworkForSimulator,
  gameTypes,
  type FrameworkId,
  type GameTypeId,
} from "../../../frameworks/catalog";
import {
  exampleSimulator,
  simulatorName,
} from "../../../frameworks/numeric-runtime";
import { ApplicationForm } from "../../../shared/components/Form";
import { type SimulatorRef } from "../../../shared/contracts";
import { templates, type TemplateId } from "../examples";
import { type AnyProject, type Project } from "../model";
import { projectDirectory, projectFile } from "../paths";
import { projectRepository } from "../repository";
import { FrameworkPicker } from "./FrameworkPicker";
import { frameworkCreation } from "../../../frameworks/creation";

const message = (error: unknown) =>
  error instanceof Error ? error.message : String(error);
export function ProjectCreateForm({
  created,
  close,
  busyChanged,
  beforeCreate,
}: {
  created(project: AnyProject): void;
  close(): void;
  busyChanged(busy: boolean): void;
  beforeCreate(): Promise<void>;
}) {
  const [name, setName] = useState("");
  const [presetId, setPresetId] = useState("");
  const [gameType, setGameType] = useState<GameTypeId>("card");
  const [direction, setDirection] = useState<FrameworkId | null>(
    "card-scoring",
  );
  const creation = frameworkCreation(direction);
  const selectedPreset = creation?.presets.some((p) => p.id === presetId)
    ? presetId
    : creation?.presets[0]?.id;
  const availableExamples = templates.filter(
    (t) =>
      frameworkForSimulator(exampleSimulator(t.id as TemplateId)) === direction,
  );
  function chooseType(id: GameTypeId) {
    setGameType(id);
    const framework = defaultFramework(id);
    setDirection(framework.id);
    setSimulator(framework.simulator);
    setSource("blank");
    setTemplateId(id === "card" ? "combination" : "development");
  }
  function chooseRuntime(ref: SimulatorRef | null, id: FrameworkId | null) {
    setSimulator(ref);
    setDirection(id);
    if (id !== frameworkForSimulator(exampleSimulator(exampleId)))
      setSource("blank");
  }
  const [source, setSource] = useState<"blank" | "example">("blank");
  const [simulator, setSimulator] = useState<SimulatorRef | null>(
    defaultFramework("card").simulator,
  );
  const [parent, setParent] = useState("");
  const [exampleId, setTemplateId] = useState<TemplateId>("combination");
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
        source,
        gameType,
        direction,
        ...(source === "example" ? { exampleId } : {}),
        simulator,
        ...(source === "blank" && selectedPreset
          ? { presetId: selectedPreset }
          : {}),
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
            placeholder="为你的游戏策划命名"
          />
        </label>
        <label className="form-field">
          游戏类型
          <NativeSelect
            aria-label="游戏类型"
            value={gameType}
            onChange={(event) => chooseType(event.target.value as GameTypeId)}
            size="sm"
          >
            {gameTypes.map((t) => (
              <NativeSelectOption key={t.id} value={t.id}>
                {t.name}
              </NativeSelectOption>
            ))}
            <NativeSelectOption disabled>
              棋盘经济 · 尚未提供
            </NativeSelectOption>
            <NativeSelectOption disabled>塔防 · 尚未提供</NativeSelectOption>
          </NativeSelect>
        </label>
        <label className="form-field">
          创建方式
          <NativeSelect
            aria-label="创建方式"
            value={source}
            onChange={(event) => {
              const value = event.target.value as "blank" | "example";
              setSource(value);
              if (value === "example") {
                const id = availableExamples[0]?.id as TemplateId | undefined;
                if (id) {
                  setTemplateId(id);
                  chooseRuntime(
                    exampleSimulator(id),
                    frameworkForSimulator(exampleSimulator(id)),
                  );
                }
              }
            }}
            size="sm"
          >
            <NativeSelectOption value="blank">从零开始</NativeSelectOption>
            <NativeSelectOption
              value="example"
              disabled={!availableExamples.length}
            >
              从示例创建{!availableExamples.length ? " · 当前框架暂无示例" : ""}
            </NativeSelectOption>
          </NativeSelect>
        </label>
        {source === "example" && (
          <label className="form-field">
            示例方案
            <NativeSelect
              aria-label="示例方案"
              value={exampleId}
              onChange={(event) => {
                const id = event.target.value as TemplateId;
                setTemplateId(id);
                chooseRuntime(
                  exampleSimulator(id),
                  frameworkForSimulator(exampleSimulator(id)),
                );
              }}
              size="sm"
            >
              {availableExamples.map((item) => (
                <NativeSelectOption key={item.id} value={item.id}>
                  {item.name}
                </NativeSelectOption>
              ))}
            </NativeSelect>
            <span className="hint">
              {templates.find((item) => item.id === exampleId)?.description}
            </span>
          </label>
        )}
        <FrameworkPicker
          gameType={gameType}
          value={direction}
          simulator={simulator}
          change={chooseRuntime}
        />
        {source === "blank" && !!creation?.presets.length && (
          <label className="form-field">
            起点预设
            <NativeSelect
              aria-label="起点预设"
              value={selectedPreset}
              onChange={(event) => setPresetId(event.target.value)}
              size="sm"
            >
              {creation.presets.map((preset) => (
                <NativeSelectOption key={preset.id} value={preset.id}>
                  {preset.name}
                </NativeSelectOption>
              ))}
            </NativeSelect>
            <span className="hint">
              {
                creation.presets.find((preset) => preset.id === selectedPreset)
                  ?.description
              }{" "}
              创建后可调整规则、模块与自己的内容。
            </span>
          </label>
        )}
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
          {source === "blank"
            ? (creation?.hint ?? "保留框架所需结构，从自己的内容开始设计。")
            : "示例方案将复制为自己的规则，之后的修改保存在项目目录。"}
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
  selectSimulator,
}: {
  project: Project;
  busy: boolean;
  rename(name: string): void;
  reload(): Promise<void>;
  reset(exampleId: TemplateId): Promise<void>;
  selectSimulator(
    ref: SimulatorRef | null,
    direction: FrameworkId | null,
  ): void;
}) {
  const [exampleId, setTemplateId] = useState<TemplateId | "">(
    project.exampleId ?? "",
  );
  const [confirm, setConfirm] = useState<"switch" | "reset" | "reload" | null>(
    null,
  );
  const [error, setError] = useState("");
  const selected = templates.find((item) => item.id === exampleId);
  const confirmation = useRef<HTMLElement>(null);
  useEffect(() => {
    if (confirm) confirmation.current?.scrollIntoView({ block: "nearest" });
  }, [confirm]);
  async function apply() {
    setError("");
    try {
      if (confirm === "reload") await reload();
      else {
        const target = confirm === "reset" ? project.exampleId : exampleId;
        if (!target) throw new Error("请先选择一个示例方案。");
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
          <p>管理项目名称、文件、示例来源和玩法模拟器。</p>
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
          <h2>玩法框架与兼容模拟器</h2>
          <FrameworkPicker
            schema={project.model.format}
            gameType={project.gameType}
            value={project.direction}
            simulator={project.simulator}
            change={selectSimulator}
          />
          <p className="hint">
            更换模拟器保留当前规则；不兼容项会在策划概览中提示。已有运行保留原模拟器快照。
          </p>
        </section>
        <section className="settings-section">
          <h2>示例方案</h2>
          <p className="hint">
            示例来源：
            {templates.find((item) => item.id === project.exampleId)?.name ??
              "从零开始"}
          </p>
          <label className="form-field">
            选择示例
            <NativeSelect
              value={exampleId}
              onChange={(event) => {
                setTemplateId(event.target.value as TemplateId);
                setConfirm(null);
              }}
              aria-label="选择示例"
              size="sm"
            >
              {!project.exampleId && (
                <NativeSelectOption value="">请选择示例方案</NativeSelectOption>
              )}
              {templates
                .filter(
                  (t) =>
                    (t.id === "combination" ? "card" : "systems") ===
                    project.gameType,
                )
                .map((item) => (
                  <NativeSelectOption value={item.id} key={item.id}>
                    {item.name}
                  </NativeSelectOption>
                ))}
            </NativeSelect>
          </label>
          {selected && <p className="hint">{selected.description}</p>}
          <div className="settings-actions">
            <button
              className="button"
              disabled={!exampleId || exampleId === project.exampleId}
              onClick={() => setConfirm("switch")}
            >
              应用所选示例
            </button>
            <button
              className="button"
              disabled={!project.exampleId}
              onClick={() => setConfirm("reset")}
            >
              <RotateCcw size={15} />
              重置当前示例
            </button>
          </div>
          <p className="hint">
            切换和重置会替换当前规则，并先备份到项目的 backups
            文件夹，并选择示例配套的模拟器；项目名称和命名版本保留。
          </p>
        </section>
        {confirm && (
          <section ref={confirmation} className="settings-confirm" role="alert">
            <h3>
              {confirm === "reload"
                ? "重新读取项目文件？"
                : confirm === "switch"
                  ? `应用“${selected?.name}”及其 ${simulatorName(exampleSimulator(exampleId as TemplateId))} 模拟器？`
                  : "重置当前示例？"}
            </h3>
            <p>
              {confirm === "reload"
                ? "将使用磁盘上的 JSON 替换当前编辑内容，尚未保存的修改会舍弃。"
                : "当前规则会先保存备份，再替换为内置示例的初始规则。已开始的对局继续使用原快照。"}
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
