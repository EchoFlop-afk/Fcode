# Fcode — Landing Page

Marketing site for Fcode, the multi-provider desktop AI coding client.

Built with **Vite + React 19 + Tailwind CSS v4 + lucide-react**, fonts bundled locally
(Inter Variable, JetBrains Mono — no network dependency at runtime).

## Develop

```bash
pnpm install --ignore-workspace   # standalone from the main app workspace
pnpm dev                          # http://localhost:5188
```

## Build

```bash
pnpm build      # typecheck + static bundle in dist/
pnpm preview    # serve the production bundle
```

## Notes

- `base: "./"` in `vite.config.ts` — the built site can be hosted from any path (GitHub Pages, S3, etc.).
- Brand SVGs live in `src/assets/logos/` (fetched from svgl.app). LM Studio and Z.ai have no official
  SVG there, so they render as gradient monogram tiles (`src/components/logos.tsx`).
- `REPO_URL` / `RELEASES_URL` are defined in `src/components/ui.tsx` — update them if the repository moves.
