# Settings Overview Design QA

- Source visual truth: `/Users/haowen.zheng/.codex/generated_images/019fb3b8-dc87-78e1-92d8-689f94ea1408/exec-27679986-a134-441a-aab4-1d9b62a872bb.png`
- Latest user correction: `/var/folders/9y/fm57w30x4575__8ltjq_62q80000gn/T/codex-clipboard-9d75b21f-21b0-48e8-990e-a02faf63ed6c.png` plus the instruction to remove the highlighted LLM-only treatment
- Implementation screenshot: `/tmp/novel-claw-settings-uniform-1248x783.png`
- Full-view comparison: `/tmp/novel-claw-settings-uniform-comparison.png`
- Focused comparison: `/tmp/novel-claw-settings-focus-comparison-v3.png`
- Browser route: `http://127.0.0.1:4173/#/settings`
- State: light theme, Settings overview, no dialog open
- Browser viewport: `1248 × 783` CSS px, device scale factor 1
- Source pixels: `1583 × 993`
- Implementation pixels: `1248 × 783`
- Density normalization: implementation capture scaled to `1584 × 994`; source padded by 1 px to `1584 × 994` for equal-size comparison

## Findings

- No actionable P0, P1, or P2 differences remain.
- Typography: the implementation uses the product's existing Inter Variable and Chinese system fallbacks. Heading, row titles, descriptions, categories, weights, line heights, wrapping, and tracking preserve the selected hierarchy.
- Spacing and layout rhythm: the standalone “设置” header is removed; “应用设置” and the close action share one title area. The three 96 px navigation rows align consistently, use lightweight separators, and now share the same default styling without an LLM-only underline or background.
- Colors and visual tokens: the implementation uses the existing `background`, `border`, `primary`, `foreground`, and `muted-foreground` tokens. The restrained violet indicator and cool-gray continuous surface match the selected direction.
- Image and icon fidelity: the screen contains no raster imagery. Existing project Lucide icons are used for settings, role, workflow, close, and chevron affordances; no placeholder or handcrafted icon assets were introduced.
- Copy and content: the title, supporting sentence, three destination names, descriptions, category labels, and close label match the approved mockup.
- Expected differences: the source contains macOS traffic lights and populated sidebar mock data, while browser verification captures the web surface with current empty workspace data. These are shell/runtime state differences outside the changed Settings content.

## Comparison History

1. Initial direct comparison at a `1584 × 994` CSS viewport made the navigation rows appear too compact because the source image and browser capture were not density-normalized.
2. A temporary row-height increase was tested, then removed after normalizing the browser viewport and screenshot density. The final 96 px rows align more closely with the source's divider and content rhythm.
3. Final full-view and focused comparisons at the normalized size show no actionable P0/P1/P2 mismatch. Remaining shell and data differences are expected runtime differences.
4. The latest user correction removed the LLM-only violet underline. A post-fix DOM check confirms zero accent indicators and transparent default backgrounds on all three navigation rows.

## Primary Interactions Tested

- LLM 设置 opens `#/settings/llm`.
- 角色设置 opens the role settings dialog and its close action returns to `#/settings`.
- 协作流程设置 opens the workflow settings dialog and its close action returns to `#/settings`.
- 关闭设置 navigates to `#/chat`.
- Narrow-width checks at 760 px and 639 px show no horizontal overflow; category labels collapse below 640 px and the sidebar follows its existing responsive behavior.
- Browser console warnings/errors checked after the interaction pass: none.

## Follow-up Polish

- P3: native Tauri rendering may differ slightly from the browser capture because of window chrome and platform font rasterization; no code change is required unless a native screenshot shows a visible regression.

## Implementation Checklist

- [x] Remove the duplicate Settings page header.
- [x] Keep only the 应用设置 title area and preserve the close action.
- [x] Replace cards with three full-width editorial navigation rows.
- [x] Remove numeric labels and use identical default styling for all three rows.
- [x] Preserve all three routes and dialog behaviors.
- [x] Verify responsive layout, console output, TypeScript, formatting, and production build.

final result: passed

---

# Startup Screen Design QA

## Evidence

