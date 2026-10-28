import { useId } from "react";
import { ArrowRight, Layers3, Network, Plus } from "lucide-react";
import type { Project } from "./storage";

function ProjectRow({
  project,
  disabled,
  open,
}: {
  project: Project;
  disabled: boolean;
  open(id: string): void;
}) {
  const id = useId();
  const { model } = project;
  const Icon = model.collections.length ? Layers3 : Network;
  return (
    <li>
      <button
        className="project-row"
        disabled={disabled}
        onClick={() => open(project.id)}
        aria-labelledby={`${id}-name`}
        aria-describedby={`${id}-description ${id}-details`}
      >
        <span className="project-row-icon" aria-hidden="true">
          <Icon size={18} />
        </span>
        <span className="project-row-copy">
          <span className="project-row-name" id={`${id}-name`}>
            {model.name.trim() || "未命名项目"}
          </span>
          <span className="project-row-description" id={`${id}-description`}>
            {model.description || "从核心规则开始建立策略模型。"}
          </span>
        </span>
        <span className="project-row-details" id={`${id}-details`}>
          <span>{model.actions.length} 个行动</span>
          <span aria-hidden="true">·</span>
          <span>{model.goals.length} 个目标</span>
        </span>
        <ArrowRight
          className="project-row-arrow"
          size={16}
          aria-hidden="true"
        />
      </button>
    </li>
  );
}

export function ProjectLibrary({
  projects,
  ready,
  create,
  open,
}: {
  projects: Project[];
  ready: boolean;
  create(): void;
  open(id: string): void;
}) {
  return (
    <section
      className="project-library"
      aria-labelledby="project-library-title"
      aria-busy={!ready}
    >
      <header className="library-heading">
        <h1 id="project-library-title">我的项目</h1>
        <button className="button primary" disabled={!ready} onClick={create}>
          <Plus size={16} aria-hidden="true" />
          新建项目
        </button>
      </header>
      <ul className="project-list">
        {projects.map((project) => (
          <ProjectRow
            key={project.id}
            project={project}
            disabled={!ready}
            open={open}
          />
        ))}
      </ul>
    </section>
  );
}
