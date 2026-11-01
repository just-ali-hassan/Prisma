# M5: Voice Input and Output — Implementation Plan

## Overview

**Goal:** Implement speech-to-text (STT) for voice input and text-to-speech (TTS) for voice output with provider fallback routing. If the current model doesn't support STT/TTS, route to a provider the user has configured (e.g., OpenAI Whisper for STT, OpenAI TTS for TTS).

**Reference Documents:**
- PRD.md: Lines 154-158 (Voice input and output)
- TASK.md: Lines 279-324 (M5 detailed tasks)
- ARCHITECTURE.md: Provider abstraction layer, capability table
- RULES.md: Provider Adapter Rules, Capability Table rules

---

## Architecture Design

### 1. Core Package: Voice Router Architecture

#### STT Router (`packages/core/src/voice/stt.ts`)

```typescript
// Interface (already exists)
export interface STTOptions {
  model: string;           // e.g., 'whisper-1', 'gpt-4o-transcribe'
  provider?: string;       // Optional explicit provider
  language?: string;       // ISO 639-1 code
  prompt?: string;         // Context prompt for better accuracy
  responseFormat?: 'json' | 'text' | 'srt' | 'verbose_json' | 'vtt';
  temperature?: number;    // 0-1
}

// Router function signature
export async function speechToText(
  audio: ArrayBuffer,
  options: STTOptions
): Promise<string>
```

**Routing Logic:**
1. Check if current model (from chat session) has `speechToText: true` in capability table
2. If yes, use that provider's `speechToText` adapter method
3. If no, find fallback provider:
   - Priority: User-configured providers with STT capability
   - Default: OpenAI (Whisper) if API key exists
   - Error if no STT-capable provider configured
4. Call provider adapter's `speechToText(audio, options)` method

#### TTS Router (`packages/core/src/voice/tts.ts`)

```typescript
// Interface (already exists)
export interface TTSOptions {
  model: string;           // e.g., 'tts-1', 'tts-1-hd'
  provider?: string;       // Optional explicit provider
  voice?: string;          // Voice ID (alloy, echo, fable, onyx, nova, shimmer)
  speed?: number;          // 0.25-4.0
  responseFormat?: 'mp3' | 'opus' | 'aac' | 'flac' | 'wav' | 'pcm';
}

// Router function signature
export async function textToSpeech(
  text: string,
  options: TTSOptions
): Promise<ArrayBuffer>
```

**Routing Logic:**
1. Check if current model has `textToSpeech: true` in capability table
2. If yes, use that provider's `textToSpeech` adapter method
3. If no, find fallback provider:
   - Priority: User-configured providers with TTS capability
   - Default: OpenAI (TTS) if API key exists
   - Error if no TTS-capable provider configured
4. Call provider adapter's `textToSpeech(text, options)` method

#### Provider Adapter Interface (Already Defined)

```typescript
// In packages/core/src/providers/types.ts - lines 175-188
speechToText?(
  audio: ArrayBuffer,
  options: { model: string; language?: string; prompt?: string; responseFormat?: string; temperature?: number },
  signal: AbortSignal
): Promise<string>;

textToSpeech?(
  text: string,
  options: { model: string; voice?: string; speed?: number; responseFormat?: string },
  signal: AbortSignal
): Promise<ArrayBuffer>;
```

**Note:** These are optional methods. Adapters that don't support STT/TTS simply don't implement them.

---

### 2. Capability Table Updates

Add STT/TTS model entries to `MODEL_CAPABILITIES` in `packages/core/src/providers/capability-table.ts`:

#### OpenAI STT Models
```typescript
// Whisper (audio transcription)
{
  id: 'whisper-1',
  provider: 'openai',
  name: 'Whisper v1',
  contextWindow: 0, // Not a chat model
  capabilities: {
    vision: false,
    video: false,
    imageGeneration: false,
    speechToText: true,
    textToSpeech: false,
    toolCalling: false,
    fileInput: false,
    streaming: false,
  },
  pricing: { inputPerMillion: 0.006, outputPerMillion: 0 }, // Per minute pricing
}

// GPT-4o Transcribe (newer, better)
{
  id: 'gpt-4o-transcribe',
  provider: 'openai',
  name: 'GPT-4o Transcribe',
  contextWindow: 0,
  capabilities: {
    vision: false,
    video: false,
    imageGeneration: false,
    speechToText: true,
    textToSpeech: false,
    toolCalling: false,
    fileInput: false,
    streaming: false,
  },
  pricing: { inputPerMillion: 0.006, outputPerMillion: 0 },
}

// GPT-4o Mini Transcribe
{
  id: 'gpt-4o-mini-transcribe',
  provider: 'openai',
  name: 'GPT-4o Mini Transcribe',
  contextWindow: 0,
  capabilities: { ... },
  pricing: { inputPerMillion: 0.003, outputPerMillion: 0 },
}
```

