import {
  NativeSelect,
  NativeSelectOption,
} from "design-system/components/ui/native-select";
import { useEffect, useMemo, useRef, useState } from "react";
import { getApplicationDataClient } from "@mewvis/app-sdk/data";
import { getApplicationFileClient } from "@mewvis/app-sdk/files";
import {
  PROJECT_KINDS,
  MAX_PROJECT_BYTES,
  copyProject,
  createProject,
  validateProject,
  type FilmProject,
  type ProjectKind,
} from "./model";
import { createRepository } from "./repository";
import { exampleProject } from "./example";
import { Dialog } from "./components/Dialog";
import { Field } from "./components/Fields";
import { Workbench } from "./Workbench";
import { Library } from "./Library";
import { resumeView, type FilmView } from "./view-state";
import "./styles.css";
import "./studio.css";

export default function App() {
  const repository = useMemo(
    () =>
      createRepository(getApplicationDataClient().storage, {
        files: getApplicationFileClient(),
        workspaces: getApplicationDataClient().workspaces,
      }),
    [],
  );
  const [projects, setProjects] = useState<FilmProject[]>([]),
    [selectedId, setSelectedId] = useState("");
  const [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [views, setViews] = useState<Record<string, FilmView>>({});
  const [dialog, setDialog] = useState(false),
    [removing, setRemoving] = useState<FilmProject>();
  const [title, setTitle] = useState(""),
    [kind, setKind] = useState<ProjectKind>("comicDrama");
  const [directory, setDirectory] = useState("");
  const upload = useRef<HTMLInputElement>(null);
  const reload = async () => {
    setLoading(true);
    setError("");
    try {
      const loaded = await repository.list();
      const navigation = await Promise.all(
        loaded.map(
          async (project) =>
            [project.id, await repository.view(project)] as const,
        ),
      );
      setProjects(loaded);
      setViews(Object.fromEntries(navigation));
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error));
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    void reload();
  }, [repository]);
  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setError("");
    try {
      await action();
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };
  const remember = (project: FilmProject) =>
    setProjects((current) =>
      [project, ...current.filter((p) => p.id !== project.id)].sort(
        (a, b) => b.updatedAt - a.updatedAt,
      ),
    );
  const addProject = async (project: FilmProject) => {
    const attached = await repository.attach(
      project,
      dialog ? directory || undefined : undefined,
    );
    if (!attached) return;
    await repository.save(attached);
    remember(attached);
    setDialog(false);
    setSelectedId(project.id);
  };
  const create = () => {
    if (!busy && title.trim())
      void run(() => addProject(createProject(title, kind)));
  };
  const selected = projects.find((p) => p.id === selectedId);
  if (selected)
    return (
      <Workbench
        key={selected.id}
        initial={selected}
        repository={repository}
        initialView={resumeView(selected, views[selected.id])}
        onView={(view) =>
          setViews((current) => ({ ...current, [selected.id]: view }))
        }
        onSaved={remember}
        onBack={() => setSelectedId("")}
      />
    );
  return (
    <main className="film-app film-library">
      <Library
        projects={projects}
        views={views}
        loading={loading}
        busy={busy}
        onOpen={(id, view) => {
          if (view) setViews((current) => ({ ...current, [id]: view }));
          setSelectedId(id);
        }}
        onCreate={() => {
          setTitle("");
          setKind("comicDrama");
          setDirectory("");
          setDialog(true);
        }}
        onImport={() => upload.current?.click()}
        onExample={() => void run(() => addProject(exampleProject()))}
        onRemove={setRemoving}
      >
        <input
          ref={upload}
          className="film-visually-hidden"
          aria-label="上传影视项目 JSON"
          type="file"
          accept=".json,application/json"
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (!file) return;
            void run(async () => {
              if (file.size > MAX_PROJECT_BYTES)
                throw new Error("项目文件超过 16 MiB，请拆分项目后导入。");
              const project = copyProject(
                validateProject(JSON.parse(await file.text())),
              );
              await addProject(project);
            });
          }}
        />
        {error && (
          <div className="film-library-error" role="alert">
            <p>{error}</p>
            <button onClick={() => void reload()} disabled={busy || loading}>
              重新加载作品库
            </button>
          </div>
        )}
      </Library>
      {dialog && (
        <Dialog
          title="新建影视项目"
          onClose={() => {
            if (!busy) setDialog(false);
          }}
        >
          <div className="film-dialog-form">
            <Field label="项目名称">
              <input
                autoFocus
                required
                maxLength={120}
                value={title}
                placeholder="给你的故事一个名字"
                onChange={(e) => setTitle(e.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.nativeEvent.isComposing) {
                    event.preventDefault();
                    create();
                  }
                }}
              />
            </Field>
            <Field label="创作方向">
              <NativeSelect
                className="w-full"
                value={kind}
                onChange={(e) => setKind(e.target.value as ProjectKind)}
              >
                {Object.entries(PROJECT_KINDS).map(([key, label]) => (
                  <NativeSelectOption key={key} value={key}>
                    {label}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </Field>
            <p className="film-muted">
              先创建第一集，进入工作台后可以随时添加分集、调整风格和比例。
            </p>
            <Field
              label="工作目录"
              hint="剧本、素材和生成图片会保存在所选目录的项目子文件夹中。"
            >
              <div className="film-directory-field">
                <input
                  readOnly
                  value={directory}
                  placeholder="创建时选择工作目录"
                />
                <button
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    void getApplicationDataClient()
                      .workspaces.selectDirectory()
                      .then((path) => {
                        if (path) setDirectory(path);
                      })
                      .catch((reason) => setError(String(reason)))
                  }
                >
                  选择文件夹
                </button>
              </div>
            </Field>
            {error && (
              <p className="film-error" role="alert">
                {error}
              </p>
            )}
            <footer>
              <button
                type="button"
                disabled={busy}
                onClick={() => setDialog(false)}
              >
                取消
              </button>
              <button
                type="button"
                className="film-primary"
                disabled={busy || !title.trim()}
                onClick={create}
              >
                {busy ? "创建中…" : "创建项目"}
              </button>
            </footer>
          </div>
        </Dialog>
      )}
      {removing && (
        <Dialog
          title="删除项目"
          onClose={() => {
            if (!busy) setRemoving(undefined);
          }}
        >
          <p>
            删除「{removing.title}
            」从作品库中移除？工作目录中的项目文件、素材和历史助手会话会保留。
          </p>
          {error && (
            <p className="film-error" role="alert">
              {error}
            </p>
          )}
          <footer>
            <button disabled={busy} onClick={() => setRemoving(undefined)}>
              取消
            </button>
            <button
              className="film-danger"
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  await repository.remove(removing.id);
                  setProjects((items) =>
                    items.filter((p) => p.id !== removing.id),
                  );
                  setRemoving(undefined);
                })
              }
            >
              {busy ? "删除中…" : "确认删除"}
            </button>
          </footer>
        </Dialog>
      )}
    </main>
  );
}
