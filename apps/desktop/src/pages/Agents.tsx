import { Bot, Play, Square, Settings, Zap } from 'lucide-react';
import { useState } from 'react';

export function Agents() {
  const [agentMode, setAgentMode] = useState(false);
  const [autoApprove, setAutoApprove] = useState(true);
  const [maxSteps, setMaxSteps] = useState(10);

  return (
    <div className="h-full overflow-y-auto p-6 max-w-3xl mx-auto">
      <h1 className="text-2xl font-semibold text-text-primary mb-6 flex items-center gap-2">
        <Bot className="w-6 h-6 text-accent-primary" />
        Agents
      </h1>

      {/* Agent Mode Toggle */}
      <section className="mb-8">
        <div className="bg-surface border border-border rounded-lg p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-lg font-medium text-text-primary">Agent Mode</h2>
              <p className="text-sm text-text-secondary">
                Enable autonomous tool use and multi-step reasoning
              </p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={agentMode}
                onChange={(e) => setAgentMode(e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-border peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-accent-primary/20 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-accent-primary"></div>
            </label>
          </div>
          {agentMode && (
            <div className="space-y-4 pt-4 border-t border-border">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-text-primary">Auto-approve read-only actions</p>
                  <p className="text-sm text-text-secondary">
                    Automatically execute read-only tools without confirmation
                  </p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={autoApprove}
                    onChange={(e) => setAutoApprove(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-border peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-accent-primary/20 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-accent-primary"></div>
                </label>
              </div>
              <div>
                <label className="block text-sm font-medium text-text-primary mb-2">
                  Max steps: {maxSteps}
                </label>
                <input
                  type="range"
                  min="1"
                  max="20"
                  value={maxSteps}
                  onChange={(e) => setMaxSteps(Number(e.target.value))}
                  className="w-full h-2 bg-border rounded-lg appearance-none cursor-pointer accent-accent-primary"
                />
                <p className="text-xs text-text-tertiary mt-1">
                  Limit the number of tool calls per agent run
                </p>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Available Tools */}
      <section className="mb-8">
        <h2 className="text-lg font-medium text-text-primary mb-4">Available Tools</h2>
        <div className="bg-surface border border-border rounded-lg p-4">
          <p className="text-text-secondary text-sm mb-4">
            Tools are provided by MCP connectors. Configure connectors in Settings → MCP Connectors.
          </p>
          <div className="space-y-2">
            {[
              {
                name: 'File System',
                description: 'Read, write, and list files',
                category: 'Local',
              },
              {
                name: 'Web Search',
                description: 'Search the web for information',
                category: 'Remote',
              },
              { name: 'Code Execution', description: 'Run code in a sandbox', category: 'Local' },
              {
                name: 'GitHub',
                description: 'Interact with GitHub repositories',
                category: 'Remote',
              },
            ].map((tool) => (
              <div
                key={tool.name}
                className="flex items-center justify-between p-3 bg-background border border-border rounded-md"
              >
                <div className="flex items-center gap-3">
                  <Zap className="w-5 h-5 text-accent-primary" />
                  <div>
                    <p className="font-medium text-text-primary">{tool.name}</p>
                    <p className="text-sm text-text-secondary">{tool.description}</p>
                  </div>
                </div>
                <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-accent-primary/10 text-accent-primary">
                  {tool.category}
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Cost Estimate */}
      <section>
        <h2 className="text-lg font-medium text-text-primary mb-4">Cost Estimation</h2>
        <div className="bg-surface border border-border rounded-lg p-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-background p-4 rounded-lg">
              <p className="text-text-tertiary text-sm">Estimated cost per agent run</p>
              <p className="text-2xl font-semibold text-text-primary mt-1">$0.00</p>
            </div>
            <div className="bg-background p-4 rounded-lg">
              <p className="text-text-tertiary text-sm">Total this session</p>
              <p className="text-2xl font-semibold text-text-primary mt-1">$0.00</p>
            </div>
          </div>
          <p className="text-xs text-text-tertiary mt-4 text-center">
            Costs are estimates based on token usage and model pricing. Actual costs may vary.
          </p>
        </div>
      </section>
    </div>
  );
}
