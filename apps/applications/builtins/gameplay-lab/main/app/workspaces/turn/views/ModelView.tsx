import { Plus } from "lucide-react";
import { type Model } from "../../../../domains/turn/model";
import { type ReadinessIssue } from "../../../../shared/contracts";
import { type Project } from "../../../projects/model";
import { Graph } from "../rules/Graph";
import { Inspector } from "../rules/Inspector";
export function ModelView({
  project,
  issues,
  selected,
  list,
  setList,
  inspect,
  update,
  duplicate,
  remove,
  references,
  add,
  expandRules = false,
}: {
  project: Project;
  issues: ReadinessIssue[];
  selected: string;
  list: boolean;
  setList(list: boolean): void;
  inspect(id: string): void;
  update(change: (model: Model) => void): void;
  duplicate(id: string): void;
  remove(id: string): void;
  references: string[];
  add(): void;
  expandRules?: boolean;
}) {
  const model = project.model;
  return (
    <div className="model-layout">
      <section className="model-workspace">
        <header className="workspace-heading">
          <div>
            <h1>规则定义</h1>
            <p>查看规则如何影响状态与目标。</p>
          </div>
          <div className="workspace-tools">
            <div className="view-toggle" aria-label="模型视图">
              <button
                aria-pressed={list}
                className={list ? "active" : ""}
                onClick={() => setList(true)}
              >
                定义
              </button>
              <button
                aria-pressed={!list}
                className={!list ? "active" : ""}
                onClick={() => setList(false)}
              >
                关系
              </button>
            </div>
            <button className="button" onClick={add}>
              <Plus size={17} />
              添加定义
            </button>
          </div>
        </header>
        <Graph model={model} selected={selected} select={inspect} list={list} />
        {issues.length > 0 && (
          <div className="validation-errors" role="alert">
            {issues.slice(0, 5).map((i, n) => (
              <p key={n}>
                {i.path}：{i.message}
              </p>
            ))}
          </div>
        )}
      </section>
      <Inspector
        key={project.id + ":" + selected}
        defaultAdvanced={project.exampleId === null || expandRules}
        model={model}
        selected={selected}
        select={inspect}
        update={update}
        duplicate={duplicate}
        remove={remove}
        references={references}
      />
    </div>
  );
}
