# Learning course editor design QA

## Visual truth and implementation

- Source: the four approved mockups in `/Users/haowen.zheng/.codex/generated_images/01a0e752-de6c-7d82-af3c-08708fd86a63/`: `exec-e501a33b-1c6b-4123-af59-1975b415aa9b.png` (settings), `exec-dbdb064c-027d-4018-93a4-8e9035be7ec6.png` (outline), `exec-876ca34a-c0ee-44d6-bb12-8fe1389f4aab.png` (lesson), and `exec-18dc8aaa-aaf6-4d1e-9aa2-6d7d702b2291.png` (project). The later user instruction removes the outline edit controls shown in its mockup.
- Implementation: `http://127.0.0.1:5178/`, captured from the in-app browser. Screenshots and combined comparison images are in `/Users/haowen.zheng/.codex/visualizations/2026/09/28/01a0e752-de6c-7d82-af3c-08708fd86a63/qa-learning/`.
- Viewport: 1440 × 1024 CSS pixels at density 1 for desktop. Source images are 1487 × 1058 pixels; each source was resized to 1440 × 1024 for comparison with the 1440 × 1024 implementation captures. Responsive checks used 390 × 844 CSS pixels at density 1.
- States: settings, inline outline editing, lesson quiz tab with a populated question, and project editing with stage 02 expanded. Example text and generated AI responses in the source are illustrative; the implementation captures use test content and the assistant's empty state.

## Comparison evidence

| Page | Full view | Focused region |
| --- | --- | --- |
| Settings | `qa-learning/isle-qa-settings.png` | Full view was sufficient for form widths, level choices and the visible reference field. |
| Outline | `qa-learning/isle-qa-outline.png` | `qa-learning/isle-qa-focus-outline.png` |
| Lesson | `qa-learning/isle-qa-lesson-final.png` | `qa-learning/isle-qa-focus-lesson-final.png`; the final compact quiz is also in `qa-learning/isle-lesson-quiz-final2.png`. |
| Project | `qa-learning/isle-qa-project-final.png` | `qa-learning/isle-qa-focus-project-final.png`; the final horizontal stage fields are in `qa-learning/isle-project-final-layout.png`. |

## Findings

No actionable P0, P1 or P2 visual issues remain in the reviewed states. The editor fills the viewport, keeps four steps and a persistent right assistant, edits the outline directly, and limits the local popup to lesson content. The outline has no exit, cancel or complete-edit action; the course footer owns persistence.

- Typography: the implementation uses the app's existing Chinese type stack. Heading, label and small text hierarchy is legible and close to the mockup; the mockup's heavier text rendering is a P3 difference.
- Layout and spacing: the 68/32 desktop split, step bar, left content rhythm and fixed footer match the approved composition. The project form intentionally scrolls when its detailed stages exceed the viewport.
- Color: the existing violet primary, pale selected states, neutral form surfaces and dimmed lesson overlay match the design direction.
- Images and icons: these screens have no raster imagery. Existing app icons are reused; no image placeholder is present.
- Copy: the implementation omits mockup editor-only controls and redundant helper text in line with the user's later requests. The AI panel shows an empty state until a model response exists.
- Accessibility and responsiveness: tabs expose selected state; lesson validation moves to the tab with the first missing field. At 390 × 844, the page uses one vertical workspace scroll, the popup remains usable, and the footer remains visible. Browser console error list was empty.

## Comparison history

1. P2: the lesson basics popup was excessively tall for two fields. Reduced its height to 500 px; the revised view is `qa-learning/isle-lesson-basic-final.png`.
2. P2: the project stage form used long vertical rows and too much spacing. Reduced section gaps and aligned stage labels beside their fields. Revised evidence: `qa-learning/isle-project-final-layout.png`.
3. P2: the quiz answer explanation sat below the visible popup area in a one-question example. Tightened the question form and option rows, removed redundant instruction text, and made the question number visible. Revised evidence: `qa-learning/isle-lesson-quiz-final2.png`.
4. P2: at 390 px, the settings content and assistant initially overlapped because both grid rows shrank to the viewport. Set content-sized rows and gave the lesson popup a full-height mobile workspace. Revised evidence: `qa-learning/isle-mobile-fixed.png` and `qa-learning/isle-mobile-lesson2.png`.

## Interaction checks and limits

- Verified in the browser: partial outline/project edits can be stashed and restored; closing without stashing discards local edits; adding a lesson opens the three-tab popup; required-field validation moves to the correct tab; the right assistant remains available while the lesson popup is open.
- `pnpm --filter @isle/learning test` passed 39 tests; `pnpm --filter @isle/learning check` passed; `git diff --check` passed.
- The local preview's chat connection was closed, so model generation and response adoption were not end-to-end tested in that preview. The error state appeared without crashing the editor.

final result: passed
