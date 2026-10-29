import type { Project } from "../../../app/projects/model";
import type { DoudizhuModel } from "../model";
export function DoudizhuVersions({
  project,
  name,
  setName,
  disabled,
  save,
  restore,
}: {
  project: Project<DoudizhuModel>;
  name: string;
  setName(value: string): void;
  disabled: boolean;
  save(): void;
  restore(id: string): void;
}) {
  return (
    <section className="page-content">
      <div className="page-heading">
        <h1>规则版本</h1>
      </div>
      <section className="settings-section">
        <label className="form-field">
          版本名称
          <input
            aria-label="斗地主版本名称"
            maxLength={60}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <button
          className="button"
          disabled={!name.trim() || project.versions.length >= 10 || disabled}
          onClick={save}
        >
          保存当前规则版本
        </button>
      </section>
      {project.versions.map((v) => (
        <section className="settings-section" key={v.id}>
          <h2>{v.name}</h2>
          <p>{new Date(v.createdAt).toLocaleString()}</p>
          <button className="button" onClick={() => restore(v.id)}>
            复制回草稿
          </button>
        </section>
      ))}
    </section>
  );
}
