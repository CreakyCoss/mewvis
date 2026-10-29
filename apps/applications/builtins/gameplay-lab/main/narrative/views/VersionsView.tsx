import { Save } from "lucide-react";
import { type Project } from "../../projects/model";
import { copy } from "../../shared/utils";
import { type NarrativeModel } from "../model";

export function VersionsView({
  project,
  disabled,
  saveVersion,
  patch,
}: {
  project: Project<NarrativeModel>;
  disabled: boolean;
  saveVersion(): void;
  patch(change: (project: Project<NarrativeModel>) => void): void;
}) {
  return (
    <section className="page-content">
      <div className="page-heading">
        <div>
          <h1>策划版本</h1>
          <p>冻结完整叙事规则、玩法方向和设计说明。</p>
        </div>
        <button
          className="button primary"
          disabled={disabled}
          onClick={saveVersion}
        >
          <Save size={15} />
          保存版本
        </button>
      </div>
      {project.versions.map((v) => (
        <article className="version-row" key={v.id}>
          <div>
            <h2>{v.name}</h2>
            <p>
              {v.model.nodes.length} 段剧情 · {v.model.characters.length} 位人物
              · {new Date(v.createdAt).toLocaleString()}
            </p>
          </div>
          <button
            className="button"
            onClick={() =>
              patch((p) => {
                p.model = copy(v.model);
                p.direction = v.direction;
                p.simulator = copy(v.simulator);
                p.brief = copy(v.brief);
              })
            }
          >
            复制为草稿
          </button>
        </article>
      ))}
    </section>
  );
}
