# Prisma — Universal AI Client

**Wire it up. Make it smart.**

Prisma is a universal AI client that lets users bring their own API keys and interact with any AI provider through a
single, native interface. It runs entirely on-device — no backend, no accounts, no data leaving the phone or desktop
unless it's going straight to the provider the user chose.

## Current Implementation Status

Prisma has moved beyond the initial project setup. The repository now contains a substantial shared core, desktop and
mobile app screens, and supporting platform integrations. The code is still under active development; the presence of a
feature module or screen does not by itself mean that the feature is complete or release-ready.

Implemented in the repository:

- Shared TypeScript core with the OpenAI provider adapter, normalized chat sessions, streaming support, model capability
  data, and provider/error abstractions.
- Core modules for local database operations, projects, settings, entitlements, agent/tool execution, voice routing,
  image generation and video input, MCP, skills/plugins, and security utilities.
- Desktop Tauri/React screens for chat, history, projects, settings, and agents, with keychain, SQLite, file, and MCP
  command scaffolding.
- Mobile Expo screens for chat, history, projects, settings, and agents, with secure-store and SQLite utilities.
- Automated tests are present for the OpenAI adapter, chat normalization/session/stream handling, and agent utilities.

Work still needed before describing Prisma as a complete product:

- OpenAI is the only provider adapter currently implemented; the other providers listed below remain planned.
- Several advanced core modules and the platform workflows around them need complete integration and end-to-end
  verification.
- Roadmap items in `Docs/TASK.md` remain unchecked, and platform builds and release readiness have not been confirmed.

See [TASK.md](Docs/TASK.md) for the milestone roadmap and [MEMORY.md](Docs/MEMORY.md) for the latest project handoff
notes.

## Planned Features

- **Multi-provider support**: OpenAI, Anthropic, Google, DeepSeek, xAI, NVIDIA, OpenRouter, OmniRoute, Groq, Together
  AI, Fireworks AI
- **Local-first**: All data (conversations, projects, settings) stored in local SQLite
- **Secure**: API keys stored in OS secure store (Keychain/Keystore), never in plain text
- **Cross-platform**: Native apps for Android, iOS, Windows, macOS, Linux
- **Advanced capabilities**: Streaming chat, voice I/O, image generation, tool calling, agents, MCP connectors, skills,
  plugins
- **Model switching**: Live capability table shows exactly what each model supports
- **Projects**: Group chats with shared instructions, files, and settings

## Architecture

```
prisma/
├── packages/
│   └── core/              # @prisma-ai/core — Shared business logic (TypeScript)
├── apps/
│   ├── mobile/            # React Native + Expo app
│   └── desktop/           # Tauri + React + Vite app
├── docs/                  # Documentation (PRD, ARCHITECTURE, DESIGN, RULES, TASK, MEMORY)
└── scripts/               # Build and utility scripts
```

### Tech Stack

| Layer          | Technology                             |
| -------------- | -------------------------------------- |
| Shared core    | TypeScript (strict mode)               |
| Mobile         | React Native + Expo, Expo Router       |
| Desktop        | Tauri v2 + React + Vite, Tailwind CSS  |
| State          | Zustand                                |
| Database       | SQLite (expo-sqlite / better-sqlite3)  |
| Secure Storage | expo-secure-store / keytar             |
| Testing        | Vitest (core + desktop), Jest (mobile) |
| Build          | Turborepo + pnpm workspaces            |

## Getting Started

### Prerequisites

- Node.js 20+
- pnpm 9+
- Rust (for Tauri desktop development)
- Android Studio (for Android development)
- Xcode (for iOS development, macOS only)

### Installation

```bash
# Clone the repository
git clone https://github.com/your-org/prisma.git
cd prisma

# Run setup script (installs deps, builds core, sets up git hooks)
./scripts/setup.sh
```

### Development

```bash
# Start all dev servers
pnpm dev

# Or start individually:
# Desktop
pnpm --filter @prisma-ai/desktop dev

# Mobile
cd apps/mobile && pnpm dev
```

### Testing

```bash
# Run all tests
pnpm test

# Core package only (100% coverage required)
pnpm --filter @prisma-ai/core test

# Desktop app
pnpm --filter @prisma-ai/desktop test

# Mobile app
cd apps/mobile && pnpm test
```

