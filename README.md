# Fcode

A lightweight, multi-provider AI coding client for Windows. Fcode is an
**AI client / orchestrator** — it connects to legitimate cloud AI APIs and
local inference servers through a uniform provider abstraction, with a
developer-tool UI: fast, keyboard-driven, dark, and restrained.

Fcode is not an AI model. It trains nothing and proxies nothing. It talks
directly to the providers you configure with your own keys, and to local
runners on your own machine.

## What it does

- **Multi-provider chat & streaming** — real SSE/NDJSON streaming from every
  provider, normalized into one event model.
- **Model catalog & discovery** — a seed catalog plus live model discovery
  per provider (OpenRouter's public model list, Ollama/LM Studio local lists,
  OpenAI/Anthropic/Google model endpoints). Models are tagged
  `FREE / BYOK / LOCAL / TRIAL / PROMO` so the access method is always obvious.
- **Free-model discovery** — free endpoints (e.g. OpenRouter `:free` models,
  Z.ai flash tiers, Google free-tier) are detected from provider-reported
  pricing and grouped in the model hub. No quota is ever taken from another
  application; free means the provider's own documented free access.
- **BYOK** — API keys are entered per provider, stored in the **Windows
  Credential Manager** (via the `keyring` crate), and never appear in logs,
  conversation files, settings files, or exports.
- **Local models** — Ollama and LM Studio are detected, listed, and usable
  offline. Cloud providers being unreachable never blocks the UI.
- **Coding agent** — with a project open, the agent can inspect the tree,
  read files, search/grep, plan and apply edits (shown as **diffs with
  Accept/Reject**), run commands, and read git state — through an approval
  system you control.
- **Integrated editor & terminal** — CodeMirror 6 tabs with find/replace and
  syntax highlighting, plus a PowerShell/CMD terminal panel with output
  streaming and cwd persistence.
- **Conversations** — one JSON file per conversation plus a lightweight
  index; search, rename, pin, delete; automatic titles.
- **Usage & quotas** — local token accounting per provider/model/day, plus a
  generic **promotional entitlement** system whose budgets are enforced in
  the Rust backend (client values are never trusted).
- **Model fallback** — optional ordered fallback chain on rate limits and
  outages. A paid fallback is *never* used silently; a paid-model confirmation
  is always shown.

## Supported providers

| Provider  | Protocol        | Key required | Notes                                  |
|-----------|-----------------|--------------|----------------------------------------|
| OpenRouter| OpenAI-compatible (SSE) | Yes   | Public `/models` used for free discovery |
| Z.ai      | OpenAI-compatible (SSE) | Yes   | Documented open-platform endpoint      |
| OpenAI    | OpenAI-compatible (SSE) | Yes   |                                        |
| Anthropic | Native Messages API (SSE) | Yes |                                        |
| Google Gemini | Native `streamGenerateContent` (SSE) | Yes |                        |
| Ollama    | Native `/api/chat` (NDJSON) | No  | Local; auto-detected                   |
| LM Studio | OpenAI-compatible (SSE) | No     | Local                                  |
| Custom    | OpenAI-compatible | Yes          | Add in Settings → Providers            |

Adding another provider means implementing one Rust trait (`ProviderAdapter`)
and optionally registering a built-in config — no UI rewrites.

## Development

Requirements: **Node 20+**, **pnpm**, **Rust (MSVC)** with Visual Studio
Build Tools, and WebView2 (preinstalled on Windows 10/11).

```bash
pnpm install
pnpm tauri dev        # dev app window with hot reload
```

Other scripts:

```bash
pnpm typecheck        # tsc --noEmit
pnpm lint             # eslint
pnpm test             # vitest (core logic)
pnpm build            # typecheck + vite production build
cd src-tauri && cargo test   # Rust tests (security, quotas, SSE, promotions)
```

## Production build

```bash
pnpm tauri build
```

Artifacts:

- Portable executable: `src-tauri/target/release/fcode.exe`
- NSIS installer: `src-tauri/target/release/bundle/nsis/Fcode_0.1.0_x64-setup.exe`

The bundled app does not require Node.js at runtime.

## Configuration

- All user data lives under `%APPDATA%/com.fcode.desktop/`:
  - `settings.json` — settings + provider configs (no secrets)
  - `conversations/` — `index.json` + one JSON file per conversation
  - `usage.json` — local usage accounting (pruned after 180 days)
  - `promotions.json` — promotional entitlement definitions
