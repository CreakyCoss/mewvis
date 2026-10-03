import {
  PRODUCT_CONFIG,
  APP_DISPLAY_NAME,
  PRODUCT_NAMESPACE,
} from "@mewvis/product-config";
import "./styles.css";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  BookOpen,
  Bot,
  ChevronRight,
  Database,
  Grid2X2,
  House,
  Link2,
  Menu,
  MessageCircle,
  PanelTop,
  ShieldCheck,
  Sparkles,
  Wrench,
  X,
  type LucideIcon,
} from "lucide-react";
import ChatLab, { type ChatPreset } from "./ChatLab";
import { ToolExample, inspectCode } from "./components/ToolExample";
import {
  CodeExample,
  ExampleRow,
  PageHeading,
  Section,
} from "./components/Example";
import { DataExamples, dataCode } from "./components/DataExamples";
import { ViewExample, viewCode } from "./components/ViewExample";
import { HostExamples, hostCode } from "./components/HostExamples";
import { Permissions } from "./components/Permissions";

type Page =
  | "overview"
  | "chat"
  | "tools"
  | "permissions"
  | "data"
  | "views"
  | "host"
  | "docs";
const navigation: { id: Page; label: string; icon: LucideIcon }[] = [
  { id: "chat", label: "AI 与对话", icon: MessageCircle },
  { id: "tools", label: "工具与技能", icon: Wrench },
  { id: "permissions", label: "权限与审批", icon: ShieldCheck },
  { id: "data", label: "数据与工作区", icon: Database },
  { id: "views", label: "内嵌视图", icon: PanelTop },
  { id: "host", label: "宿主集成", icon: Link2 },
];
const chatCode = [
  'import { getApplicationDataClient } from "@mewvis/app-sdk/data";',
  'import { getApplicationChatClient } from "@mewvis/app-sdk/chat";',
  'import { Chat } from "@mewvis/app-sdk/chat/react";',
  "",
  "const [workspace] = await getApplicationDataClient().workspaces.list();",
  "// 在用户点击操作中创建；重新打开时使用 openSession。",
  "const session = await getApplicationChatClient().createSession({",
  "  workspaceId: workspace.id,",
  '  sceneId: "assistant",',
  '  profile: { id: "assistant-v1", systemPrompt: "你是应用助手。" },',
  "});",
  "",
  "<Chat session={session} />",
].join("\n");

