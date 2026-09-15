# Fcode — Landing Page

Marketing site for Fcode (public beta), the multi-provider desktop AI coding client.

Built with **Vite + React 19 + Tailwind CSS v4 + lucide-react**, fonts bundled locally
(Inter Variable, JetBrains Mono — no network dependency at runtime).

## Develop

```bash
pnpm install
pnpm dev      # http://localhost:5188
```

## Build

```bash
pnpm build      # typecheck + static bundle in dist/
pnpm preview    # serve the production bundle
```

## Notes

- This is a **standalone package** (no pnpm workspace). The lockfile is `lockfileVersion 9.0`
  (single-document YAML), compatible with **pnpm ≥ 10.11** for frozen CI installs — the deploy
  pipeline runs `pnpm install --frozen-lockfile` with pnpm 10.11.1 — and with pnpm 12 locally.
  Do not re-add a `pnpm-workspace.yaml` without a `packages` field: pnpm 10 hard-fails on it.
- `base: "./"` in `vite.config.ts` — the built site can be hosted from any path (GitHub Pages, S3, etc.).
- Brand SVGs live in `src/assets/logos/` (fetched from svgl.app). LM Studio and Z.ai have no official
  SVG there, so they render as monogram tiles (`src/components/logos.tsx`).
- `REPO_URL` / `RELEASES_URL` / `VERSION` are defined in `src/components/ui.tsx` — update them if
  the repository moves or the version bumps out of beta.
