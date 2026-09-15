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
| `sidebar-mode-expanded.poster.png` | `sidebarMode=expanded` (still only) |

Viewport: **640×360** (pull-back crop; main-pane capsules intentionally clipped on the right).
Fixture workspace root name: **感性工学**.
GIF netscape loop count is finite; UI also stops after ~3 cycles and shows a play overlay.

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
- Timeline for roots OFF/ON is identical; only `sidebarCollapseRootsOnly` differs
- Auto mode uses production `:hover` with the same pointer enter/leave timing

Do not hand-draw schematic sidebars for these assets.
