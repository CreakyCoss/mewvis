import { ArrowRight, X } from "lucide-react";
import {
  ASSET_KINDS,
  type FilmProject,
  type FilmEpisode,
  type FilmShot,
  type FlowStep,
} from "./model";
export function ReferencePanel({
  project,
  episode,
  shot,
  onClose,
  onOpenStep,
}: {
  project: FilmProject;
  episode: FilmEpisode;
  shot?: FilmShot;
  onClose: () => void;
  onOpenStep: (step: FlowStep) => void;
}) {
  const assets = shot
    ? project.assets.filter(
        (a) =>
          a.id === shot.sceneId ||
          shot.characterIds.includes(a.id) ||
          a.id === shot.speakerId,
      )
    : [];
  return (
    <aside className="film-reference-panel" aria-label="当前创作参考">
      <header>
        <strong>参考资料</strong>
        <button
          className="film-icon-button"
          aria-label="关闭参考资料"
          onClick={onClose}
        >
          <X size={18} />
        </button>
      </header>
      <div className="film-reference-content">
        <p className="film-reference-context">
          {shot ? `当前镜头 · ${shot.title}` : episode.title}
        </p>
        <section>
          <h3>本集剧本</h3>
          <p className="film-reference-script">
            {episode.script || "本集还没有剧本。"}
          </p>
          <button
            className="film-reference-link"
            onClick={() => onOpenStep("script")}
          >
            到剧本创作编辑
            <ArrowRight size={14} />
          </button>
        </section>
        <section>
          <h3>关联素材</h3>
          {assets.length ? (
            assets.map((asset) => (
              <div className="film-reference-asset" key={asset.id}>
                <small>{ASSET_KINDS[asset.kind]}</small>
                <strong>{asset.name}</strong>
                <p>{asset.description || "设定待补充"}</p>
              </div>
            ))
          ) : (
            <p className="film-muted">当前镜头还没有关联素材。</p>
          )}
          <button
            className="film-reference-link"
            onClick={() => onOpenStep("assets")}
          >
            到素材准备编辑
            <ArrowRight size={14} />
          </button>
        </section>
        <section>
          <h3>视觉风格</h3>
          <p>{project.style || "视觉风格待补充"}</p>
          <small>画面比例 {project.aspectRatio}</small>
          <button
            className="film-reference-link"
            onClick={() => onOpenStep("settings")}
          >
            到项目设定编辑
            <ArrowRight size={14} />
          </button>
        </section>
      </div>
    </aside>
  );
}
