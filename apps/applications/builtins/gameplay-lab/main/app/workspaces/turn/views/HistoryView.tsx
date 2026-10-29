import { ChevronRight, FlaskConical, Play } from "lucide-react";
import { current } from "../../../../domains/turn/engine";
import { ComparisonBuilder } from "../../../../validation/experiments/ComparisonBuilder";
import { ComparisonResults } from "../../../../validation/experiments/ComparisonResults";
import { StrategyResults } from "../../../../validation/experiments/StrategyResults";
import { type PlaytestConfig } from "../../../../validation/playtest/config";
import {
  type Experiment,
  type Sample,
  type Trial,
} from "../../../../validation/records/records";
import { type Project } from "../../../projects/model";

export function HistoryView({
  project,
  config,
  configReady,
  configError,
  historyReady,
  historyError,
  busy,
  progress,
  experimentDisabled,
  experiments,
  trials,
  reload,
  cancel,
  experiment,
  previewSample,
  openTrial,
}: {
  project: Project;
  config: PlaytestConfig | null;
  configReady: boolean;
  configError: string;
  historyReady: boolean;
  historyError: string;
  busy: boolean;
  progress: string;
  experimentDisabled: boolean;
  experiments: Experiment[];
  trials: Trial[];
  reload(): void;
  cancel(): void;
  experiment(existing?: Experiment, proposed?: Experiment): void;
  previewSample(experiment: Experiment, sample: Sample): void;
  openTrial(trial: Trial): void;
}) {
  return (
    <section className="page-content">
      <div className="page-heading">
        <div>
          <h1>实验记录</h1>
          <p>在选定场景中，比较第一位参与者的策略与各自的目标结果。</p>
        </div>
        <div className="settings-actions">
          <button
            className="button"
            disabled={!!progress || busy}
            onClick={reload}
          >
            重新加载记录
          </button>
          <button
            className="button primary"
            disabled={
              !!progress ||
              experimentDisabled ||
              busy ||
              !historyReady ||
              !!configError
            }
            onClick={() => void experiment()}
          >
            <FlaskConical size={17} />
            运行策略对照
          </button>
        </div>
      </div>
      <p className="hint">
        实验使用“验证设置”中选择的种子范围和对照策略。各组使用相同初始配置；双人时另一位参与者的策略保持固定。
      </p>
      <p className="record-state" role="status">
        {historyReady
          ? "对局与实验自动保存到项目目录，每次决策和每局样本完成后写入。"
          : historyError
            ? "记录读取失败，可重新加载。"
            : "正在读取项目记录…"}
      </p>
      {historyError && (
        <div className="error-banner" role="alert">
          {historyError}
        </div>
      )}
      {progress && (
        <div className="notice-banner" role="status">
          正在运行：{progress}
          <button className="text-button" onClick={cancel}>
            取消，保留已完成结果
          </button>
        </div>
      )}
      {config && configReady && (
        <ComparisonBuilder
          key={project.id}
          project={project}
          config={config}
          disabled={!!progress || busy || !historyReady || !!configError}
          start={(value) => void experiment(undefined, value)}
        />
      )}
      {!experiments.some((e) => e.projectId === project.id) && (
        <div className="empty">
          <FlaskConical size={34} />
          <h2>从一个设计问题开始</h2>
          <p>先到“验证设置”选择策略，再运行参数和策略对照。</p>
        </div>
      )}
      {experiments
        .filter((e) => e.projectId === project.id)
        .map((e) =>
          e.comparison ? (
            <ComparisonResults
              key={e.id}
              experiment={e}
              busy={!!progress || busy || !historyReady}
              resume={() => void experiment(e)}
              preview={(sample) => previewSample(e, sample)}
            />
          ) : (
            <StrategyResults
              key={e.id}
              experiment={e}
              busy={!!progress || busy || !historyReady}
              resume={() => void experiment(e)}
              preview={(sample) => previewSample(e, sample)}
            />
          ),
        )}
      <h2 className="section-gap">已保存的对局</h2>
      {trials
        .filter((t) => t.projectId === project.id)
        .map((t) => (
          <button
            className="history-row"
            key={t.id}
            onClick={() => openTrial(t)}
          >
            <Play size={18} />
            <span>
              {t.run.model.name} · {t.run.entries.length - 1} 步
              <small className="history-meta">
                {new Date(t.updatedAt).toLocaleString()} · 种子 {t.run.seed}
              </small>
            </span>
            <span className="muted">
              {current(t.run).outcome ? "已结束" : "可继续"}
            </span>
            <ChevronRight size={17} />
          </button>
        ))}
      <p className="hint">
        记录保存在项目的 runs/ 和 experiments/
        中，包含规则快照、种子、决策、事件和最终状态。重新打开项目后可继续对局或逐步回放。
      </p>
    </section>
  );
}
