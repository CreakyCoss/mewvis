import { FrameworkPicker } from "../../../app/projects/components/FrameworkPicker";
import { type Project } from "../../../app/projects/model";
import { type NarrativeModel } from "../model";

export function SettingsView({
  project,
  update,
  patch,
  reload,
}: {
  project: Project<NarrativeModel>;
  update(change: (model: NarrativeModel) => void): void;
  patch(change: (project: Project<NarrativeModel>) => void): void;
  reload(): void;
}) {
  const model = project.model;
  return (
    <section className="page-content">
      <div className="page-heading">
        <div>
          <h1>项目设置</h1>
          <p>文字冒险 · 独立叙事模型 · 从零开始</p>
        </div>
      </div>
      <section className="settings-section">
        <label className="form-field">
          项目名称
          <input
            aria-label="项目名称"
            maxLength={60}
            value={model.name}
            onChange={(e) =>
              update((m) => {
                m.name = e.target.value;
              })
            }
          />
        </label>
        <label className="form-field">
          项目目录
          <input readOnly value={project.path} />
        </label>
        <p className="hint">
          规则文件：models/core.json。更换游戏类型需要新建对应类型的项目；不会将剧情自动转换为卡牌或数值规则。
        </p>
        <button className="button" onClick={reload}>
          从项目文件重新读取
        </button>
      </section>
      <section className="settings-section">
        <h2>玩法框架</h2>
        <FrameworkPicker
          gameType="narrative"
          value={project.direction}
          simulator={project.simulator}
          change={(ref, direction) =>
            patch((p) => {
              p.direction = direction;
              p.simulator = ref;
            })
          }
        />
      </section>
    </section>
  );
}
