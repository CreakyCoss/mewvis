# Workspace Chat Component Boundaries

`components/page` is the orchestration layer. It owns cross-module state, persistence,
runtime coordination, and passes explicit props into feature modules.
Page-only hooks and orchestration helpers live next to `components/page/index.tsx` when
they are not reused outside this page.

Feature modules should keep their interaction boundary narrow:

- `chat`: conversation timeline, history actions, agent question UI, and composer controls.

App shell chrome lives in `features/app`. Routed pages live in `features/pages`.
Settings surfaces live under `features/pages/settings`, while `features/ai/components`
is reserved for reusable AI tools such as ledger and file management.
The hub page lives under `features/pages/hub` and owns the office state surface outside
of chat sessions.
The reusable file tree, file editing dialog, version worktree, and version history panel lives in
`features/ai/components/file-manage`. It owns file editing and version-control state internally;
the workspace page only receives the file list needed by chat references and the active file
needed by agent prompt context.

Shared pure logic belongs in `../utils`. Cross-module state transitions should stay in
`components/page` until they can be extracted as a cohesive hook with a clear owner.

Zustand stores are used as view-model bridges for broad panel surfaces that otherwise
need long prop lists, such as `chat`. They should hold the current panel state plus UI
commands, while persistence, runtime subscriptions, and multi-step side effects stay in
`components/page` hooks.
