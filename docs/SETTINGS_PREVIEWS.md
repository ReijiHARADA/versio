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
| `sidebar-mode-auto.gif` | `sidebarMode=auto` (plays ~3× then pause + replay) |
| `sidebar-mode-auto.poster.png` | paused / reduced-motion |
| `sidebar-mode-expanded.gif` | `sidebarMode=expanded` (cursor motion; plays ~3× then pause + replay) |
| `sidebar-mode-expanded.poster.png` | paused / reduced-motion |

Viewport: **680×340** (top-left crop; settings footer omitted; reader chrome clipped on the right).
Fixture workspace: **修士研究 → Interactive jewelry → 論文1本** + **ああ / M1** (collapsed).
Main pane stub: reader header path + 目次 + title crop (not skeleton capsules).
GIF netscape loop count is finite; UI starts playback when the preview enters the viewport, stops after ~3 cycles, and shows a play overlay.

Collapsed icon-rail always shows top-level workspace items only; nested folders/papers appear when the sidebar expands. This is fixed behavior (not a setting).

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
- Fixture: `src/capture/sidebarPreviewFixture.ts`
- Auto mode uses production `:hover` with the same pointer enter/leave timing

Do not hand-draw schematic sidebars for these assets.
