import { Copy, GitBranch, Layers3, Save } from "lucide-react";
import type { Version } from "../../projects/model";
import { type Project } from "../../projects/model";

export function VersionsView({
  project,
  disabled,
  saveVersion,
  restore,
}: {
  project: Project;
  disabled: boolean;
  saveVersion(): void;
  restore(version: Version): void;
}) {
  const model = project.model;
  return (
    <section className="page-content">
      <div className="page-heading">
        <div>
          <h1>模型版本</h1>
          <p>将一次设计冻结下来，再放心尝试新的数值。</p>
        </div>
        <button
          className="button primary"
          disabled={disabled}
          onClick={saveVersion}
        >
          <Save size={17} />
          保存版本
        </button>
      </div>
      {!project.versions.length && (
        <div className="empty">
          <Layers3 size={34} />
          <h2>还没有命名版本</h2>
          <p>草稿会自动保存；命名版本保留一份独立的规则快照。</p>
        </div>
      )}
      {project.versions.map((v) => (
        <article className="version-row" key={v.id}>
          <span className="node-icon">
            <GitBranch size={20} />
          </span>
          <div>
            <h2>{v.name}</h2>
            <p>
              {v.model.actions.length} 个行动 · {v.model.goals.length} 个目标 ·{" "}
              {new Date(v.createdAt).toLocaleString("zh-CN")}
            </p>
            <small>
              {JSON.stringify(v.model) === JSON.stringify(model)
                ? "与当前草稿一致"
                : "与当前草稿不同，原版本已保留"}
            </small>
          </div>
          <button className="button" onClick={() => restore(v)}>
            <Copy size={16} />
            复制为草稿
          </button>
        </article>
      ))}
    </section>
  );
}
