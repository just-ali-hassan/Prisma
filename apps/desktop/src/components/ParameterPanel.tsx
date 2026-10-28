import { useState, useCallback } from 'react';
import { SlidersHorizontal, X, Thermometer, Maximize, Minimize, HelpCircle } from 'lucide-react';
import { useChatStore } from '@/stores/chatStore';
import type { ModelEntry } from '@prisma-ai/core/providers';
import { getModelCapabilities, MODEL_CAPABILITIES } from '@prisma-ai/core/providers';

interface ParameterPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

export function ParameterPanel({ isOpen, onClose }: ParameterPanelProps) {
  const {
    temperature,
    maxTokens,
    topP,
    frequencyPenalty,
    presencePenalty,
    systemPrompt,
    currentModel,
    currentProvider,
    setTemperature,
    setMaxTokens,
    setTopP,
    setFrequencyPenalty,
    setPresencePenalty,
    setSystemPrompt,
  } = useChatStore();

  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showSystemPrompt, setShowSystemPrompt] = useState(false);

  const selectedEntry = MODEL_CAPABILITIES.find(
    m => m.id === currentModel && m.provider === currentProvider
  );
  const caps = selectedEntry?.capabilities;
  const isReasoning = /^(o1|o3|o4)/i.test(currentModel) || Boolean(caps?.reasoning);
  const supportsPenalties = !isReasoning && currentProvider !== 'anthropic' && currentProvider !== 'google';

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Panel */}
      <div className="absolute right-0 top-0 bottom-0 w-full max-w-md bg-surface border-l border-border shadow-xl flex flex-col animate-slide-in">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h2 className="text-lg font-semibold text-text-primary">Parameters</h2>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-surface-hover text-text-secondary transition-colors"
            aria-label="Close parameters"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-6">
          {/* Model Info */}
          <div className="bg-background border border-border rounded-lg p-3">
            <div className="flex items-center gap-2 mb-2">
              <span className="font-medium text-text-primary">{selectedEntry?.name || 'Unknown'}</span>
              <span className="text-xs text-text-tertiary">({currentProvider})</span>
            </div>
            <div className="flex flex-wrap gap-1 text-xs">
              {caps?.vision && <span className="px-2 py-0.5 bg-accent-primary/20 text-accent-primary rounded">👁️ Vision</span>}
              {caps?.toolCalling && <span className="px-2 py-0.5 bg-info/20 text-info rounded">🔧 Tools</span>}
              {caps?.imageGeneration && <span className="px-2 py-0.5 bg-warning/20 text-warning rounded">🎨 Gen</span>}
              {caps?.speechToText && <span className="px-2 py-0.5 bg-success/20 text-success rounded">🎤 STT</span>}
              {caps?.textToSpeech && <span className="px-2 py-0.5 bg-purple/20 text-purple rounded">🔊 TTS</span>}
              {caps?.fileInput && <span className="px-2 py-0.5 bg-gray/20 text-gray rounded">📎 Files</span>}
              <span className="px-2 py-0.5 bg-gray/20 text-gray rounded">
                {selectedEntry?.contextWindow.toLocaleString()} ctx
              </span>
            </div>
          </div>

          {/* Basic Parameters */}
          <div className="space-y-4">
            <div>
              <label className="flex items-center justify-between text-sm mb-2">
                <span className="font-medium text-text-primary">Temperature</span>
                <span className="text-text-secondary font-mono">{temperature.toFixed(1)}</span>
              </label>
              <input
                type="range"
                min="0"
                max="2"
                step="0.1"
                value={temperature}
                onChange={(e) => setTemperature(parseFloat(e.target.value))}
                disabled={isReasoning}
                className="w-full h-2 bg-border rounded-lg appearance-none cursor-pointer accent-accent-primary disabled:opacity-40 disabled:cursor-not-allowed"
              />
              <p className="text-xs text-text-tertiary">
                {isReasoning
                  ? `Not supported by reasoning models (${selectedEntry?.name || currentModel}).`
                  : 'Controls randomness. Higher = more creative, lower = more focused.'}
              </p>
            </div>

            <div>
              <label className="flex items-center justify-between text-sm mb-2">
                <span className="font-medium text-text-primary">Max Tokens</span>
                <span className="text-text-secondary font-mono">{maxTokens.toLocaleString()}</span>
              </label>
              <input
                type="range"
                min="1"
                max={selectedEntry?.contextWindow || 4096}
                step="1"
                value={maxTokens}
                onChange={(e) => setMaxTokens(parseInt(e.target.value, 10))}
                className="w-full h-2 bg-border rounded-lg appearance-none cursor-pointer accent-accent-primary"
              />
              <p className="text-xs text-text-tertiary">
                Maximum tokens in response. Model max: {selectedEntry?.contextWindow.toLocaleString() || '4,096'}
              </p>
            </div>

            <div>
              <label className="flex items-center justify-between text-sm mb-2">
                <span className="font-medium text-text-primary">Top-p</span>
                <span className="text-text-secondary font-mono">{topP.toFixed(1)}</span>
              </label>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={topP}
                onChange={(e) => setTopP(parseFloat(e.target.value))}
                disabled={isReasoning}
                className="w-full h-2 bg-border rounded-lg appearance-none cursor-pointer accent-accent-primary disabled:opacity-40 disabled:cursor-not-allowed"
              />
              <p className="text-xs text-text-tertiary">
                {isReasoning
                  ? `Not supported by reasoning models (${selectedEntry?.name || currentModel}).`
                  : 'Nucleus sampling. Lower = more focused, higher = more diverse.'}
              </p>
            </div>
          </div>

          {/* Advanced Parameters */}
          <div className="border-t border-border pt-4">
            <button
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="flex items-center gap-2 text-sm text-text-secondary hover:text-text-primary transition-colors"
            >
              <span>{showAdvanced ? <Minimize className="w-4 h-4" /> : <Maximize className="w-4 h-4" />}</span>
              <span>Advanced Parameters</span>
              {!supportsPenalties && (
                <span className="text-xs text-text-tertiary">(unsupported)</span>
              )}
            </button>

            {showAdvanced && (
              <div className="mt-4 space-y-4">
                <div>
                  <label className="flex items-center justify-between text-sm mb-2">
                    <span className="font-medium text-text-primary">Frequency Penalty</span>
                    <span className="text-text-secondary font-mono">{frequencyPenalty.toFixed(1)}</span>
                  </label>
                  <input
                    type="range"
                    min="-2"
                    max="2"
                    step="0.1"
                    value={frequencyPenalty}
                    onChange={(e) => setFrequencyPenalty(parseFloat(e.target.value))}
                    disabled={!supportsPenalties}
                    className="w-full h-2 bg-border rounded-lg appearance-none cursor-pointer accent-accent-primary disabled:opacity-40 disabled:cursor-not-allowed"
                  />
                  <p className="text-xs text-text-tertiary">
                    {!supportsPenalties
                      ? isReasoning
                        ? `Not supported by reasoning models (${selectedEntry?.name || currentModel}).`
                        : `Not supported by ${currentProvider}.`
                      : 'Reduces repetition. Positive values penalize frequent tokens.'}
                  </p>
                </div>

                <div>
                  <label className="flex items-center justify-between text-sm mb-2">
                    <span className="font-medium text-text-primary">Presence Penalty</span>
                    <span className="text-text-secondary font-mono">{presencePenalty.toFixed(1)}</span>
                  </label>
                  <input
                    type="range"
                    min="-2"
                    max="2"
                    step="0.1"
                    value={presencePenalty}
                    onChange={(e) => setPresencePenalty(parseFloat(e.target.value))}
                    disabled={!supportsPenalties}
                    className="w-full h-2 bg-border rounded-lg appearance-none cursor-pointer accent-accent-primary disabled:opacity-40 disabled:cursor-not-allowed"
                  />
                  <p className="text-xs text-text-tertiary">
                    {!supportsPenalties
                      ? isReasoning
                        ? `Not supported by reasoning models (${selectedEntry?.name || currentModel}).`
                        : `Not supported by ${currentProvider}.`
                      : 'Encourages new topics. Positive values penalize repeated tokens.'}
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* System Prompt */}
          <div className="border-t border-border pt-4">
            <button
              onClick={() => setShowSystemPrompt(!showSystemPrompt)}
              className="flex items-center gap-2 text-sm text-text-secondary hover:text-text-primary transition-colors"
            >
              <span>{showSystemPrompt ? <Minimize className="w-4 h-4" /> : <Maximize className="w-4 h-4" />}</span>
              <span>System Prompt</span>
              {systemPrompt && <span className="text-xs text-success">✓ Set</span>}
            </button>

            {showSystemPrompt && (
              <div className="mt-4">
                <textarea
                  value={systemPrompt}
                  onChange={(e) => setSystemPrompt(e.target.value)}
                  placeholder="Enter system prompt to guide the model's behavior..."
                  rows={4}
                  className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm focus:border-accent-primary focus:ring-2 focus:ring-accent-primary/20 outline-none resize-y min-h-[80px]"
                />
                <p className="text-xs text-text-tertiary mt-1">
                  This prompt is prepended to every conversation. Leave empty for default behavior.
                </p>
              </div>
            )}
          </div>

          {/* Quick Actions */}
          <div className="border-t border-border pt-4 flex gap-2">
            <button
              onClick={() => {
                setTemperature(0.7);
                setMaxTokens(4096);
                setTopP(1.0);
                setFrequencyPenalty(0);
                setPresencePenalty(0);
                setSystemPrompt('');
              }}
              className="flex-1 px-3 py-2 bg-surface border border-border rounded-md text-sm font-medium text-text-primary hover:bg-surface-hover transition-colors"
            >
              Reset to Defaults
            </button>
            <button
              onClick={onClose}
              className="flex-1 px-3 py-2 bg-accent-primary text-accent-primary-text rounded-md text-sm font-medium hover:bg-accent-primary-hover transition-colors"
            >
              Done
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}