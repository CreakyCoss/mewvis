# Workspace Chat Component Boundaries

`components/page` is the orchestration layer. It owns cross-module state, persistence,
runtime coordination, and passes explicit props into feature modules.
Page-only hooks and orchestration helpers live next to `components/page/index.tsx` when
they are not reused outside this page.

Feature modules should keep their interaction boundary narrow:

- `chat`: conversation timeline, history actions, agent question UI, and composer controls.
- `file-workbench`: active file editing, markdown preview, file save/delete/discard actions.
- `context-panel`: right-side tools, including files, version shortcuts, and trace log details.
- `context-workbench`: context diagnostics, memory/session status, and manual context actions.
- `version-control`: worktree and history views for workspace version state.

Workspace shell chrome lives in `features/workspace/shell`. The settings entry surface
lives in `features/app/settings.tsx` and opens AI configuration pages/dialogs from `features/ai`.

Shared pure logic belongs in `../utils`. Cross-module state transitions should stay in
`components/page` until they can be extracted as a cohesive hook with a clear owner.

Zustand stores are used as view-model bridges for broad panel surfaces that otherwise
need long prop lists, such as `chat` and `context-panel`. They should hold the current
panel state plus UI commands, while persistence, runtime subscriptions, and multi-step
side effects stay in `components/page` hooks.
