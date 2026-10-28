import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Search, ChevronDown, ChevronUp, Sparkles, Check, ExternalLink } from 'lucide-react';
import type { ModelEntry } from '@prisma-ai/core/providers';
import { getModelsForProvider, MODEL_CAPABILITIES, providerRegistry, isModelUsable } from '@prisma-ai/core/providers';

interface ModelPickerProps {
  selectedModel: string;
  selectedProvider: string;
  onSelect: (modelId: string, providerId: string) => void;
  disabled?: boolean;
  className?: string;
}

interface GroupedModel {
  provider: string;
  models: ModelEntry[];
}

const PROVIDER_ICONS: Record<string, React.ReactNode> = {
  openai: <Sparkles className="w-5 h-5" />,
  anthropic: <span className="text-lg">🤖</span>,
  google: <span className="text-lg">🌈</span>,
  deepseek: <span className="text-lg">🐋</span>,
  xai: <span className="text-lg">⚡</span>,
  nvidia: <span className="text-lg">🟢</span>,
  openrouter: <ExternalLink className="w-5 h-5" />,
  omniroute: <ExternalLink className="w-5 h-5" />,
  groq: <span className="text-lg">⚡</span>,
  together: <span className="text-lg">🔥</span>,
  fireworks: <span className="text-lg">🎆</span>,
};

const PROVIDER_LABELS: Record<string, string> = {
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  google: 'Google',
  deepseek: 'DeepSeek',
  xai: 'xAI',
  nvidia: 'NVIDIA',
  openrouter: 'OpenRouter',
  omniroute: 'OmniRoute',
  groq: 'Groq',
  together: 'Together AI',
  fireworks: 'Fireworks AI',
};

function CapabilityBadge({ label, color }: { label: string; color: string }) {
  return (
    <span className={`px-1.5 py-0.5 text-xs font-medium rounded-full ${color}`}>
      {label}
    </span>
  );
}

function ModelItem({ model, isSelected, onClick }: { model: ModelEntry; isSelected: boolean; onClick: () => void }) {
  const caps = model.capabilities;
  const usable = isModelUsable(model.provider, model.id);
  
  return (
    <button
      onClick={onClick}
      disabled={!usable}
      className={`
        w-full text-left px-3 py-2 rounded-md text-sm
        transition-colors flex items-center gap-2
        ${!usable ? 'opacity-40 cursor-not-allowed' : ''}
        ${isSelected 
          ? 'bg-accent-primary text-accent-primary-text' 
          : 'hover:bg-surface-hover text-text-primary'
        }
      `}
    >
      <span className="font-medium truncate flex-1">{model.name}</span>
      <div className="flex items-center gap-1 flex-shrink-0">
        {caps.vision && <CapabilityBadge label="👁️ Vision" color="bg-accent-primary/20 text-accent-primary" />}
        {caps.toolCalling && <CapabilityBadge label="🔧 Tools" color="bg-info/20 text-info" />}
        {caps.imageGeneration && <CapabilityBadge label="🎨 Gen" color="bg-warning/20 text-warning" />}
        {caps.speechToText && <CapabilityBadge label="🎤 STT" color="bg-success/20 text-success" />}
        {caps.textToSpeech && <CapabilityBadge label="🔊 TTS" color="bg-purple/20 text-purple" />}
        {caps.fileInput && <CapabilityBadge label="📎 Files" color="bg-gray/20 text-gray" />}
        <span className="text-xs text-text-tertiary ml-auto">
          {model.contextWindow.toLocaleString()} ctx
        </span>
        {isSelected && <Check className="w-4 h-4 flex-shrink-0" />}
      </div>
    </button>
  );
}

