import { useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  createKnowledgeClient,
  type KnowledgeClient,
} from "@mewvis/knowledge-sdk";
import { createKnowledgeHttpTransport } from "@mewvis/knowledge-sdk/http";
import { KnowledgeApplication } from "@mewvis/knowledge-ui";
import { Button } from "design-system/components/ui/button";
import "./styles.css";

function App() {
  const [token, setToken] = useState("");
  const [draft, setDraft] = useState("");
  const [needsLogin, setNeedsLogin] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const client: KnowledgeClient = useMemo(
    () =>
      createKnowledgeClient(
        createKnowledgeHttpTransport({
          endpoint: new URL("/api/knowledge", window.location.origin).href,
          headers: () => (token ? { authorization: `Bearer ${token}` } : {}),
        }),
        { timeoutMs: 60_000 },
      ),
    [token],
  );
  if (needsLogin)
    return (
      <main className="knowledge-connect knowledge-ui">
        <h1>连接知识库</h1>
        <p>输入此服务的访问令牌，继续使用知识库。</p>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            setBusy(true);
            setError("");
            const next = createKnowledgeClient(
              createKnowledgeHttpTransport({
                endpoint: new URL("/api/knowledge", window.location.origin)
                  .href,
                headers: { authorization: `Bearer ${draft.trim()}` },
              }),
              { timeoutMs: 15_000 },
            );
            void next.service
              .describe()
              .then(
                () => {
                  setToken(draft.trim());
                  setDraft("");
                  setNeedsLogin(false);
                },
                () => setError("连接失败，请检查访问令牌和服务状态。"),
              )
              .finally(() => setBusy(false));
          }}
        >
          <label htmlFor="knowledge-token">访问令牌</label>
          <input
            id="knowledge-token"
            className="knowledge-input"
            type="password"
            autoComplete="off"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            required
          />
          {error && <p role="alert">{error}</p>}
          <Button type="submit" disabled={busy || !draft.trim()}>
            {busy ? "连接中…" : "连接"}
          </Button>
        </form>
      </main>
    );
  return (
    <KnowledgeApplication
      client={client}
      serviceLabel="个人资料服务"
      navigation
      preferences={localStorage}
      onUnauthenticated={() => {
        setToken("");
        setNeedsLogin(true);
      }}
    />
  );
}
createRoot(document.getElementById("root")!).render(<App />);
