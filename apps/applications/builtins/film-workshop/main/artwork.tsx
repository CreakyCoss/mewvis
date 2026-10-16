import { Image } from "lucide-react";
import rainHost from "./assets/rain-host.jpg";
import rainWindow from "./assets/rain-window.jpg";
import rainCassette from "./assets/rain-cassette.jpg";
import warmTown from "./assets/warm-town.jpg";
import creativeDesk from "./assets/creative-desk.jpg";
import seasideLetter from "./assets/seaside-letter.jpg";
import type { FilmProject, FilmShot } from "./model";
import { LocalPreview } from "./components/MediaPanel";
import { mediaPath } from "./media";

export function ProjectCover({ project }: { project: FilmProject }) {
  const source =
    project.title === "海边来信"
      ? seasideLetter
      : project.title === "雨夜电台"
        ? rainHost
        : project.kind === "shortDrama"
          ? warmTown
          : creativeDesk;
  return (
    <figure className="film-cover-art">
      <img src={source} alt="" />
      <figcaption>创作示意</figcaption>
    </figure>
  );
}

export function ShotArtwork({
  project,
  shot,
}: {
  project: FilmProject;
  shot: FilmShot;
}) {
  const media = project.media?.find((item) => item.id === shot.imageMediaId);
  if (media && project.workspace)
    return (
      <figure className="film-shot-art">
        <LocalPreview filePath={mediaPath(project, media)} />
      </figure>
    );
  const source =
    project.title === "雨夜电台"
      ? (
          {
            雨中的窗: rainWindow,
            磁带开始转动: rainCassette,
            最后一次播音: rainHost,
          } as Record<string, string>
        )[shot.title]
      : undefined;
  return source ? (
    <figure className="film-shot-art">
      <img src={source} alt="" />
      <figcaption>分镜示意</figcaption>
    </figure>
  ) : (
    <div className="film-text-shot">
      <Image size={26} strokeWidth={1.3} />
      <span>文字分镜</span>
    </div>
  );
}
