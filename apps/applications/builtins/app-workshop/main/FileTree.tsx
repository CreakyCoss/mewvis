import { FolderOpen } from "lucide-react";
import { FileIcon } from "./components";

type Row = { path: string; name: string; depth: number; folder: boolean };
function rows(files: string[], prefix = "", depth = 0): Row[] {
  const folders = new Set<string>();
  const leaves: Row[] = [];
  for (const path of files) {
    if (!path.startsWith(prefix)) continue;
    const rest = path.slice(prefix.length);
    const slash = rest.indexOf("/");
    if (slash >= 0) folders.add(rest.slice(0, slash));
    else leaves.push({ path, name: rest, depth, folder: false });
  }
  return [
    ...[...folders]
      .sort()
      .flatMap((name) => [
        { path: prefix + name, name, depth, folder: true },
        ...rows(files, prefix + name + "/", depth + 1),
      ]),
    ...leaves.sort((a, b) => a.name.localeCompare(b.name)),
  ];
}

export function FileTree({
  files,
  selected,
  disabled,
  select,
}: {
  files: string[];
  selected: string;
  disabled: boolean;
  select(path: string): void;
}) {
  return (
    <>
      <div className="wk-folder">
        <FolderOpen />
        source
      </div>
      <nav aria-label="源码文件">
        {rows(files, "", 1).map((row) =>
          row.folder ? (
            <div
              key={row.path}
              className="wk-folder"
              style={{ paddingLeft: 12 + row.depth * 14 }}
            >
              <FolderOpen />
              {row.name}
            </div>
          ) : (
            <button
              key={row.path}
              aria-label={row.path}
              title={row.path}
              aria-pressed={selected === row.path}
              className={selected === row.path ? "is-selected" : ""}
              disabled={disabled}
              style={{ paddingLeft: 12 + row.depth * 14 }}
              onClick={() => select(row.path)}
            >
              <FileIcon />
              <span>{row.name}</span>
            </button>
          ),
        )}
      </nav>
    </>
  );
}