export default function App() {
  const [page, setPage] = useState<Page>("overview");
  const [menuOpen, setMenuOpen] = useState(false);
  const [chatVisited, setChatVisited] = useState(false);
  const [preset, setPreset] = useState<ChatPreset>();
  const content = useRef<HTMLElement>(null);
  const sidebar = useRef<HTMLElement>(null);
  const menuButton = useRef<HTMLButtonElement>(null);
  const navigate = useCallback((next: Page) => {
    if (next === "chat") setChatVisited(true);
    setPage(next);
    setMenuOpen(false);
  }, []);
  const returnOverview = useCallback(() => navigate("overview"), [navigate]);
  const openChat = (next?: ChatPreset) => {
    setPreset(next);
    navigate("chat");
  };
  useEffect(() => {
    content.current?.scrollTo({ top: 0 });
  }, [page]);
  useEffect(() => {
    if (!menuOpen) return;
    const buttons = Array.from(
      sidebar.current?.querySelectorAll("button") ?? [],
    );
    const first = buttons[0];
    const last = buttons.at(-1);
    (
      sidebar.current?.querySelector<HTMLButtonElement>(
        '[aria-current="page"]',
      ) ?? first
    )?.focus();
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
      if (
        event.key === "Tab" &&
        event.shiftKey &&
        document.activeElement === first
      ) {
        event.preventDefault();
        last?.focus();
      } else if (
        event.key === "Tab" &&
        !event.shiftKey &&
        document.activeElement === last
      ) {
        event.preventDefault();
        first?.focus();
      }
    };
    const resize = () => {
      if (window.innerWidth > 700) setMenuOpen(false);
    };
    window.addEventListener("keydown", close);
    window.addEventListener("resize", resize);
    return () => {
      window.removeEventListener("keydown", close);
      window.removeEventListener("resize", resize);
      menuButton.current?.focus();
    };
  }, [menuOpen]);
  const activeLabel =
    navigation.find((item) => item.id === page)?.label ??
    (page === "docs" ? "开发文档" : "能力总览");
  return (
    <div className="showcase-app">
      {menuOpen && (
        <button
          className="showcase-menu-scrim"
          type="button"
          aria-label="关闭导航菜单"
          tabIndex={-1}
          onClick={() => setMenuOpen(false)}
        />
      )}
      <aside
        id="showcase-navigation"
        ref={sidebar}
        className={"showcase-sidebar" + (menuOpen ? " is-open" : "")}
      >
        <button
          type="button"
          className="showcase-brand"
          onClick={() => navigate("overview")}
          aria-label="调试台 · 返回能力总览"
        >
          <Grid2X2 aria-hidden="true" />
          <span>
            <strong>调试台</strong>
            <span>应用能力实验室</span>
          </span>
        </button>
        <nav aria-label="应用能力导航">
          <button
            type="button"
            className="showcase-nav-item"
            aria-current={page === "overview" ? "page" : undefined}
            onClick={() => navigate("overview")}
          >
            <House aria-hidden="true" />
            能力总览
          </button>
          <p className="showcase-nav-label">探索能力</p>
          {navigation.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              className="showcase-nav-item"
              aria-current={page === id ? "page" : undefined}
              onClick={() => navigate(id)}
            >
              <Icon aria-hidden="true" />
              {label}
            </button>
          ))}
        </nav>
        <div className="showcase-nav-footer">
          <button
            type="button"
            className="showcase-nav-item"
            aria-current={page === "docs" ? "page" : undefined}
            onClick={() => navigate("docs")}
          >
            <BookOpen aria-hidden="true" />
            开发文档
            <ChevronRight className="showcase-nav-arrow" aria-hidden="true" />
          </button>
        </div>
      </aside>
      <div className="showcase-main" inert={menuOpen}>
        <header className="showcase-topbar">
          <button
            type="button"
            className="showcase-menu-toggle"
            ref={menuButton}
            aria-label={menuOpen ? "收起能力导航" : "展开能力导航"}
            aria-controls="showcase-navigation"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen(!menuOpen)}
          >
            {menuOpen ? <X /> : <Menu />}
          </button>
          <div className="showcase-breadcrumb">
            <span>应用</span>
            <span aria-hidden="true">/</span>
            <button type="button" onClick={() => navigate("overview")}>
              调试台
            </button>
            {page !== "overview" && (
              <>
                <span aria-hidden="true">/</span>
                <span>{activeLabel}</span>
              </>
            )}
          </div>
          <span className="showcase-topbar-note">应用 SDK · 交互示例</span>
        </header>
        <main
          className={"showcase-content" + (page === "chat" ? " is-chat" : "")}
          ref={content}
        >
          {page === "overview" && (
            <>
              <PageHeading
                title="应用能做什么？从这里试一试。"
                description="运行真实场景，观察结果，把能力接入你的应用。"
              />
              <ToolExample />
              <Section
                title="接下来，试试这些能力"
                description="选择一个主题，体验更多真实场景示例。"
              >
                <div className="showcase-example-list">
                  <ExampleRow
                    icon={MessageCircle}
                    title="与模型对话"
                    description="体验流式回复、停止生成与会话恢复"
                    tag="Chat"
                    onClick={() => openChat()}
                  />
                  <ExampleRow
                    icon={Database}
                    title="保存并恢复业务状态"
                    description="读写 JSON 数据，了解应用独立的数据存储"
                    tag="Data"
                    onClick={() => navigate("data")}
                  />
                  <ExampleRow
                    icon={PanelTop}
                    title="嵌入一个独立视图"
                    description="挂载界面、发送消息、释放实例"
                    tag="Views"
                    onClick={() => navigate("views")}
                  />
                </div>
              </Section>
            </>
          )}
          {page === "tools" && (
            <>
              <PageHeading
                title="让应用拥有自己的工具与技能"
                description="页面直接执行工具，也可以让 Agent 在对话中使用它们。"
              />
              <ToolExample />
              <Section
                title="在对话里继续体验"
                description="示例会填入输入框，由你确认发送。真实模型的执行过程会显示在对话中。"
              >
                <div className="showcase-example-list">
                  <ExampleRow
                    icon={Bot}
                    title="让 Agent 调用工具"
                    description="发送一段文本，观察工具调用和结构化返回"
                    tag="Tool"
                    onClick={() =>
                      openChat({
                        label: "Agent 工具调用",
                        text: `请调用 chat_playground_echo，text 设为“Hello ${APP_DISPLAY_NAME} 👋”，然后说明返回的文本和字符数。`,
                      })
                    }
                  />
                  <ExampleRow
                    icon={Sparkles}
                    title="用技能指导一次文本分析"
                    description="了解技能如何规定步骤，以及它与工具的区别"
                    tag="Skill"
                    onClick={() =>
                      openChat({
                        label: "技能驱动执行",
                        text: `请使用 chat-playground-text-inspection 技能，分析文本“Hello ${APP_DISPLAY_NAME} 👋”的字符数、UTF-8 字节数和 SHA-256，并解释字符数与字节数为什么不同。`,
                      })
                    }
                  />
                </div>
              </Section>
            </>
          )}
          {chatVisited && (
            <div hidden={page !== "chat"} className="showcase-chat-page">
              <PageHeading
                title="把对话带进你的应用"
                description="新建或恢复会话，体验流式回复、自定义界面和同一会话的双视图。"
              />
              {preset && (
                <p className="showcase-chat-preset">
                  当前示例：<strong>{preset.label}</strong> ·
                  连接会话后，点击「填入此示例」开始。
                </p>
              )}
              <ChatLab preset={preset} />
              <CodeExample code={chatCode} />
            </div>
          )}
          {page === "permissions" && <Permissions openChat={openChat} />}
          {page === "data" && <DataExamples />}
          {page === "views" && <ViewExample />}
          {page === "host" && <HostExamples onBack={returnOverview} />}
          {page === "docs" && (
            <>
              <PageHeading
                title="从体验到接入"
                description="用公开 SDK 组合应用能力。下面的最小示例与调试台使用相同的接口。"
              />
              <Section
                title="先声明需要的能力"
                description={`在 ${PRODUCT_CONFIG.files.appConfig} 中声明权限。清单权限、工具授权和 Agent 执行范围分别检查。`}
              >
                <CodeExample
                  open
                  title="应用配置"
                  code={[
                    'import { defineConfig } from "@mewvis/app-dev";',
                    "",
                    "export default defineConfig({",
                    '  displayName: "我的应用",',
                    '  permissions: ["chat", "application-data", "application-workspaces",',
                    '    "embedded-views", "open-external"],',
                    '  host: { tools: "./main/host/tools.ts", skills: "./main/host/skills.ts" },',
                    "});",
                  ].join("\n")}
                />
              </Section>
              <Section title="按需接入">
                <div className="showcase-doc-list">
                  <CodeExample title="调用宿主工具" code={inspectCode} />
                  <CodeExample title="创建应用对话" code={chatCode} />
                  <CodeExample title="保存和读取业务数据" code={dataCode} />
                  <CodeExample title="挂载内嵌视图" code={viewCode} />
                  <CodeExample title="复制与打开外部链接" code={hostCode} />
                </div>
              </Section>
              <p className="showcase-muted">
                完整协议与生命周期说明可在内置「文档中心」的应用开发章节查看。
              </p>
            </>
          )}
        </main>
      </div>
    </div>
  );
}