- Source visual truth: `/Users/haowen.zheng/.codex/generated_images/019fbe82-1ae1-7d92-b3b8-b96a34b6cc63/exec-2210ce97-de9f-45c0-ae23-f936adccdf47.png`
- Browser-rendered implementation: `/Users/haowen.zheng/Development/projects/novel-claw/.codex/product-design/startup-implementation/02-startup-loading-light.png`
- Full-view comparison: `/Users/haowen.zheng/Development/projects/novel-claw/.codex/product-design/startup-implementation/04-full-comparison.png`
- Focused wordmark comparison: `/Users/haowen.zheng/Development/projects/novel-claw/.codex/product-design/startup-implementation/05-brand-comparison.png`
- Dark-theme evidence: `/Users/haowen.zheng/Development/projects/novel-claw/.codex/product-design/startup-implementation/03-startup-loading-dark.png`
- Narrow-window evidence: `/Users/haowen.zheng/Development/projects/novel-claw/.codex/product-design/startup-implementation/06-startup-loading-narrow.png`
- Desktop viewport: 1536 × 1024 CSS px at device scale factor 1.
- Narrow viewport: 390 × 844 CSS px at device scale factor 1.
- Source and desktop implementation are both 1536 × 1024 px, so no density normalization was required.
- State: startup loading, light theme. Additional checks covered startup complete, dark theme, and narrow-window layout.

## Findings

- No actionable P0, P1, or P2 findings remain.
- Fonts and typography: the implementation retains the existing Inter/system fallback stack, heavy wordmark weight, Chinese supporting-copy hierarchy, letter spacing, and optical balance. The generated concept enlarged the complete lockup; implementation intentionally preserves the production startup screen's established responsive wordmark scale because the approved change was scoped to the cat treatment.
- Spacing and layout rhythm: the wordmark, tagline, and status remain centered with the existing production vertical rhythm. The cat head is centered on the original `i` dot position and measures 18.36 × 18.36 CSS px at the desktop reference viewport. No overlap or overflow occurs at 390 px width.
- Colors and visual tokens: light and dark themes continue to use the existing startup semantic colors. The indigo outline ties the cat asset to the wordmark in both themes.
- Image quality and asset fidelity: the custom Mewvis head is a dedicated 256 × 256 RGBA PNG, not a screenshot crop, CSS drawing, inline SVG, placeholder, or emoji. It preserves the selected orange-and-white face, round amber eyes, pink nose, and indigo outline. The alpha edge is clean with no visible green fringe or opaque background.
- Copy and content: `Mewvis`, `你的 AI 故事创作伙伴`, `正在准备创作空间`, and `准备好了` are correct.
- States and accessibility: loading exposes `aria-busy="true"` and a polite status; completion switches to `aria-busy="false"`, changes the copy to `准备好了`, and stops the status-dot animation. Reduced-motion behavior remains intact. The decorative cat image has an empty alt value while the heading retains the accessible name `Mewvis`.
- Browser console: no errors or warnings were observed during light, dark, or completion-state checks.
- Runtime-owned chrome: the traffic-light controls in the generated reference are supplied by the macOS window, not recreated inside the web content.

## Comparison History

1. The first browser capture inherited a dark saved theme, so it was not a valid comparison against the light source. Added a startup-only `startup-theme` preview override without changing normal theme selection.
2. Re-captured the light loading state at 1536 × 1024 and compared both the full screen and focused wordmark region in combined images. The approved cat-dot treatment, copy, alignment, color family, and loading state matched; the smaller production lockup scale was retained intentionally.
3. Verified the dark theme, completion state, and 390 × 844 narrow viewport. No P0/P1/P2 issues were introduced.

## Implementation Checklist

- [x] Remove the three photoreal startup cats from both static and React-rendered startup markup.
- [x] Replace only the lowercase `i` dot with the Mewvis cat-head asset.
- [x] Preload the new asset for the first paint.
- [x] Preserve light/dark themes, loading animation, completion state, and reduced motion.
- [x] Pass TypeScript, formatting, production build, browser rendering, console, and responsive checks.

## Follow-up Polish

- P3: At very narrow widths the cat head becomes intentionally tiny because it tracks the original `i` dot size; this matches the user's explicit sizing request.

final result: passed
