export const focusSource = `import { useEffect, useState } from 'react';
import { getApplicationViewClient } from '@mewvis/app-sdk/views';
export default function App() {
  const [seconds, setSeconds] = useState(25 * 60);
  const [running, setRunning] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const client = getApplicationViewClient();
  useEffect(() => {
    let active = true;
    client
      .request('state.read', { key: 'timer' })
      .then((value) => {
        if (active) {
          if (value && typeof value.seconds === 'number') setSeconds(value.seconds);
          setLoaded(true);
        }
      })
      .catch(() => setLoaded(true));
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    if (!running) return;
    const timer = setInterval(
      () => setSeconds((value) => Math.max(0, value - 1)),
      1000,
    );
    return () => clearInterval(timer);
  }, [running]);
  useEffect(() => {
    if (loaded)
      void client.request('state.write', { key: 'timer', value: { seconds } });
  }, [seconds, loaded]);
  const time =
    String(Math.floor(seconds / 60)).padStart(2, '0') +
    ':' +
    String(seconds % 60).padStart(2, '0');
  return (
    <main className="focus-app">
      <div className="focus-circle">
        <h1>专注时间</h1>
        <strong>{time}</strong>
        <p>给眼前的事情，留一段完整的时间</p>
        <div className="focus-actions">
          <button onClick={() => setRunning(!running)}>
            {running ? '暂停' : '开始专注'}
          </button>
          <button
            className="reset"
            aria-label="重置计时"
            onClick={() => {
              setRunning(false);
              setSeconds(25 * 60);
            }}
          >
            重置
          </button>
        </div>
        <small>专注 25 分钟 · 休息 5 分钟</small>
      </div>
    </main>
  );
}
`;
export const focusStyle = `body{margin:0;background:var(--surface-raised);color:var(--foreground);font-family:system-ui,sans-serif}.focus-app{height:100vh;display:flex;align-items:center;justify-content:center;padding:24px;box-sizing:border-box}.focus-circle{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;width:min(420px,80vw);height:min(420px,80vw);border:9px solid var(--muted);border-top-color:var(--primary);border-right-color:var(--primary);border-radius:50%;box-sizing:border-box;flex-shrink:0}.focus-circle h1{margin:0;font-size:18px;font-weight:600}.focus-circle strong{font-size:clamp(38px,8vw,72px);line-height:1.1;letter-spacing:-2px}.focus-circle p{font-size:12px;color:var(--muted-foreground);margin:0;max-width:90%;text-align:center}.focus-actions{display:flex;gap:8px}.focus-actions button{border:1px solid var(--primary);padding:9px 16px;border-radius:7px;background:var(--primary);color:var(--primary-foreground);font:inherit;font-size:13px;cursor:pointer}.focus-actions button.reset{border-color:var(--border);background:var(--surface-raised);color:var(--muted-foreground)}.focus-circle small{font-size:11px;color:var(--muted-foreground)}@media(max-height:560px){.focus-circle{width:360px;height:360px;gap:16px}.focus-circle strong{font-size:64px}}@media(max-height:450px){.focus-circle{width:min(360px,78vw,calc(100vh - 48px));height:min(360px,78vw,calc(100vh - 48px));gap:12px}.focus-circle strong{font-size:64px}}`;

export async function seedExamples(tools) {
  const run = (name, args) => tools.get(name).execute(args);
  for (const [name, description, draft] of [
    ["日常记账", "记录每一笔收支。", true],
    ["读书记录", "记录阅读进度与喜欢的摘录。", false],
    ["灵感便签", "随手记录你的灵感。", false],
    ["专注计时器", "25 分钟专注，5 分钟休息。", false],
  ]) {
    let { project } = await run("workshop_create_project", {
      name,
      description,
    });
    if (draft) continue;
    const source =
      name === "专注计时器"
        ? focusSource
        : `import {useState} from 'react'; export default function App(){const [value,setValue]=useState('');return <main className="notes"><h1>${name}</h1><p>${description}</p><textarea aria-label="记录内容" value={value} onChange={event=>setValue(event.target.value)} placeholder="写下你的记录…" /></main>}`;
    const style =
      name === "专注计时器"
        ? focusStyle
        : `body{margin:0;font:15px/1.6 system-ui;color:var(--foreground);background:var(--surface-raised)}.notes{padding:36px;max-width:700px;margin:auto}.notes h1{font-size:24px}.notes p{color:var(--muted-foreground)}.notes textarea{width:100%;height:200px;font:inherit;padding:14px;border:1px solid var(--border);border-radius:8px;box-sizing:border-box;background:var(--background);color:var(--foreground)}`;
    ({ project } = await run("workshop_write_file", {
      workspaceId: project.id,
      path: "src/App.tsx",
      content: source,
      baseRevision: project.revision,
    }));
    ({ project } = await run("workshop_write_file", {
      workspaceId: project.id,
      path: "src/styles.css",
      content: style,
      baseRevision: project.revision,
    }));
    const result = await run("workshop_build", { workspaceId: project.id });
    if (!result.ok) throw new Error(JSON.stringify(result.diagnostics));
    await run("workshop_save_version", { workspaceId: project.id });
  }
}
