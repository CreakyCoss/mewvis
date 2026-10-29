import type { Project } from "../../../app/projects/model";
import type { DoudizhuModel } from "../model";
export function DoudizhuProjectSettings({
  project,
  rename,
  confirm,
  setConfirm,
  reload,
}: {
  project: Project<DoudizhuModel>;
  rename(value: string): void;
  confirm: boolean;
  setConfirm(value: boolean): void;
  reload(): void;
}) {
  return (
    <section className="page-content">
      <div className="page-heading">
        <h1>项目设置</h1>
      </div>
      <section className="settings-section">
        <label className="form-field">
          项目名称
          <input
            aria-label="斗地主项目名称"
            maxLength={60}
            value={project.model.name}
            onChange={(e) => rename(e.target.value)}
          />
        </label>
        <label className="form-field">
          项目目录
          <input readOnly value={project.path} />
        </label>
        <label className="form-field">
          玩法框架
          <input readOnly value="斗地主 v1 · 三人叫分" />
        </label>
        <p className="hint">
          不同规则模型的框架需另建项目。规则保存在 models/core.json，对局保存在
          runs/；每局冻结规则和执行版本。
        </p>
        <button className="button" onClick={() => setConfirm(true)}>
          从项目文件重新读取
        </button>
        {confirm && (
          <div className="settings-confirm" role="alert">
            <p>重新读取会舍弃尚未保存的编辑。确认使用磁盘中的项目？</p>
            <button className="button" onClick={() => setConfirm(false)}>
              取消
            </button>
            <button className="button" onClick={reload}>
              确认重新读取
            </button>
          </div>
        )}
      </section>
    </section>
  );
}
