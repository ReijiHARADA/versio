# Settings behavior / visual previews

## Visual live preview

Source of truth: production presentational Reader surface

- `src/components/reader/ReaderArticleSurface.tsx`
- `src/components/reader/OriginalTextBlock.tsx`
- CSS: `PaperContent.module.css`, `Paragraph.module.css` (`--content-*` tokens)

Settings mounts the same surface with a fixture document in
`src/components/settings/ReadingPreview.tsx`.

## Behavior GIF previews

Source of truth: production `AppSidebar` (+ workspace tree CSS / transitions).

Assets live in `src/assets/settings-previews/`:

| File | Setting |
| --- | --- |
| `sidebar-roots-only-{off,on}.gif` | `sidebarCollapseRootsOnly` OFF/ON (plays ~3× then pause + replay) |
| `sidebar-roots-only-{off,on}.poster.png` | reduced-motion / paused stills |
| `sidebar-mode-auto.gif` | `sidebarMode=auto` (plays ~3× then pause + replay) |
| `sidebar-mode-auto.poster.png` | paused / reduced-motion |
| `sidebar-mode-expanded.gif` | `sidebarMode=expanded` (cursor motion; plays ~3× then pause + replay) |
| `sidebar-mode-expanded.poster.png` | paused / reduced-motion |

Viewport: **640×300** (top-left crop; settings footer omitted; main-pane capsules clipped on the right).
Fixture workspace: **M1 → 感性工学 → 論文2本** + **B4** (collapsed).
GIF netscape loop count is finite; UI starts playback when the preview enters the viewport, stops after ~3 cycles, and shows a play overlay.

### Regenerate

```bash
npm run capture:settings-previews
```

Requirements:

- `ffmpeg` on `PATH`
- Playwright Chromium (`npx playwright install chromium` if needed)
- Port `5199` free (capture Vite server)

### Capture environment

- Entry: `scripts/capture-settings-previews/` (Vite + React)
- Mount: `src/capture/SidebarBehaviorCapture.tsx`
- Fixture: `src/capture/sidebarPreviewFixture.ts` (same tree for OFF/ON)
- Timeline for roots OFF/ON is identical expand/collapse; only `sidebarCollapseRootsOnly` differs
- Auto mode uses production `:hover` with the same pointer enter/leave timing
- Roots OFF/ON also include the expand ↔ collapse motion so collapsed hierarchy is comparable

Do not hand-draw schematic sidebars for these assets.
