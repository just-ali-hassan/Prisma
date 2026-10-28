# Prisma — Development Rules

---

## 1. General Principles

### Milestone-Driven Development

Work in milestone order (M1 through M9). Each milestone must be stable and testable before starting the next. If a
milestone is broken, stop and fix it before moving forward. Do not start M3 while M2 has failing tests or unresolved
bugs.

### Default to Action, Question When Blocked

Implement changes rather than only suggesting them. For small, well-scoped changes, act immediately. For multi-file or
unfamiliar changes, read relevant code and plan before acting. If the user's intent is unclear, infer the most useful
likely action and proceed. When genuinely blocked on a decision only the user can make, ask — but prefer discovering
answers through code inspection over guessing.

### Work in Small Steps

After each step, verify it works before continuing. Run the build. Run the tests. If verification reveals errors, fix
them before presenting the result. For safety-sensitive changes (auth, infrastructure, data handling), state what was
verified and what could not be verified.

### Push Back When Wrong

If a request puts security at risk, asks for too much at once, or contradicts an architectural constraint, say so. Do
not just agree. Offer an alternative that solves the underlying problem without the risk.

### Fail Twice, Diagnose Root Cause

If an approach has failed twice, stop making incremental patches. Diagnose the root cause and try a fundamentally
different approach. Explain what went wrong and what tradeoffs the new approach introduces. If the new approach deviates
from the user's original intent (different language, dropping a feature, architectural shift), confirm before
proceeding.

### Preserve User Intent

A bug fix does not need surrounding code cleaned up. A simple feature does not need extra configurability. Solve the
problem that was asked about. A larger feature may need to alter existing designs to be cohesive and correct — use
judgment.

### Security is Non-Negotiable

API keys live only in the OS secure store. Never in AsyncStorage, SQLite, plain files, logs, crash reports, or source
control. Keys go from the device straight to the provider — no middle server. No telemetry without explicit opt-in. All
rendered model output (markdown, links, HTML, code) is sanitized. Tool results, web content, and MCP responses are
treated as untrusted. Prompt injection defenses are mandatory. Flag any design choice that weakens security or privacy,
even if not asked.

---

## 2. Technology & Coding Standards

### TypeScript

**Strict mode everywhere.** No `any` without a comment explaining why. Use explicit types for function parameters and
return values when the type is not immediately obvious from the implementation.

**Prefer `undefined` over `null`.** Use `undefined` for optional values and uninitialized state. Use `null` only when
interfacing with external APIs that return it (provider responses, SQLite nulls). Be consistent within a file.

**Error Handling: Typed Error Classes**

Define custom error classes per domain. Every error class extends `Error` and includes:

- `name` (the error class name)
- `message` (human-readable description)
- `code` (machine-readable error code, e.g. `PROVIDER_AUTH_FAILED`)
- Optional context fields (e.g. `providerId`, `modelId`, `statusCode`)

```typescript
// Example
export class ProviderAuthError extends Error {
  readonly code = 'PROVIDER_AUTH_FAILED';
  constructor(
    public readonly providerId: string,
    message: string
  ) {
    super(message);
    this.name = 'ProviderAuthError';
  }
}
```

Throw typed errors. Catch them at boundaries (UI, API calls). Never swallow errors silently. Always log or display them.

**Explicit Error Cases**

Handle every error case explicitly:

- Invalid API key
- Rate limit (with retry-after)
- No network
- Provider outage (5xx)
- Malformed stream
- Tool execution failure
- Unsupported feature (model lacks capability)
- Timeout
- User cancellation

**Import Style: Absolute with Aliases**

Use absolute imports with path aliases configured in `tsconfig.json` paths:

- `@prisma-ai/core` for the core package
- `@/components` for platform-specific components
- `@/hooks` for platform-specific hooks
- `@/utils` for platform-specific utilities

Relative imports are allowed within the same directory (e.g. `./types`), but cross-directory imports within a package
should use aliases.

```typescript
// Good
import { ProviderAdapter } from '@prisma-ai/core/providers';
import { ChatBubble } from '@/components/ChatBubble';

// Avoid
import { ProviderAdapter } from '../../../core/src/providers/types';
```

**Code Comments: Reason-Focused**

Comment the logic and the reason, not the obvious. Explain _why_ a choice was made, not _what_ the code does (the code
already says that). No JSDoc unless the function/type is exported from the core package's public API
(`packages/core/src/index.ts`).

```typescript
// Good
// Use exponential backoff because providers rate-limit aggressively during peak hours
const delay = Math.min(1000 * Math.pow(2, attempt), 30000);

// Bad
// Set delay to exponential backoff
const delay = Math.min(1000 * Math.pow(2, attempt), 30000);
```

