# AID Studio

Source: https://github.com/gzxx-2025/aid-studio

Revision: `c8fc660dee2a79772a59a6ecdbf12e75120cee31` (2026-10-01).

The following files are adapted under the upstream MIT license:

| Upstream file                                                                       | Local adaptation                    |
| ----------------------------------------------------------------------------------- | ----------------------------------- |
| `frontend/web/components/studio/canvas/StudioScriptNodePreview.tsx`                 | `main/components/ScriptPreview.tsx` |
| `frontend/web/components/studio/canvas/StudioStatusBadge.tsx`                       | `main/components/StatusBadge.tsx`   |
| Workflow metadata in `frontend/web/components/studio/shell/StudioFlowLeftPanel.tsx` | `main/model.ts`                     |

The preview layout and status badge structure are retained. Next.js and Ant Design dependencies, clipboard implementation, global stores and upstream APIs are removed. Styles use Mewvis semantic theme tokens, and statuses distinguish planning readiness from unavailable media generation.

The upstream copyright, full MIT license and NOTICE are preserved in `LICENSE`, which the standard application packer includes in distributable artifacts. Upstream branding, official asset packs, media examples, admin system, billing and deployment scripts are not bundled.