#### OpenAI TTS Models
```typescript
// TTS-1 (standard)
{
  id: 'tts-1',
  provider: 'openai',
  name: 'TTS-1',
  contextWindow: 0,
  capabilities: {
    vision: false,
    video: false,
    imageGeneration: false,
    speechToText: false,
    textToSpeech: true,
    toolCalling: false,
    fileInput: false,
    streaming: false,
  },
  pricing: { inputPerMillion: 15.0, outputPerMillion: 0 }, // Per 1M characters
}

// TTS-1-HD (high quality)
{
  id: 'tts-1-hd',
  provider: 'openai',
  name: 'TTS-1 HD',
  contextWindow: 0,
  capabilities: { ... },
  pricing: { inputPerMillion: 30.0, outputPerMillion: 0 },
}
```

#### Update Existing Models
- `gpt-4o`: Set `speechToText: false`, `textToSpeech: false` (it's a chat model, not STT/TTS)
- Add `reasoning: false` to all STT/TTS models (they don't reason)

---

### 3. Provider Adapter Implementations

#### OpenAI Adapter (`packages/core/src/providers/adapters/openai.adapter.ts`)

Add `speechToText` method:
```typescript
async speechToText(
  audio: ArrayBuffer,
  options: { model: string; language?: string; prompt?: string; responseFormat?: string; temperature?: number },
  signal: AbortSignal
): Promise<string> {
  const apiKey = await this.getApiKey();
  const formData = new FormData();
  formData.append('file', new Blob([audio], { type: 'audio/wav' }), 'audio.wav');
  formData.append('model', options.model);
  if (options.language) formData.append('language', options.language);
  if (options.prompt) formData.append('prompt', options.prompt);
  if (options.responseFormat) formData.append('response_format', options.responseFormat);
  if (options.temperature !== undefined) formData.append('temperature', String(options.temperature));

  const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}` },
    body: formData,
    signal,
  });

  if (!response.ok) await this.handleErrorResponse(response);
  const data = await response.json();
  return data.text;
}
```

Add `textToSpeech` method:
```typescript
async textToSpeech(
  text: string,
  options: { model: string; voice?: string; speed?: number; responseFormat?: string },
  signal: AbortSignal
): Promise<ArrayBuffer> {
  const apiKey = await this.getApiKey();
  const response = await fetch('https://api.openai.com/v1/audio/speech', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: options.model,
      input: text,
      voice: options.voice ?? 'alloy',
      speed: options.speed ?? 1.0,
      response_format: options.responseFormat ?? 'mp3',
    }),
    signal,
  });

  if (!response.ok) await this.handleErrorResponse(response);
  return response.arrayBuffer();
}
```

#### Other Providers
- **Groq**: Supports Whisper via `whisper-large-v3` - add STT support
- **Together/Fireworks**: May support Whisper - evaluate
- **Google**: Has Speech-to-Text API (separate from Gemini) - evaluate for M5+
- **Anthropic**: No native STT/TTS - will use fallback

---

### 4. Desktop App Implementation

#### VoiceButton Component (`apps/desktop/src/components/VoiceButton.tsx`)

```tsx
interface VoiceButtonProps {
  onTranscription: (text: string) => void;
  disabled?: boolean;
  isRecording?: boolean;
  isTranscribing?: boolean;
}

// States: idle | recording | transcribing | error
// Visual: Mic icon → pulsing red dot (recording) → spinner (transcribing) → checkmark (success)
```

**Features:**
- Request microphone permission via `navigator.mediaDevices.getUserMedia()`
- Record using `MediaRecorder` API (webm/opus format)
- Convert to WAV/PCM for Whisper API
- Send to STT router via core package
- Insert transcribed text into ChatInput
- Show recording indicator (pulsing red dot)
- Show transcribing state (spinner)
- Disable if no STT-capable provider key configured

#### TTS Playback Button (in ChatBubble)

```tsx
// Add to assistant message bubble
interface TTSPlaybackProps {
  text: string;
  modelId: ModelId;
  providerId: ProviderId;
}