### Linting & Formatting

```bash
# Check formatting
pnpm format:check

# Auto-fix formatting
pnpm format

# Lint
pnpm lint

# Type-check
pnpm typecheck
```

## Building

### Desktop (Tauri)

```bash
# Development build
pnpm --filter @prisma-ai/desktop tauri dev

# Production builds
pnpm --filter @prisma-ai/desktop tauri build
```

Outputs:

- Windows: `.msi` / `.exe` installer
- macOS: `.dmg` installer
- Linux: `.AppImage` / `.deb`

### Mobile (Expo EAS)

```bash
# Configure EAS (first time)
cd apps/mobile && eas login && eas build:configure

# Build for Android
eas build --platform android

# Build for iOS (requires Apple Developer account)
eas build --platform ios
```

## Project Structure

### Core Package (`packages/core`)

```
src/
├── providers/           # Provider adapter layer
│   ├── types.ts         # Interfaces, types, error classes
│   ├── registry.ts      # Provider registry
│   ├── capability-table.ts  # Model capabilities & pricing
│   └── adapters/        # Individual provider adapters
├── chat/                # Chat session logic
│   ├── chat-session.ts  # Session management
│   ├── message-normalizer.ts
│   └── stream-handler.ts
├── agents/              # Agent loop & tools
├── db/                  # SQLite schema & CRUD
├── entitlements/        # Feature gating
├── voice/               # STT/TTS routing
├── media/               # Image gen, video input
├── security/            # Sanitization, key management, prompt guard
├── mcp/                 # MCP connector layer
├── skills/              # Skills & plugins
└── index.ts             # Barrel export
```

### Desktop App (`apps/desktop`)

```
src/
├── pages/               # Route pages (Chat, History, Projects, Settings, Agents)
├── components/          # React components
├── hooks/               # Custom hooks
├── App.tsx              # Root component
└── main.tsx             # Entry point

src-tauri/
├── src/
│   ├── main.rs          # Tauri entry
│   ├── commands/        # Rust commands (keychain, MCP, files)
│   └── lib.rs           # Library exports
└── tauri.conf.json      # Tauri config
```

### Mobile App (`apps/mobile`)

```
app/
├── (tabs)/              # Tab screens (Chat, History, Projects, Settings, Agents)
├── chat/                # Chat detail screens
├── project/             # Project detail screens
├── _layout.tsx          # Root layout
components/              # React Native components
hooks/                   # Custom hooks
utils/                   # Utilities (secureStore, etc.)
theme/                   # Design tokens
```

## Adding a New Provider

1. Create adapter: `packages/core/src/providers/adapters/<provider>.adapter.ts`
2. Implement `ProviderAdapter` interface
3. Create tests: `packages/core/src/providers/adapters/__tests__/<provider>.adapter.test.ts`
4. Add capability entries in `capability-table.ts`
5. Register in `registry.ts`
6. No other files need to change

## Security

- **API keys** never leave the device except to authenticate with the provider
- **No backend** — no proxy, no middleware, no telemetry without explicit opt-in
- **Sanitization** — all rendered model output passes through HTML/markdown sanitization
- **Prompt injection defense** — tool results and MCP responses scanned before returning to model
- **Local storage** — conversations in SQLite, keys in OS secure store

## Documentation

- [PRD.md](docs/PRD.md) — Product requirements
- [ARCHITECTURE.md](docs/ARCHITECTURE.md) — System architecture
- [DESIGN.md](docs/DESIGN.md) — Design system
- [RULES.md](docs/RULES.md) — Development rules
- [TASK.md](docs/TASK.md) — Task breakdown (M1-M9)
- [MEMORY.md](docs/MEMORY.md) — Session memory

## License

MIT License — see LICENSE file for details.

## Contributing

1. Follow the [development rules](docs/RULES.md)
2. Work in milestone order (M1 through M9)
3. 100% test coverage for core package
4. No secrets in commits (pre-commit hook enforces this)
5. Imperative commit messages

---

**Status**: Active development — shared core and app foundations are implemented; milestone completion and release
readiness are not yet verified.