For exported core package APIs, include JSDoc with `@param`, `@returns`, and `@throws` tags.

### React & UI

**Functional Components Only**

Use functional components with hooks. No class components.

**Zustand for State**

Zustand stores live in `packages/core/src/` for shared state (provider state, conversation state, entitlements).
Platform-specific UI state (navigation, layout, keyboard) lives in the platform app. Avoid prop drilling — use Zustand
or React Context.

**Styling**

Mobile: React Native StyleSheet. Define styles at the bottom of the component file or in a separate `.styles.ts` file if
reused.

Desktop: Tailwind CSS. Use utility classes directly in JSX. Extract repeated patterns into components, not `@apply`
directives.

**Component Structure**

```typescript
// imports
// types
// component
// styles (mobile only)
```

### Testing

**Test Coverage: Core 100%, UI Optional**

The core package (`@prisma-ai/core`) must have 100% test coverage. Every adapter, every chat session method, every agent
loop path, every database operation. Mock all provider API calls. Never call real APIs in tests.

UI components (mobile and desktop) are tested when it makes sense (complex logic, critical user flows), but there is no
strict coverage requirement. Focus on business logic tests.

**Test File Naming**

Test files live in `__tests__/` directories next to the code they test. Named `<module>.test.ts` (e.g.
`openai.adapter.test.ts`).

**Test Structure**

Use `describe` blocks for logical grouping. Use `it` or `test` for individual cases. Arrange tests in Arrange-Act-Assert
(AAA) pattern.

```typescript
describe('OpenAI Adapter', () => {
  describe('stream()', () => {
    it('streams tokens correctly for a successful response', async () => {
      // Arrange
      const adapter = new OpenAIAdapter(mockKeyManager);
      mockFetch.mockReturnValue(mockSSEStream(['Hello', ' world']));

      // Act
      const tokens: string[] = [];
      await adapter.stream(request, (event) => {
        if (event.type === 'token') tokens.push(event.content);
      });

      // Assert
      expect(tokens).toEqual(['Hello', ' world']);
    });

    it('throws ProviderAuthError when API key is invalid', async () => {
      // Arrange
      const adapter = new OpenAIAdapter(mockKeyManager);
      mockFetch.mockReturnValue(mockErrorResponse(401, 'Invalid API key'));

      // Act & Assert
      await expect(adapter.stream(request, handler)).rejects.toThrow(ProviderAuthError);
    });
  });
});
```

**Mock All External Dependencies**

Never call real provider APIs, real file system writes (except test temp dirs), or real network requests in tests. Use
mocks, stubs, or dependency injection.

### Git

**Branching: Trunk-Based**

Work on `main` or short-lived feature branches that merge back to `main` within a day or two. No long-lived `develop`
branch. This is simpler for a solo builder.

For anything non-trivial, create a feature branch:

```bash
git checkout -b add-openai-adapter
# work, commit, test
git push origin add-openai-adapter
# merge or PR to main
```

For tiny fixes (typos, one-line changes), commit directly to `main`.

**Commit Messages: Imperative, No Prefix**

Short, imperative subject line. No Conventional Commits prefixes. Start with a verb. Be descriptive.

```
# Good
Add OpenAI streaming adapter
Fix rate limit retry logic in stream handler
Update capability table with Gemini 2.0 models

# Bad
feat(core): add openai adapter
added streaming
fixed bug
```

If the commit needs more context, add a blank line and a body explaining _why_ (not what — the diff shows what).

**Commit Often, Push When Stable**

Commit after every logical unit of work. Push when tests pass. Do not push broken code to `main`.

**Never Commit Secrets**

Run `scripts/verify-keys-not-leaked.sh` as a pre-commit hook (set up during initial dev environment setup). This script
scans staged files for patterns that look like API keys.

### Dependencies

**Pinned Versions**

Use exact versions in `package.json` (no `^` or `~`). Update intentionally, not accidentally.

**Justify New Dependencies**

Before adding a dependency, ask:

1. Can this be done in 20 lines of code instead?
2. Is the package actively maintained? (commits in the last 6 months)
3. Is the package widely used? (npm downloads, GitHub stars)
4. Does it pull in a large dependency tree?

Document the reason in the commit message when adding a non-obvious dependency.

**Provider SDKs**

Use official provider SDKs where available (OpenAI SDK, Anthropic SDK, Google AI SDK). Wrap them in adapters — never
call them directly from UI code.

---

## 3. Project Structure

### Package Organization

Three packages:

1. `packages/core` — all business logic, no platform dependencies
2. `apps/mobile` — React Native + Expo, thin UI shell
3. `apps/desktop` — Tauri + React + Vite, thin UI shell

**Core Package Rules**

