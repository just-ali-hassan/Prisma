import { MODEL_CAPABILITIES, providerRegistry, isModelUsable, getUsableModels } from '@prisma-ai/core/providers';

declare const describe: (name: string, fn: () => void) => void;
declare const it: (name: string, fn: () => void) => void;
declare const expect: (actual: any) => any;
declare const beforeEach: (fn: () => void) => void;

describe('ModelPicker models', () => {
  it('has valid model capabilities configured', () => {
    expect(MODEL_CAPABILITIES.length).toBeGreaterThan(0);
    const modelIds = MODEL_CAPABILITIES.map((m) => m.id);
    expect(modelIds).toContain('gemini-1.5-flash');
    expect(modelIds).toContain('deepseek-chat');
    expect(modelIds).toContain('claude-sonnet-5-5');
  });

  it('only shows models whose provider is registered and recognized by adapter', () => {
    providerRegistry.clear();
    expect(getUsableModels()).toEqual([]);

    const mockAdapter = {
      providerId: 'openai' as const,
      supportedModels: ['gpt-4o' as const],
      stream: () => Promise.resolve(),
      chat: () => Promise.resolve({} as any),
      listModels: () => Promise.resolve([]),
      cancel: () => {},
    };
    providerRegistry.register(mockAdapter);

    const usable = getUsableModels();
    expect(usable).toHaveLength(1);
    expect(usable[0].id).toBe('gpt-4o');
    expect(usable[0].provider).toBe('openai');

    expect(isModelUsable('openai', 'gpt-4o')).toBe(true);
    expect(isModelUsable('openai', 'unsupported-model')).toBe(false);
    expect(isModelUsable('anthropic', 'claude-sonnet-5-5')).toBe(false);
  });

  it('guarantees every model in picker belongs to registered provider and is recognized by adapter', () => {
    providerRegistry.clear();

    const mockOpenAI = {
      providerId: 'openai' as const,
      supportedModels: ['gpt-4o' as const, 'gpt-4o-mini' as const],
      stream: () => Promise.resolve(),
      chat: () => Promise.resolve({} as any),
      listModels: () => Promise.resolve([]),
      cancel: () => {},
    };
    const mockAnthropic = {
      providerId: 'anthropic' as const,
      supportedModels: ['claude-sonnet-5-5' as const],
      stream: () => Promise.resolve(),
      chat: () => Promise.resolve({} as any),
      listModels: () => Promise.resolve([]),
      cancel: () => {},
    };

    providerRegistry.register(mockOpenAI);
    providerRegistry.register(mockAnthropic);

    const usable = getUsableModels();
    expect(usable.length).toBe(3);

    for (const model of usable) {
      expect(providerRegistry.has(model.provider)).toBe(true);
      const adapter = providerRegistry.get(model.provider);
      expect(adapter).toBeDefined();
      expect(adapter!.supportedModels).toContain(model.id);
      expect(isModelUsable(model.provider, model.id)).toBe(true);
    }

    // Models from unregistered providers (Google, DeepSeek, etc.) must not be present
    expect(usable.some((m) => m.provider === 'google')).toBe(false);
    expect(usable.some((m) => m.provider === 'deepseek')).toBe(false);
  });
});
