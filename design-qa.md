# LLM settings design QA

- Source visual truth: `/Users/haowen.zheng/.codex/generated_images/019fb3b8-dc87-78e1-92d8-689f94ea1408/exec-08d6ab2c-e47d-4d3e-a6f5-276ccd9672f1.png`
- User-reported pre-fix capture: `/var/folders/9y/fm57w30x4575__8ltjq_62q80000gn/T/codex-clipboard-64265bae-78d2-4346-b0b1-2655c5e8be82.png`
- Final implementation screenshot: `/tmp/novel-claw-llm-full-revised-final.jpg`
- Full-view comparison: `/tmp/novel-claw-llm-comparison-revised-final.png`
- Focused overview comparison: `/tmp/novel-claw-llm-overview-focused-comparison-final.png`
- Viewport: 1626 × 967 CSS pixels
- Density normalization: source 1626 × 967 pixels; implementation captured at device pixel ratio 2 and normalized by the in-app browser to 1626 × 967 output pixels
- State: light theme, `/#/settings/llm`, two configured Providers, `minimax-cn` edit modal open

## Findings

- No actionable P0, P1, or P2 visual mismatch remains.
- Fonts and typography: the implementation retains the product's Inter/CJK fallback stack and matches the reference hierarchy and compact optical weight across the page title, table header, Provider rows, modal fields, helper text, and actions.
- Spacing and layout rhythm: the overview now uses the reference's full-width flat list, 60 px header and row rhythm, horizontal dividers, 24 px body inset, and combined 120 px title region. The fixed card, oversized rows, leading icons, and return control from the pre-fix capture are gone.
- Colors and tokens: the LLM header, list, and surrounding canvas now share the application's cool-gray `surface` token, with hierarchy carried by a neutral divider rather than a white header band. Violet primary controls, green state dots, and red destructive actions retain their semantic tokens.
- Image quality and assets: the target contains no raster illustrations, photography, or custom imagery. Interface icons use the existing product icon system; the Provider overview no longer introduces icons absent from the reference.
- Copy and content: Provider, API format, endpoint, enabled models, credential status, and availability remain visible at the reference desktop size. The redundant row-action glyph was removed after review because the complete row is already the edit entry point.
- Behavior and accessibility: complete rows remain keyboard-focusable edit controls; Add Provider and edit actions open the centered modal; API-key visibility, model controls, cancel behavior, and delete confirmation remain functional.
- Runtime check: the verified browser state has no console errors or warnings.

## Intentional differences from the source

- The shared application sidebar is 288 px in the real product instead of the generated reference's approximate 303 px. The content uses the same relative insets and proportions inside the available product frame.
- The shared Dialog is centered in the full viewport; the generated reference places it approximately 40 px to the right of center.
- The `1M` context indicator remains an interactive switch to preserve existing functionality.
- At the user's explicit direction, the trailing ellipsis/action column is omitted; clicking or focusing the complete Provider row opens the same editor.
- At the user's explicit direction, the generated reference's white page header is replaced by the same cool-gray surface used by the LLM list and canvas, avoiding a disconnected white band next to the gray application shell.

## Comparison history

1. P1: the user-reported capture showed a rounded elevated table card with oversized rows, decorative Provider icons, a return arrow, wide outside margins, and hidden status/action columns. These changed the page's hierarchy and density from the selected reference.
2. Fix: replaced the card with a borderless full-width list, removed Provider icons and the return arrow, reduced headers and rows to 60 px, restored simple green state dots, and kept the data columns visible down to a 1280 px desktop viewport.
3. P2: the first revision inherited the application's 40 px title-bar spacer in addition to a 120 px page header, shifting the title and list 40 px below the reference.
4. Fix: aligned the LLM header through the title-bar region so its bottom edge lands at 120 px, matching the source's title and table positions.
5. Post-fix evidence: the final 1626 × 967 full-view and focused overview comparisons confirm the flat list surface, title placement, row density, dividers, state indicators, columns, and modal proportions.
6. User-directed refinement: removed the redundant trailing ellipsis and its header column while preserving the full-row edit interaction.
7. User-directed refinement: unified the LLM title, list, and canvas background through the shared `surface` token and retained a single bottom divider for hierarchy.

## Interaction checklist

- [x] Add Provider opens the create modal
- [x] Clicking a Provider row opens the populated edit modal
- [x] Six overview data columns remain present at 1280 × 720 without horizontal overflow
- [x] API-key visibility, model creation/removal, cancel, and delete confirmation remain functional
- [x] Browser console is clean
- [x] Production TypeScript and Vite build passes

## Follow-up polish

- P3: generated CJK glyph metrics are slightly tighter than the real product font stack; retaining shared application typography avoids a one-off settings-page override.

final result: passed