// On click: call TTS router → play audio via HTMLAudioElement
// Show speaking state (waveform animation or pulsing speaker icon)
// Allow interrupt/stop playback
```

#### ChatInput Integration
- Add VoiceButton next to send button
- Check `modelSupports(provider, model, 'speechToText')` for current model
- If false, check if any configured provider has STT capability (for fallback)
- Disable button if no STT provider available

---

### 5. Mobile App Implementation

#### VoiceButton Component (`apps/mobile/components/VoiceButton.tsx`)

```tsx
// React Native version using Expo Audio (expo-audio)
// expo-audio provides Audio.Recording and Audio.Sound APIs
```

**Dependencies:**
- `expo-audio` (replaces deprecated expo-av)
- `expo-permissions` for microphone permission

**Features:**
- Request microphone permission via Expo Audio
- Record using `Audio.Recording.createAsync()`
- Send to STT router
- Insert transcribed text
- TTS playback using `Audio.Sound.createAsync()`
- Show recording/speaking indicators

#### ChatInput Integration (in `apps/mobile/app/(tabs)/index.tsx`)
- Add VoiceButton to input row (already has placeholder at line 281-297)
- Check capabilities via `modelSupports()`
- Handle fallback provider availability

---

### 6. Dependencies

#### Core Package
- No new dependencies (uses fetch, FormData - available in Node 18+)

#### Desktop App
- No new dependencies (uses browser MediaRecorder, Audio APIs)

#### Mobile App
- `expo-audio` (add to `apps/mobile/package.json`)
- Run `npx expo install expo-audio`

---

## Detailed Task Breakdown

### Phase 1: Core Package - STT Router & Capability Table

| Task | Description | File |
|------|-------------|------|
| 1.1 | Add STT model entries to capability table (whisper-1, gpt-4o-transcribe, gpt-4o-mini-transcribe) | `capability-table.ts` |
| 1.2 | Add TTS model entries to capability table (tts-1, tts-1-hd) | `capability-table.ts` |
| 1.3 | Update existing chat models: ensure speechToText=false, textToSpeech=false | `capability-table.ts` |
| 1.4 | Implement STT router with fallback logic | `voice/stt.ts` |
| 1.5 | Write tests for STT router (success, fallback, error cases) | `voice/__tests__/voice.test.ts` |
| 1.6 | Implement TTS router with fallback logic | `voice/tts.ts` |
| 1.7 | Write tests for TTS router | `voice/__tests__/voice.test.ts` |
| 1.8 | Implement OpenAI adapter `speechToText` method | `adapters/openai.adapter.ts` |
| 1.9 | Implement OpenAI adapter `textToSpeech` method | `adapters/openai.adapter.ts` |
| 1.10 | Add Groq Whisper support (optional, if time permits) | `adapters/groq.adapter.ts` |
| 1.11 | Run capability table validation | `assertCapabilityTableAgreement()` |
| 1.12 | Verify all tests pass (100% coverage) | `vitest run` |

### Phase 2: Desktop App - Voice Input

| Task | Description | File |
|------|-------------|------|
| 2.1 | Create VoiceButton component with recording UI | `src/components/VoiceButton.tsx` |
| 2.2 | Add microphone permission request logic | `VoiceButton.tsx` |
| 2.3 | Implement MediaRecorder audio capture | `VoiceButton.tsx` |
| 2.4 | Convert recorded audio to WAV/PCM for API | `VoiceButton.tsx` |
| 2.5 | Integrate STT router call | `VoiceButton.tsx` |
| 2.6 | Add VoiceButton to ChatInput | `src/components/ChatInput.tsx` |
| 2.7 | Check STT capability for current model + fallback | `ChatInput.tsx` |
| 2.8 | Disable voice button if no STT provider configured | `ChatInput.tsx` |
| 2.9 | Show recording indicator (pulsing red dot) | `VoiceButton.tsx` |
| 2.10 | Show transcribing state (spinner) | `VoiceButton.tsx` |
| 2.11 | Insert transcribed text into textarea | `ChatInput.tsx` |
| 2.12 | Manual test: Record → Transcribe → Send | - |

### Phase 3: Desktop App - TTS Output

| Task | Description | File |
|------|-------------|------|
| 3.1 | Add TTS playback button to ChatBubble | `src/components/ChatBubble.tsx` |
| 3.2 | Implement TTS router call for assistant messages | `ChatBubble.tsx` |
| 3.3 | Play audio via HTMLAudioElement | `ChatBubble.tsx` |
| 3.4 | Show speaking state (waveform/pulsing icon) | `ChatBubble.tsx` |
| 3.5 | Allow interrupt/stop playback | `ChatBubble.tsx` |
| 3.6 | Check TTS capability for current model + fallback | `ChatBubble.tsx` |
| 3.7 | Manual test: Receive response → Click TTS → Hear audio | - |

### Phase 4: Mobile App - Voice Input & Output

| Task | Description | File |
|------|-------------|------|
| 4.1 | Install expo-audio dependency | `package.json` |
| 4.2 | Create VoiceButton component (RN/Expo) | `components/VoiceButton.tsx` |
| 4.3 | Request microphone permission (Expo Audio) | `VoiceButton.tsx` |
| 4.4 | Implement audio recording (Expo Audio) | `VoiceButton.tsx` |
| 4.5 | Integrate STT router call | `VoiceButton.tsx` |
| 4.6 | Add VoiceButton to chat input row | `app/(tabs)/index.tsx` |
| 4.7 | Check STT capability + fallback | `app/(tabs)/index.tsx` |
| 4.8 | Show recording/transcribing indicators | `VoiceButton.tsx` |
| 4.9 | Insert transcribed text | `app/(tabs)/index.tsx` |
| 4.10 | Add TTS playback button to messages | `app/(tabs)/index.tsx` (ChatBubble area) |
| 4.11 | Implement TTS playback (Expo Audio) | `app/(tabs)/index.tsx` |
| 4.12 | Show speaking state | `app/(tabs)/index.tsx` |
| 4.13 | Manual test on Android: Voice input & output | - |

### Phase 5: Integration Testing & Polish

| Task | Description |
|------|-------------|
| 5.1 | End-to-end test: Desktop voice input → chat → TTS output |
| 5.2 | End-to-end test: Mobile voice input → chat → TTS output |
| 5.3 | Test fallback routing (e.g., use Claude for chat, Whisper for STT) |
| 5.4 | Test error handling: no API key, network error, permission denied |
| 5.5 | Verify UI states match DESIGN.md (colors, animations, icons) |
| 5.6 | Update documentation if needed |

---

## Fallback Routing Logic Details

### STT Fallback Priority
1. Current model's provider (if `speechToText: true`)
2. OpenAI (if `whisper-1` or `gpt-4o-transcribe` in capability table AND user has OpenAI key)
3. Groq (if `whisper-large-v3` AND user has Groq key)
4. Any other registered provider with STT capability
5. Throw `ProviderUnsupportedFeatureError` with clear message

### TTS Fallback Priority
1. Current model's provider (if `textToSpeech: true`)
2. OpenAI (if `tts-1` or `tts-1-hd` AND user has OpenAI key)
3. Any other registered provider with TTS capability
4. Throw `ProviderUnsupportedFeatureError`

### Key Manager Integration
- Check `keyManager.hasKey(providerId)` before attempting fallback
- Only route to providers the user has configured

---

## UI/UX Specifications (per DESIGN.md)

### VoiceButton States
| State | Icon | Animation | Color |
|-------|------|-----------|-------|
| Idle | Mic | None | `textSecondary` |
| Recording | Red circle (pulsing) | Pulse 1s infinite | `error` (#EF4444) |
| Transcribing | Spinner | Spin 1s linear | `accent` (#76B900) |
| Success | Checkmark | Fade in | `success` (#22C55E) |
| Error | X | Shake | `error` |

### TTS Playback Button
| State | Icon | Animation |
|-------|------|-----------|
| Idle | Speaker/Volume-2 | None |
| Playing | Waveform bars | Equalizer animation |
| Paused | Pause | None |

### Accessibility
- ARIA labels for all voice buttons
- Keyboard navigation support (desktop)
- Screen reader announcements for state changes
- Respect `prefers-reduced-motion`

---

## Testing Strategy

### Unit Tests (Core Package)
- STT router: routes to correct provider, handles fallback, errors
- TTS router: routes to correct provider, handles fallback, errors
- Capability table: STT/TTS models present, pricing correct
- OpenAI adapter: STT/TTS methods return expected types

### Integration Tests
- Desktop: VoiceButton records → STT → text inserted
- Desktop: TTS button → audio plays
- Mobile: VoiceButton records → STT → text inserted
- Mobile: TTS button → audio plays
- Fallback: Chat with Claude → STT uses OpenAI Whisper

### Manual Verification Checklist
- [ ] Desktop: Record 10s audio → transcribes correctly
- [ ] Desktop: TTS plays assistant response clearly
- [ ] Desktop: Fallback works (Claude chat + OpenAI STT)
- [ ] Desktop: Button disabled when no STT key configured
- [ ] Mobile: Record → transcribe → send works
- [ ] Mobile: TTS playback works
- [ ] Mobile: Permissions handled gracefully
- [ ] Error states show user-friendly messages

---

## Acceptance Criteria (from TASK.md)

### Core Package
- [ ] STT router created with fallback routing
- [ ] TTS router created with fallback routing
- [ ] STT capability added to capability table
- [ ] TTS capability added to capability table
- [ ] Fallback to OpenAI Whisper works
- [ ] Fallback to OpenAI TTS works
- [ ] All tests pass (100% coverage)

### Desktop App
- [ ] VoiceButton component created
- [ ] Microphone icon in ChatInput
- [ ] Microphone permission requested
- [ ] Audio recorded via MediaRecorder
- [ ] Audio sent to STT router
- [ ] Transcribed text inserted into ChatInput
- [ ] TTS playback button on assistant messages
- [ ] Audio playback via browser Audio API
- [ ] Recording indicator shown
- [ ] Transcribing/speaking states shown
- [ ] Voice button disabled if no STT provider key
- [ ] Manual test: Record → transcribe → send → TTS response works

### Mobile App
- [ ] VoiceButton component created (RN)
- [ ] Microphone icon in ChatInput
- [ ] Microphone permission (Expo Audio)
- [ ] Audio recorded via Expo Audio
- [ ] Audio sent to STT router
- [ ] Transcribed text inserted
- [ ] TTS playback button on messages
- [ ] Audio playback via Expo Audio
- [ ] Recording indicator shown
- [ ] Manual test on Android: Voice input and output work

---

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| MediaRecorder browser compatibility | Test on Chrome, Firefox, Safari, Edge; provide fallback notice |
| Expo Audio API changes | Pin expo-audio version; test on Expo SDK 51+ |
| OpenAI API rate limits | Implement retry with exponential backoff in adapter |
| Large audio files (>25MB Whisper limit) | Chunk audio client-side or show duration limit warning |
| Microphone permission denied | Clear error UI with instructions to enable in settings |
| TTS audio format compatibility | Use MP3 (widely supported); test on all target platforms |

---

## Estimated Effort

| Phase | Tasks | Complexity |
|-------|-------|------------|
| Phase 1: Core STT/TTS | 12 | High (router logic, adapter impl, tests) |
| Phase 2: Desktop Input | 12 | Medium (MediaRecorder, UI states) |
| Phase 3: Desktop Output | 7 | Medium (Audio playback, UI) |
| Phase 4: Mobile | 13 | High (Expo Audio, permissions, dual platform) |
| Phase 5: Integration | 6 | Medium (E2E testing, polish) |
| **Total** | **50** | **~2-3 weeks** |

---

## Next Steps

1. **Review this plan** - Confirm architecture decisions
2. **Start Phase 1** - Implement capability table updates + STT/TTS routers
3. **Parallel work** - Desktop and mobile teams can start UI components once core APIs are stable
4. **Weekly sync** - Verify fallback routing works across providers

---

## Appendix: File Map

### Core Package (New/Modified)
```
packages/core/src/
├── voice/
│   ├── index.ts          # Barrel export (exists)
│   ├── stt.ts            # STT router (stub → implement)
│   ├── tts.ts            # TTS router (stub → implement)
│   └── __tests__/
│       └── voice.test.ts # Tests (exists, update)
├── providers/
│   ├── capability-table.ts  # Add STT/TTS models
│   ├── types.ts             # Interface exists
│   └── adapters/
│       ├── openai.adapter.ts   # Add speechToText, textToSpeech
│       ├── groq.adapter.ts     # Add Whisper support (optional)
│       └── index.ts            # Export
```

### Desktop App (New/Modified)
```
apps/desktop/src/
├── components/
│   ├── VoiceButton.tsx      # NEW
│   ├── ChatInput.tsx        # Add VoiceButton
│   ├── ChatBubble.tsx       # Add TTS button
│   └── index.ts             # Export VoiceButton
├── pages/
│   └── Chat.tsx             # May need updates for voice state
└── stores/
    └── chatStore.ts         # May need voice-related state
```

### Mobile App (New/Modified)
```
apps/mobile/
├── components/
│   ├── VoiceButton.tsx      # NEW (RN version)
│   └── index.ts             # Export
├── app/(tabs)/
│   └── index.tsx            # Add VoiceButton, TTS button
└── package.json             # Add expo-audio