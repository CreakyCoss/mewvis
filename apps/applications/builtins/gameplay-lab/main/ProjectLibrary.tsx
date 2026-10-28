import { gameTypeName, directionDefinition } from "./catalog";
import { useId } from "react";
import { ArrowRight, FolderOpen, Layers3, Network, Plus } from "lucide-react";
import type { AnyProject } from "./storage";

function ProjectRow({
  project,
  disabled,
  open,
}: {
  project: AnyProject;
  disabled: boolean;
  open(id: string): void;
}) {
  const id = useId();
  const { model } = project;
  const Icon = project.simulator?.id === "card-combination" ? Layers3 : Network;
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
            {model.description || "从类型专属的内容与规则开始策划。"}
          </span>
          <span className="project-row-path" title={project.path}>
            {project.path}
          </span>
        </span>
        <span className="project-row-details" id={`${id}-details`}>
          <span>
            {gameTypeName(project.gameType)} ·{" "}
            {directionDefinition(project.direction)?.name ?? "待选方向"}
          </span>
          <span aria-hidden="true">·</span>
          <span>
            {model.format === "gameplay-narrative-v1"
              ? `${model.nodes.length} 段剧情`
              : `${model.actions.length} 个行动`}
          </span>
          <span aria-hidden="true">·</span>
          <span>
            {model.format === "gameplay-narrative-v1"
              ? `${model.characters.length} 位人物`
              : `${model.goals.length} 个目标`}
          </span>
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
  attach,
  errors,
}: {
  projects: AnyProject[];
  ready: boolean;
  create(): void;
  open(id: string): void;
  attach(): void;
  errors: string[];
}) {
  return (
    <section
      className="project-library"
      aria-labelledby="project-library-title"
      aria-busy={!ready}
    >
      <header className="library-heading">
        <h1 id="project-library-title">我的项目</h1>
        <div className="library-actions">
          <button className="button" disabled={!ready} onClick={attach}>
            <FolderOpen size={16} />
            打开项目
          </button>
          <button className="button primary" disabled={!ready} onClick={create}>
            <Plus size={16} aria-hidden="true" />
            新建项目
          </button>
        </div>
      </header>
      {errors.length > 0 && (
        <div className="form-error" role="alert">
          {errors.map((error) => (
            <p key={error}>{error}</p>
          ))}
          <p>原文件和记录已保留，可修复后重新打开项目。</p>
        </div>
      )}
      {ready && !projects.length && (
        <div className="empty library-empty">
          <FolderOpen size={32} />
          <h2>创建你的第一个项目</h2>
          <p>
            从零建立自己的策划，或复制示例方案；所有内容保存在你选择的项目目录。
          </p>
        </div>
      )}
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