- API keys live only in the **Windows Credential Manager**
  (service `Fcode`, entries `provider/<id>`).
- `.env` / `.env.example` exist for development-only variables; no build-time
  secrets are needed. `.env` is git-ignored.

## Security notes

- The webview never holds provider API keys: provider HTTP requests are made
  in Rust, which resolves the key from the credential store at request time.
- Every filesystem operation from the agent is **sandboxed** to the open
  project (traversal, reserved device names, and absolute escapes are
  rejected in `src-tauri/src/security.rs`).
- Terminal commands from the AI are classified (safe / review / dangerous).
  Dangerous commands — `rm -rf`, `format`, `del /s`, registry writes,
  `Invoke-Expression`, and similar — **always** require explicit approval,
  even in auto mode.
- Tool permission groups (filesystem / terminal / git) support
  `Ask / Auto / Disabled` modes; write operations display diffs before
  applying unless auto mode is on.
- Model-generated markdown is sanitized with DOMPurify before rendering.
- Logs contain provider/model/category/duration only — never keys or tokens.
- Exports never include API keys.

## Architecture

```
src/                          React + TypeScript UI
  core/
    ai/
      providers/…             AIProvider abstraction (TS side)
      models/catalog.ts       model registry, filters, access tags
      router/fallback.ts      fallback chain, paid-fallback gating
      streaming/…             (ipc.ts) stream client
      tools/definitions.ts    tool schemas + permission groups
      context/builder.ts      budgeted context assembly
      errors/taxonomy.ts      error classification & actions
    agent/loop.ts             agent orchestration, approvals, diffs
    projects/ conversations/ settings/ credits/ security/
  state/                      zustand stores (settings/chat/project/ui)
  ui/                         views: chat, coding layout, hub, usage, settings
src-tauri/                    Rust core (Tauri 2)
  src/
    providers/                adapters: openai_compat, anthropic, google, ollama (+ SSE/NDJSON)
    tools/                    sandboxed fs, terminal (process streaming), git
    store/                    settings, conversations, usage, promotions (atomic JSON)
    security.rs               path validation + command risk classification
    secrets.rs                Windows Credential Manager (keyring)
    commands/                 chat streaming, tools, providers, usage, import/export
```

Provider requests are executed in Rust with `reqwest` and streamed to the UI
over Tauri IPC channels. The Rust side owns: secrets, quota enforcement,
usage accounting, filesystem sandboxing, and process execution. The
TypeScript side owns orchestration, the approval flow, and rendering.

## Adding a provider

1. **Rust adapter**: implement `ProviderAdapter` (`stream_chat`,
   `list_models`, `validate`) in `src-tauri/src/providers/` — reuse
   `openai_compat` if the API speaks OpenAI.
2. **Register**: add a `ProviderConfig::builtin` entry (id, base URL, kind).
3. **Frontend**: the provider appears automatically in Settings → Providers
   and in the catalog once models are discovered.

Custom OpenAI-compatible providers need no code at all — add them in
Settings.

## Promotional entitlements (free quotas)

`promotions.json` defines generic entitlements owned by *you* (the app
operator) — for example a gateway you run, or allowances you are authorized
to grant. Each promotion declares provider, models, token budget, window and
optional reset; the Rust backend checks remaining budget **before** every
request and records usage after it. The seed file ships with an example that
is disabled and grants nothing.

Fcode never reads, reuses, or bypasses another product's private credits,
sessions, or quotas, and never pretends to be an official provider client.
All providers are integrated through their documented public APIs.

## Troubleshooting

- **Provider shows "not configured"** — add a key in Settings → Providers,
  then *Test connection*.
- **Local provider "offline"** — start Ollama (`ollama serve`) or LM Studio's
  local server; use *Load models* / *Test connection* to re-check.
- **Context limit errors** — lower the context budget in Settings → Agent, or
  pick a larger-context model; the agent auto-retries once with trimmed
  history.
- **`pnpm tauri dev` port conflict** — the dev server pins port 5173; free
  the port or change `devUrl` in `src-tauri/tauri.conf.json` and
  `server.port` in `vite.config.ts`.
- **Build errors on Rust** — ensure the MSVC toolchain and Windows SDK are
  installed (`rustup show` should list `stable-x86_64-pc-windows-msvc`).
#   F c o d e  
 