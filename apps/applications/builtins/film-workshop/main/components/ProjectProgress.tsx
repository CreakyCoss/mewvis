import { ArrowRight, ChevronDown } from "lucide-react";
import type { FlowStep } from "../model";
import type { ProjectProgress as Summary } from "../progress";

export function ProjectProgress({
  summary,
  comic,
  busy,
  onOpenEpisode,
}: {
  summary: Summary;
  comic: boolean;
  busy: boolean;
  onOpenEpisode: (episodeId: string, step: FlowStep) => void;
}) {
  const metrics = [
    {
      label: "已填写剧本",
      count: summary.scripts,
      total: summary.episodes.length,
      unit: "集",
    },
    {
      label: "已选画面",
      count: summary.visuals,
      total: summary.shots,
      unit: "镜",
      empty: "暂无分镜",
    },
    ...(!comic
      ? [
          {
            label: "已选配音",
            count: summary.audio,
            total: summary.spoken,
            unit: "镜",
            empty: "暂无台词",
          },
        ]
      : []),
    {
      label: comic ? "已有导出" : "已有成片",
      count: summary.exports,
      total: summary.episodes.length,
      unit: "集",
    },
  ];
  return (
    <section className="film-project-progress" aria-label="全项目产出概览">
      <header>
        <h4>全项目产出</h4>
        <span>汇总全部 {summary.episodes.length} 集</span>
      </header>
      <dl className={`film-project-metrics${comic ? " is-comic" : ""}`}>
        {metrics.map((metric) => (
          <div key={metric.label}>
            <dt>{metric.label}</dt>
            <dd>
              {metric.total ? (
                <>
                  <strong>{metric.count}</strong>
                  <span>
                    / {metric.total} {metric.unit}
                  </span>
                </>
              ) : (
                <span className="film-metric-empty">{metric.empty}</span>
              )}
            </dd>
          </div>
        ))}
      </dl>
      <details className="film-episode-progress">
        <summary>
          查看分集进度
          <ChevronDown size={14} />
        </summary>
        <div className="film-episode-progress-list">
          {summary.episodes.map((episode, index) => (
            <article key={episode.id}>
              <header>
                <span>{String(index + 1).padStart(2, "0")}</span>
                <div>
                  <h5>{episode.title}</h5>
                  <small>{episode.shots} 个镜头</small>
                </div>
              </header>
              <dl className={comic ? "is-comic" : undefined}>
                {[
                  {
                    label: "剧本",
                    value: episode.script ? "已填写" : "未填写",
                    step: "script",
                  },
                  {
                    label: "画面",
                    value: episode.shots
                      ? `${episode.visuals} / ${episode.shots} 镜`
                      : "暂无分镜",
                    step: "storyboard",
                  },
                  ...(!comic
                    ? [
                        {
                          label: "视频",
                          value: episode.shots
                            ? `${episode.videos} / ${episode.shots} 镜`
                            : "暂无分镜",
                          step: "video",
                        },
                        {
                          label: "配音",
                          value: episode.spoken
                            ? `${episode.audio} / ${episode.spoken} 镜`
                            : "暂无台词",
                          step: "dubbing",
                        },
                      ]
                    : []),
                  {
                    label: comic ? "导出" : "成片",
                    value: episode.exported ? "已有导出" : "暂无导出",
                    step: "delivery",
                  },
                ].map((metric) => (
                  <div key={metric.label}>
                    <dt>{metric.label}</dt>
                    <dd>
                      <button
                        disabled={busy}
                        aria-label={`打开第 ${index + 1} 集${metric.label}`}
                        onClick={() =>
                          onOpenEpisode(episode.id, metric.step as FlowStep)
                        }
                      >
                        {metric.value}
                      </button>
                    </dd>
                  </div>
                ))}
              </dl>
              <button
                className="film-icon-button"
                disabled={busy}
                aria-label={`打开第 ${index + 1} 集 ${episode.title}`}
                title="打开分集"
                onClick={() =>
                  onOpenEpisode(
                    episode.id,
                    episode.shots ? "storyboard" : "script",
                  )
                }
              >
                <ArrowRight size={16} />
              </button>
            </article>
          ))}
        </div>
      </details>
    </section>
  );
}
