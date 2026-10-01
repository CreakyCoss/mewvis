import {
  ApplicationHeader,
  AppView,
  Busy,
  Empty,
  ErrorNotice,
} from "./components";
import type { BuildArtifact, ProjectSummary } from "./contracts";

export function UseView({
  project,
  artifact,
  loading,
  error,
  home,
  retry,
}: {
  project?: ProjectSummary;
  artifact: BuildArtifact | null;
  loading: boolean;
  error: string;
  home(): void;
  retry(): void;
}) {
  return (
    <>
      <ApplicationHeader name={project?.name} home={home} />
      <main
        className="wk-use"
        aria-label={`${project?.name ?? "小应用"}使用界面`}
      >
        {loading ? (
          <Busy text="正在打开保存的版本…" />
        ) : error ? (
          <div className="wk-empty">
            <ErrorNotice>{error}</ErrorNotice>
            <button className="wk-button" onClick={retry}>
              重新加载
            </button>
          </div>
        ) : artifact && project && artifact.projectId === project.id ? (
          <AppView projectId={project.id} artifact={artifact} scope="live" />
        ) : (
          <Empty
            title="还没有可使用的版本"
            action={
              <button className="wk-button" onClick={home}>
                返回应用工坊
              </button>
            }
          >
            返回工坊，在开发页构建并保存版本后再打开。
          </Empty>
        )}
      </main>
    </>
  );
}
