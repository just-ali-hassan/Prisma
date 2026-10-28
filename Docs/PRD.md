# Prisma — Product Requirements Document

**Wire it up. Make it smart.**

---

## 1. Product Overview

Prisma is a universal AI client that lets users bring their own API keys and interact with any AI provider through a
single, native interface. It runs entirely on-device — no backend, no accounts, no data leaving the phone or desktop
unless it's going straight to the provider the user chose.

The app supports the full range of modern AI capabilities: streaming text chat, image and video input, image generation,
voice, file uploads, tool calling, agents, MCP connectors, skills, and plugins. Users configure one or more API keys and
get immediate access to every model those keys unlock, governed by a real-time capability table that shows exactly what
each model can and cannot do.

Prisma ships on Android, iOS, Windows, macOS, and Linux. Mobile is built with React Native and Expo. Desktop uses Tauri,
sharing a TypeScript core package with mobile. Linux desktop is lowest priority but included in the first release.

The business model is free at launch. Monetization comes later. A built-in entitlements layer already gates every
advanced feature behind a single flag — at launch every flag is on. When a paid tier arrives, flipping a flag is all it
takes.

---

## 2. Problem Statement

Working with AI models today is fragmented, locked down, and expensive.

**Vendor lock-in.** Each major provider ships its own siloed app. If you use GPT-4o through ChatGPT, Claude through
claude.ai, and Gemini through Google's app, you're maintaining three separate histories, three sets of preferences, and
three mental models for how things work. Switching between providers mid-task is painful. Comparing outputs across
models means copy-pasting between tabs.

**Fragmented UX.** There is no single interface that treats all AI models as peers. Every provider designs its app
around its own models and hides or deprioritizes competitors. Users who work across multiple providers get no unified
experience — no shared conversation history, no consistent tool calling, no single place to manage keys and preferences.

**Feature gaps behind paywalls.** Advanced features like voice mode, image generation, agents, and tool use are locked
behind $20+/month subscriptions per provider. A user who wants voice from one provider and agents from another is paying
multiple subscriptions for overlapping chat functionality. Meanwhile, API access to these same features costs a fraction
of the subscription price — but the providers don't ship good interfaces for API users.

**Privacy and key control.** Most AI apps route user data through intermediary servers. Users with their own API keys
have no reason to involve a middleman. Their prompts, conversations, and files should travel directly from their device
to the provider's API and nowhere else. Many existing "universal" chat apps still proxy traffic through their own
backend, adding latency, a privacy risk, and a single point of failure.

Prisma exists because no app solves all four of these problems at once.

---

## 3. Goals

**One app for all models.** Replace the collection of provider-specific apps (ChatGPT, claude.ai, Gemini, Grok) with a
single interface that supports every major AI provider. Users add a key, pick a model, and go. The UI adapts to each
model's capabilities through a live capability table — vision, voice, tool calling, image generation, max context — so
nothing is assumed and nothing is hidden.

**Model-hop fluently.** Vibe coders switch models constantly based on what each is best at — reasoning with one, coding
with another, vision with a third. Prisma makes this effortless. Switch models mid-conversation. Compare outputs side by
side. Use the right model for the right task without leaving the app or losing context.

**Zero-server privacy.** No backend. No accounts. No proxying. API keys live in the OS secure store (Keychain, Keystore,
desktop keychain) and go directly from the device to the provider's API. Conversations stay in local SQLite. Nothing is
sent to analytics or telemetry without explicit opt-in. This is a non-negotiable architectural constraint, not a feature
that gets relaxed later.

**Democratize advanced AI features.** Agents, tool calling, MCP connectors, skills, plugins, voice, image generation —
these capabilities exist in the APIs but are gated behind subscriptions or missing entirely from provider apps. Prisma
makes them available to anyone with an API key, regardless of which provider they use. If a provider's API supports it,
Prisma exposes it. If it doesn't, Prisma tells the user clearly and offers fallback routing through another provider
they have a key for.

---

## 4. Target Users

**Vibe coders — the full spectrum.**

At one end: developers who use AI to write most of their code. They direct and review rather than type. They live in AI
chat, they switch models based on the task, they want tool calling and agent workflows, and they care about streaming
speed and raw API access. They already have API keys and are frustrated by the gap between what the API can do and the
clunky interfaces available for using it.

At the other end: non-developers who "vibe code" — people building things with AI that they couldn't build by hand. They
use AI to create apps, automate workflows, generate content, and solve problems across domains. They need an interface
that exposes powerful features without requiring them to understand API documentation or provider-specific quirks.

In between: the growing population of people who are technical enough to get an API key and follow instructions, but not
interested in building their own tooling. They want one app that works, stays out of the way, and lets them use
whichever model fits the moment.

What unites these users: they choose their tools based on capability, not brand loyalty. They want control over their
keys, their data, and their model selection. They are underserved by subscription-locked provider apps and frustrated by
the current state of "universal" chat clients that are either too basic or too janky to trust with real work.

**Secondary audiences (later priorities):**

