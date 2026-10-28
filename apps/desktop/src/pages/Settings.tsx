import { useState, useEffect, useCallback } from 'react';
import { Key, Save, Eye, EyeOff, CheckCircle, Loader2 } from 'lucide-react';
import { useTauriKeyManager } from '@/hooks/useTauriSecureStore';

const providers = [
  {
    id: 'openai',
    name: 'OpenAI',
    models: ['GPT-4o', 'GPT-4o mini', 'GPT-4.5', 'o1', 'o3', 'o4-mini'],
  },
  {
    id: 'anthropic',
    name: 'Anthropic',
    models: ['Claude Opus 5.5', 'Claude Sonnet 5.5', 'Claude Haiku 5.5'],
  },
  {
    id: 'google',
    name: 'Google',
    models: ['Gemini 1.5 Flash', 'Gemini 1.5 Pro'],
  },
  { id: 'deepseek', name: 'DeepSeek', models: ['DeepSeek Chat', 'DeepSeek Reasoner'] },
  { id: 'xai', name: 'xAI', models: ['Grok 3', 'Grok 3 Mini'] },
  { id: 'nvidia', name: 'NVIDIA', models: ['Nemotron 3 Ultra'] },
  { id: 'openrouter', name: 'OpenRouter', models: ['Auto (multi-model)'] },
  { id: 'omniroute', name: 'OmniRoute', models: ['Auto (multi-model)'] },
  { id: 'groq', name: 'Groq', models: ['Llama 3.1 405B', 'Llama 3.1 70B', 'Llama 3.1 8B'] },
  { id: 'together', name: 'Together AI', models: ['Llama 3.1 405B', 'Mixtral 8x7B'] },
  { id: 'fireworks', name: 'Fireworks AI', models: ['Llama 3.1 70B', 'Llama 3.1 8B'] },
];

export function Settings() {
  const { setKey, getKey, listKeys, loading } = useTauriKeyManager();
  const [keys, setKeys] = useState<Record<string, string>>({});
  const [visibility, setVisibility] = useState<Record<string, boolean>>({});
  const [saved, setSaved] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  const loadKeys = useCallback(async () => {
    const savedKeys = await listKeys();
    for (const provider of savedKeys) {
      const key = await getKey(provider);
      if (key) {
        setKeys((prev) => ({ ...prev, [provider]: key }));
      }
    }
  }, [getKey, listKeys]);

  useEffect(() => {
    loadKeys();
  }, [loadKeys]);

  const toggleVisibility = (providerId: string) => {
    setVisibility((prev) => ({ ...prev, [providerId]: !prev[providerId] }));
  };

  const handleSave = async (providerId: string) => {
    const key = keys[providerId];
    if (!key) return;

    setSaveError(null);
    try {
      await setKey(providerId, key);
      const storedKey = await getKey(providerId);
      if (storedKey !== key) {
        throw new Error('The secure store did not return the key after saving it.');
      }
      setSaved(providerId);
      setTimeout(() => setSaved(null), 2000);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('Failed to save key:', err);
      setSaveError(message);
    }
  };

  return (
    <div className="h-full overflow-y-auto p-6 max-w-3xl mx-auto">
      <h1 className="text-2xl font-semibold text-text-primary mb-6">Settings</h1>

      {/* API Keys Section */}
      <section className="mb-8">
        <h2 className="text-lg font-medium text-text-primary mb-4 flex items-center gap-2">
          <Key className="w-5 h-5 text-accent-primary" />
          API Keys
        </h2>
        <p className="text-sm text-text-secondary mb-4">
          Add your API keys to enable providers. Keys are stored securely in your OS keychain.
        </p>
        {saveError && (
          <p role="alert" className="text-sm text-error mb-4">
            Could not save the API key: {saveError}
          </p>
        )}
        <div className="space-y-3">
          {providers.map((provider) => (
            <div
              key={provider.id}
              className="flex items-center justify-between p-4 bg-surface border border-border rounded-lg"
            >
              <div className="flex items-center gap-3">
                <div className="p-2 bg-accent-primary/10 rounded-lg">
                  <span className="text-sm font-medium text-accent-primary">{provider.id}</span>
                </div>
                <div>
                  <p className="font-medium text-text-primary">{provider.name}</p>
                  <p className="text-xs text-text-tertiary">Models: {provider.models.join(', ')}</p>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-1 max-w-md">
                <div className="relative flex-1">
                  <input
                    type={visibility[provider.id] ? 'text' : 'password'}
                    value={keys[provider.id] || ''}
                    onChange={(e) =>
                      setKeys((prev) => ({ ...prev, [provider.id]: e.target.value }))
                    }
                    placeholder="Enter API key..."
                    className="w-full px-4 py-2 pr-10 bg-background border border-border rounded-lg text-sm focus:border-accent-primary focus:ring-2 focus:ring-accent-primary/20 outline-none"
                  />
                  <button
                    onClick={() => toggleVisibility(provider.id)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-text-tertiary hover:text-text-primary"
                    aria-label={visibility[provider.id] ? 'Hide key' : 'Show key'}
                  >
                    {visibility[provider.id] ? (
                      <EyeOff width="18" height="18" />
                    ) : (
                      <Eye width="18" height="18" />
                    )}
                  </button>
                </div>
                {saved === provider.id ? (
                  <div className="flex items-center gap-1 text-success text-sm">
                    <CheckCircle width="16" height="16" />
                    Saved
                  </div>
                ) : (
                  <button
                    onClick={() => handleSave(provider.id)}
                    disabled={!keys[provider.id]}
                    className="px-3 py-2 bg-accent-primary text-accent-primary-text rounded-md text-sm font-medium hover:bg-accent-primary-hover transition-colors disabled:opacity-50"
                  >
                    Save
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Preferences Section */}
      <section className="mb-8">
        <h2 className="text-lg font-medium text-text-primary mb-4">Preferences</h2>
        <div className="space-y-4 bg-surface border border-border rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-text-primary">Theme</p>
              <p className="text-sm text-text-secondary">Choose color scheme</p>
            </div>
            <select className="px-3 py-2 bg-background border border-border rounded-lg text-sm focus:border-accent-primary focus:ring-2 focus:ring-accent-primary/20 outline-none">
              <option value="system">System</option>
              <option value="light">Light</option>
              <option value="dark">Dark</option>
            </select>
          </div>
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-text-primary">Streaming</p>
              <p className="text-sm text-text-secondary">Stream responses token by token</p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input type="checkbox" defaultChecked className="sr-only peer" />
              <div className="w-11 h-6 bg-border peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-accent-primary/20 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-accent-primary"></div>
            </label>
          </div>
        </div>
      </section>

      {/* About Section */}
      <section>
        <h2 className="text-lg font-medium text-text-primary mb-4">About</h2>
        <div className="bg-surface border border-border rounded-lg p-4">
          <p className="text-text-secondary text-sm">Prisma v0.0.0 — Universal AI Client</p>
          <p className="text-text-tertiary text-sm mt-2">
            Built with Tauri, React, and TypeScript. Bring your own keys.
          </p>
        </div>
      </section>
    </div>
  );
}
