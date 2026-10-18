import { useState } from "react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "design-system/components/ui/popover";
import { Check, ChevronDown, Trash2 } from "lucide-react";
import type { FilmMedia } from "../model";
import { Dialog } from "../components/Dialog";

export function MediaVersions({
  label,
  versions,
  selected,
  onSelect,
  onDetach,
}: {
  label: string;
  versions: FilmMedia[];
  selected?: FilmMedia;
  onSelect(id: string): void;
  onDetach(id: string): void;
}) {
  const [open, setOpen] = useState(false);
  const [removing, setRemoving] = useState<FilmMedia>();
  const version = versions.findIndex((media) => media.id === selected?.id) + 1;
  const kind =
    selected?.kind === "image"
      ? "图片"
      : selected?.kind === "video"
        ? "视频"
        : "配音";
  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            className="film-shot-version-trigger"
            aria-label={`${label}版本`}
          >
            {selected ? `${kind} v${version}` : "素材版本"}
            <ChevronDown size={13} />
          </button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          collisionPadding={12}
          className="film-shot-versions-popup"
          aria-label={`${label}版本`}
        >
          <h3>
            {label}版本 <small>{versions.length}</small>
          </h3>
          {!versions.length && <p>导入文件或生成素材后，可在这里切换版本。</p>}
          {versions
            .slice()
            .reverse()
            .map((media, index) => (
              <article key={media.id}>
                <button
                  className="film-shot-version-choice"
                  aria-label={`使用${label}版本 ${versions.length - index}`}
                  aria-pressed={selected?.id === media.id}
                  onClick={() => {
                    onSelect(media.id);
                    setOpen(false);
                  }}
                >
                  <strong>
                    v{versions.length - index}
                    <span>
                      {media.source === "generated" ? "生成" : "导入"}
                    </span>
                    {selected?.id === media.id && <Check size={13} />}
                  </strong>
                  <span className="film-shot-version-name" title={media.name}>
                    {media.name}
                  </span>
                  <small>{new Date(media.createdAt).toLocaleString()}</small>
                </button>
                <button
                  className="film-icon-button"
                  aria-label={`解除关联 ${media.name}`}
                  title="解除关联"
                  onClick={() => {
                    setOpen(false);
                    setRemoving(media);
                  }}
                >
                  <Trash2 size={14} />
                </button>
              </article>
            ))}
        </PopoverContent>
      </Popover>
      {removing && (
        <Dialog title="解除素材关联" onClose={() => setRemoving(undefined)}>
          <p>解除「{removing.name}」的关联？文件仍保留在项目工作目录中。</p>
          <footer>
            <button onClick={() => setRemoving(undefined)}>取消</button>
            <button
              className="film-danger"
              onClick={() => {
                onDetach(removing.id);
                setRemoving(undefined);
              }}
            >
              确认解除
            </button>
          </footer>
        </Dialog>
      )}
    </>
  );
}
