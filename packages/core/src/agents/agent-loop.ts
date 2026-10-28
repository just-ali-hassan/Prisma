/**
 * Agent Loop
 *
 * Manages the agent execution loop: model call → tool call → result → repeat.
 * Enforces step limits and stop signals.
 */

import type {
  ChatRequest,
  NormalizedMessage,
  ToolCall,
  TokenUsage,
  ModelId,
  ProviderId,
} from '../providers/types';
import { getAdapter } from '../providers/registry';
import { ChatSession } from '../chat/chat-session';
import { checkEntitlement } from '../entitlements/entitlements';

export interface AgentLoopOptions {
  maxSteps: number;
  autoApproveReadOnly: boolean;
  onToken?: (token: string) => void;
  onToolCall?: (toolCalls: ToolCall[]) => void;
  onToolResult?: (toolCallId: string, result: string, isError: boolean) => void;
  onStep?: (step: number, maxSteps: number) => void;
  onError?: (error: Error) => void;
  onDone?: (usage?: TokenUsage) => void;
  onStop?: () => void;
}

export interface AgentState {
  isRunning: boolean;
  currentStep: number;
  maxSteps: number;
  stopRequested: boolean;
  messages: NormalizedMessage[];
  totalUsage: TokenUsage | null;
  totalCost: number;
}

export class AgentLoop {
  private state: AgentState;
  private options: AgentLoopOptions;
  private abortController: AbortController | null = null;
  private chatSession: ChatSession;

  constructor(
    initialMessages: NormalizedMessage[],
    model: ModelId,
    provider: ProviderId,
    options: AgentLoopOptions
  ) {
    checkEntitlement('agents');

    this.state = {
      isRunning: false,
      currentStep: 0,
      maxSteps: options.maxSteps,
      stopRequested: false,
      messages: [...initialMessages],
      totalUsage: null,
      totalCost: 0,
    };
    this.options = options;

    this.chatSession = new ChatSession(initialMessages, model, provider, {
      onToken: options.onToken,
      onToolCall: options.onToolCall,
      onDone: (usage) => this.handleDone(usage),
      onError: options.onError,
      onMessage: (msg) => this.state.messages.push(msg),
    });
  }

  getState(): Readonly<AgentState> {
    return { ...this.state };
  }

  async run(userMessage: string): Promise<void> {
    if (this.state.isRunning) {
      throw new Error('Agent loop already running');
    }

    this.state.isRunning = true;
    this.state.stopRequested = false;
    this.abortController = new AbortController();

    // Add user message
    this.state.messages.push({ role: 'user', content: userMessage });
    this.options.onToken?.(userMessage);

    try {
      while (this.state.currentStep < this.state.maxSteps && !this.state.stopRequested) {
        this.state.currentStep++;
        this.options.onStep?.(this.state.currentStep, this.state.maxSteps);

        const adapter = getAdapter(this.chatSession.getState().currentProvider);
        const request: ChatRequest = {
          messages: this.state.messages,
          model: this.chatSession.getState().currentModel,
          provider: this.chatSession.getState().currentProvider,
          stream: true,
          tools: [], // TODO: Get from MCP registry
        };

        let assistantContent = '';
        const assistantToolCalls: ToolCall[] = [];

        await new Promise<void>((resolve, reject) => {
          adapter
            .stream(
              request,
              (event) => {
                if (this.state.stopRequested || this.abortController?.signal.aborted) {
                  adapter.cancel();
                  reject(new Error('Stopped'));
                  return;
                }

                switch (event.type) {
                  case 'token': {
                    const content = event.content ?? '';
                    assistantContent += content;
                    this.options.onToken?.(content);
                    break;
                  }
                  case 'tool_call': {
                    const toolCalls = event.toolCalls ?? [];
                    assistantToolCalls.push(...toolCalls);
                    this.options.onToolCall?.(toolCalls);
                    break;
                  }
                  case 'done':
                    if (event.usage) {
                      this.accumulateUsage(event.usage);
                    }
                    resolve();
                    break;
                  case 'error':
                    reject(event.error ?? new Error('Stream error'));
                    break;
                }
              },
              this.abortController!.signal
            )
            .catch(reject);
        });

        // Add assistant message
        const assistantMessage: NormalizedMessage = {
          role: 'assistant',
          content: assistantContent || null,
          toolCalls: assistantToolCalls.length > 0 ? assistantToolCalls : undefined,
        };
        this.state.messages.push(assistantMessage);

        // If no tool calls, we're done
        if (assistantToolCalls.length === 0) {
          this.options.onDone?.(this.state.totalUsage ?? undefined);
          break;
        }

        // Execute tool calls
        for (const toolCall of assistantToolCalls) {
          if (this.state.stopRequested) break;

          const isReadOnly = this.isReadOnlyTool(toolCall);
          const approved = this.options.autoApproveReadOnly ? isReadOnly : true;

          if (approved) {
            try {
              const result = await this.executeTool(toolCall);
              this.state.messages.push({
                role: 'tool',
                content: result,
                toolCallId: toolCall.id,
              });
              this.options.onToolResult?.(toolCall.id, result, false);
            } catch (error) {
              const errorMsg = error instanceof Error ? error.message : String(error);
              this.state.messages.push({
                role: 'tool',
                content: `Error: ${errorMsg}`,
                toolCallId: toolCall.id,
              });
              this.options.onToolResult?.(toolCall.id, errorMsg, true);
            }
          } else {
            // User denied - send denial back to model
            this.state.messages.push({
              role: 'tool',
              content: 'User denied this action',
              toolCallId: toolCall.id,
            });
            this.options.onToolResult?.(toolCall.id, 'User denied', true);
          }
        }
      }

      if (this.state.currentStep >= this.state.maxSteps) {
        this.options.onError?.(new Error(`Max steps (${this.state.maxSteps}) reached`));
      }
    } finally {
      this.state.isRunning = false;
      this.abortController = null;
    }
  }

  stop(): void {
    this.state.stopRequested = true;
    this.abortController?.abort();
    this.options.onStop?.();
  }

  private accumulateUsage(usage: TokenUsage): void {
    if (!this.state.totalUsage) {
      this.state.totalUsage = { ...usage };
    } else {
      this.state.totalUsage.promptTokens += usage.promptTokens;
      this.state.totalUsage.completionTokens += usage.completionTokens;
      this.state.totalUsage.totalTokens += usage.totalTokens;
    }
  }

  private handleDone(usage?: TokenUsage): void {
    if (usage) {
      this.accumulateUsage(usage);
    }
  }

  private isReadOnlyTool(toolCall: ToolCall): boolean {
    // Define read-only tools
    const readOnlyTools = ['read_file', 'list_files', 'search', 'web_search', 'github_get'];
    return readOnlyTools.includes(toolCall.function.name);
  }

  private async executeTool(toolCall: ToolCall): Promise<string> {
    // TODO: Implement actual tool execution via MCP
    // For now, return mock result
    return await Promise.resolve(
      JSON.stringify({
        result: `Executed ${toolCall.function.name}`,
        toolCallId: toolCall.id,
      })
    );
  }
}

export function createAgentLoop(
  messages: NormalizedMessage[],
  model: ModelId,
  provider: ProviderId,
  options: AgentLoopOptions
): AgentLoop {
  return new AgentLoop(messages, model, provider, options);
}