function ProviderGroup({ group, searchQuery, selectedModel, selectedProvider, onSelect }: { 
  group: GroupedModel; 
  searchQuery: string;
  selectedModel: string;
  selectedProvider: string;
  onSelect: (model: ModelEntry) => void;
}) {
  const filteredModels = group.models.filter(model => 
    model.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    model.id.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (filteredModels.length === 0) return null;

  const isModelSelected = (modelId: string, providerId: string) => 
    selectedModel === modelId && selectedProvider === providerId;

  return (
    <div key={group.provider} className="border-b border-border last:border-0">
      <div className="px-3 py-2 bg-surface/50 border-b border-border/50">
        <div className="flex items-center gap-2">
          {PROVIDER_ICONS[group.provider] || <Sparkles className="w-4 h-4" />}
          <span className="text-xs font-semibold text-text-secondary uppercase tracking-wider">
            {PROVIDER_LABELS[group.provider] || group.provider}
          </span>
        </div>
      </div>
      <div className="p-1">
        {filteredModels.map(model => (
          <ModelItem
            key={`${group.provider}:${model.id}`}
            model={model}
            isSelected={isModelSelected(model.id, group.provider)}
            onClick={() => onSelect(model)}
          />
        ))}
      </div>
    </div>
  );
}

export function ModelPicker({
  selectedModel,
  selectedProvider,
  onSelect,
  disabled = false,
  className = '',
}: ModelPickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const groupedModels = useMemo<GroupedModel[]>(() => {
    const registered = providerRegistry.getRegisteredProviders();
    return registered
      .map(provider => {
        const adapter = providerRegistry.get(provider);
        if (!adapter) return { provider, models: [] };
        const models = getModelsForProvider(provider as any).filter(
          m => adapter.supportedModels.includes(m.id) && isModelUsable(provider, m.id)
        );
        return {
          provider,
          models,
        };
      })
      .filter(g => g.models.length > 0)
      .sort((a, b) => a.provider.localeCompare(b.provider));
  }, [isOpen]);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  useEffect(() => {
    if (isOpen && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [isOpen]);

  const handleModelClick = useCallback((model: ModelEntry) => {
    if (!isModelUsable(model.provider, model.id)) {
      return;
    }
    onSelect(model.id, model.provider);
    setIsOpen(false);
    setSearchQuery('');
  }, [onSelect]);

  const toggleDropdown = useCallback(() => {
    if (!disabled) {
      setIsOpen(!isOpen);
    }
  }, [disabled, isOpen]);

  const selectedEntry = MODEL_CAPABILITIES.find(
    m => m.id === selectedModel && m.provider === selectedProvider
  );

  return (
    <div className={`relative ${className}`} ref={dropdownRef}>
      {/* Trigger button */}
      <button
        type="button"
        onClick={toggleDropdown}
        disabled={disabled}
        className={`
          flex items-center justify-between gap-2 px-3 py-2
          bg-surface border border-border rounded-md
          text-sm font-medium text-text-primary
          hover:bg-surface-hover hover:border-border-hover
          disabled:opacity-50 disabled:cursor-not-allowed
          transition-colors min-w-[200px] max-w-[300px]
        `}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-label="Select model"
      >
        <div className="flex items-center gap-2 min-w-0 flex-1">
          {PROVIDER_ICONS[selectedProvider] || <Sparkles className="w-5 h-5 text-accent-primary" />}
          <span className="truncate font-medium">{selectedEntry?.name || selectedModel}</span>
        </div>
        {isOpen ? (
          <ChevronUp className="w-4 h-4 text-text-secondary flex-shrink-0" />
        ) : (
          <ChevronDown className="w-4 h-4 text-text-secondary flex-shrink-0" />
        )}
      </button>

      {/* Dropdown */}
      {isOpen && (
        <div className="absolute top-full left-0 right-0 mt-1 z-50 bg-surface border border-border rounded-lg shadow-lg overflow-hidden animate-slide-up max-h-[400px]">
          {/* Search */}
          <div className="p-3 border-b border-border">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-tertiary" />
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search models..."
                className="w-full pl-10 pr-4 py-2 bg-background border border-border rounded-lg text-sm focus:border-accent-primary focus:ring-2 focus:ring-accent-primary/20 outline-none"
              />
            </div>
          </div>

          {/* Model list */}
          <div className="max-h-[320px] overflow-y-auto">
            {groupedModels.length === 0 ? (
              <div className="p-4 text-center text-text-tertiary">
                No models available
              </div>
            ) : (
              groupedModels.map(group => (
                <ProviderGroup
                  key={group.provider}
                  group={group}
                  searchQuery={searchQuery}
                  selectedModel={selectedModel}
                  selectedProvider={selectedProvider}
                  onSelect={handleModelClick}
                />
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default ModelPicker;