Teams and small studios who want to standardize on one AI client with shared projects and consistent tool
configurations. Educators and students who need affordable access to multiple models for learning and experimentation.
Enterprise users who need on-device data residency guarantees — Prisma's architecture is already built for this.

---

## 5. Core Features (MVP)

Everything below ships in the first release, built in milestone order. Each milestone must be stable and testable before
the next one starts.

### Streaming text chat (M1)

The foundation. User sends a message, the response streams in token by token. Supports cancel, timeout, retry with
exponential backoff, and graceful handling of partial responses and malformed streams. One provider adapter working
end-to-end on one platform before anything else gets built.

### Local history, model switching, and parameters (M2)

Conversations persist in local SQLite. Full-text search and export (JSON, Markdown). Model switcher with live capability
indicators. Adjustable parameters: temperature, max tokens, top-p, frequency/presence penalty. Custom system prompts per
conversation. Markdown rendering for responses with sanitized output. Entitlements layer: every advanced feature checks
a single flag. At launch, all flags are on.

### Multi-provider support (M3)

Provider adapters for all supported services. Adding a provider means one adapter file, one test file, and one
capability-table entry. The capability table records per-model support for: vision, video, image generation,
speech-to-text, text-to-speech, tool calling, file input, max context window, and streaming. The UI reads this table to
show or hide features. No assumptions, no silent failures.

**Supported providers at launch:**

- OpenAI (GPT-4o, GPT-4.5, o1, o3, o4-mini)
- Anthropic (Claude 4 Opus, Sonnet, Haiku)
- Google (Gemini 2.0 Flash, Pro, Ultra)
- DeepSeek (V3, R1)
- xAI (Grok 3, Grok 3 Mini)
- NVIDIA (NIM API)
- OpenRouter (multi-model gateway)
- OmniRoute (multi-model gateway)
- Open-source models via inference APIs: Groq, Together AI, Fireworks AI

Provider abstraction is strict: UI code never calls a provider SDK directly. All messages, tool calls, errors, and
streaming events are normalized into one internal format. Provider-specific fields go in an `extra` field so nothing is
lost.

### Projects, file uploads, and image input (M4)

Projects group chats that share instructions, files, and settings. File and document uploads with type detection and
preview. Image input for models that support vision — capability table controls availability. Fallback behavior is
explicit: if a model doesn't support image input, say so.

### Voice input and output (M5)

Speech-to-text for input, text-to-speech for output. Uses provider APIs where available (OpenAI Whisper, etc.), with
fallback routing to another provider the user has a key for. Real-time voice mode for providers that support it. Clear
UI states: recording, transcribing, speaking, idle.

### Image generation and video input (M6)

Image generation through provider APIs (DALL-E, etc.). Video input for models that support it; fallback to extracted
frames with clear labeling when native video isn't supported. Generated images are stored locally and associated with
the conversation.

### Tool calling and agents (M7)

Agent loop: model proposes a tool call, app executes it, result goes back, model continues. Step limit enforced.
User-visible stop button. Running cost estimate displayed during execution. User confirmation required before any tool
action that writes, deletes, sends, or spends money. Read-only actions can be auto-approved if the user opts in.

### MCP connectors, skills, and plugins (M8)

MCP connectors: on desktop, both local (stdio) and remote servers. On mobile, remote servers only — phones can't run
local server processes, and this is stated clearly in the UI. Skills: a folder with a plain-text instruction file plus
optional resources, enabled/disabled per project. Plugins: bundles of skills and connector configs. No arbitrary code
execution — plugins are configuration and instructions only. All tool results, web content, and files are treated as
untrusted. Prompt injection defenses are mandatory.

### Desktop apps, store builds, and polish (M9)

Tauri builds for Windows, macOS, and Linux. iOS via Expo EAS cloud builds. Android tested on a real device. Store
listing assets, privacy policy, content ratings. Developer account fees and age-rating requirements documented before
submission. AI-specific app store review requirements flagged early.

---

## Competitive Landscape

| App            | Model support  | BYOK | On-device  | Voice | Agents/Tools  | Platforms              |
| -------------- | -------------- | ---- | ---------- | ----- | ------------- | ---------------------- |
| **ChatGPT**    | OpenAI only    | No   | No         | Yes   | Yes (limited) | Mobile + Web           |
| **Claude**     | Anthropic only | No   | No         | No    | Yes (MCP)     | Mobile + Web + Desktop |
| **Gemini**     | Google only    | No   | No         | Yes   | Limited       | Mobile + Web           |
| **TypingMind** | Multi-provider | Yes  | No (web)   | No    | Limited       | Web                    |
| **OpenRouter** | Multi-provider | Yes  | No (proxy) | No    | No            | Web                    |
| **Prisma**     | Multi-provider | Yes  | Yes        | Yes   | Yes (full)    | Mobile + Desktop       |

Prisma's differentiators: true on-device architecture (no proxy, no backend), native apps across all platforms (not a
web wrapper), and the full stack of advanced features (agents, MCP, voice, image gen) available to any provider with API
support — not locked to a single vendor's subscription.

---

_Last updated: 2026-10-25_