The core package must remain platform-agnostic. It defines abstract interfaces for platform-specific concerns (secure
storage, SQLite driver, file system). Platform apps inject implementations at startup.

Never import `expo-*` or `tauri-*` directly in the core package. Use dependency injection or peer dependencies.

**What Goes in Core**

All of these belong in `packages/core`:

- Provider adapters
- Message normalization
- Streaming logic (SSE parsing, backoff, timeout)
- Agent loop
- Tool execution
- Cost estimation
- MCP client
- Skill and plugin loaders
- Database schema and CRUD operations
- Entitlements checks
- Voice routing (STT/TTS)
- Image generation routing
- Security utilities (sanitization, prompt guards)

**What Goes in Platform Apps**

Platform-specific concerns only:

- UI components (buttons, lists, modals, navigation)
- Platform-specific hooks (keyboard, permissions, native modules)
- Secure store implementation wrappers
- SQLite driver wrappers
- File system access wrappers
- Tauri command bindings (desktop only)

**Folder Structure Enforcement**

Follow the folder structure defined in `ARCHITECTURE.md` exactly. Do not create new top-level directories without
updating the architecture doc. Do not nest files arbitrarily — if a file doesn't fit the current structure, that's a
signal the structure needs to evolve (document the change).

### Provider Adapter Rules

Every adapter must:

1. Implement the `ProviderAdapter` interface from `@prisma-ai/core/providers/types`
2. Have a corresponding test file in `__tests__/`
3. Have an entry in the capability table (`capability-table.ts`)
4. Be registered in the provider registry (`registry.ts`)
5. Normalize all responses into `NormalizedMessage` before returning
6. Put provider-specific fields in the `extra` field (do not discard them)

**Adding a New Provider**

To add a new provider:

1. Create `packages/core/src/providers/adapters/<provider>.adapter.ts`
2. Implement `ProviderAdapter` interface
3. Create `packages/core/src/providers/adapters/__tests__/<provider>.adapter.test.ts`
4. Add capability table entry in `capability-table.ts`
5. Register in `registry.ts`
6. No other files need to change

### Database Rules

**Migrations**

Schema changes go in `packages/core/src/db/schema.ts`. Migrations are applied on app startup. Use a simple version
counter — no external migration tool.

**Queries in CRUD Files**

Database queries live in CRUD files (`conversations.ts`, `projects.ts`, `settings.ts`), not scattered through the
codebase. If a query doesn't fit an existing CRUD file, create a new one.

**FTS5 for Search**

Use SQLite FTS5 for full-text search. Keep the `messages_fts` virtual table in sync with the `messages` table via
triggers (defined in `schema.ts`).

### Security Rules

**Key Storage**

API keys are stored via the `KeyManager` interface. Platform apps provide the implementation. Keys are read only when
needed (at request time) and never cached in memory longer than necessary.

**Sanitization**

All content rendered from model output must pass through `sanitize.ts`:

- Markdown: use a safe renderer with HTML sanitization (`react-markdown` + `rehype-sanitize` on desktop,
  `react-native-markdown-display` with custom renderers on mobile)
- Links: validate protocols (only `https:`, `http:`, `mailto:`)
- Code blocks: syntax highlighting is fine, but no execution

**Prompt Injection Defense**

Tool results and MCP responses are untrusted. Before passing them back to the model, scan for prompt injection patterns
(`prompt-guard.ts`). Flag suspicious content and ask the user whether to proceed.

### Entitlements

Every advanced feature checks the entitlements layer:

- Voice input/output
- Image generation
- Tool calling / agents
- MCP connectors
- Skills / plugins
- Video input

Check looks like:

```typescript
import { checkEntitlement } from '@prisma-ai/core/entitlements';

if (!checkEntitlement('voice')) {
  throw new EntitlementError('Voice features are not enabled');
}
```

At launch, all entitlements are enabled. When monetization arrives, flip flags here. Do not scatter payment logic
through the codebase.

### Capability Table

The capability table (`capability-table.ts`) is the source of truth for what each model supports. The UI reads this
table to show/hide features. Never assume a model supports a feature — always check the table.

**Capability Fields**

Per model:

- `vision` (image input)
- `video` (video input)
- `imageGeneration`
- `speechToText`
- `textToSpeech`
- `toolCalling`
- `fileInput`
- `maxContext` (tokens)
- `streaming`

**Fallback Behavior**

If a user tries to use a feature the selected model doesn't support:

1. Check the capability table
2. If unsupported, show a clear error message: "Model X does not support feature Y"
3. Optionally offer to route that one feature to another provider the user has a key for (e.g. use OpenAI's Whisper for
   STT even if the main conversation is with Claude)
4. If video input isn't natively supported, offer to extract frames and send those (labeled as a fallback)

---

_Last updated: 2026-10-25_
