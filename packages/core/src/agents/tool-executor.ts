/**
 * Tool Executor
 *
 * Executes tool calls with permission enforcement.
 * Read-only tools can be auto-approved; write/delete/send/spend tools require confirmation.
 */

import type { ToolCall, ToolResult } from '../providers/types';
import { checkEntitlement } from '../entitlements/entitlements';

export interface ToolExecutorOptions {
  autoApproveReadOnly: boolean;
  onConfirmationRequired?: (toolCall: ToolCall) => Promise<boolean>;
}

export interface AgentToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  category: 'read' | 'write' | 'delete' | 'send' | 'spend';
}

export class ToolExecutor {
  private tools = new Map<string, AgentToolDefinition>();
  private options: ToolExecutorOptions;

  constructor(options: ToolExecutorOptions) {
    this.options = options;
    checkEntitlement('agents');
  }

  registerTool(definition: AgentToolDefinition): void {
    this.tools.set(definition.name, definition);
  }

  unregisterTool(name: string): void {
    this.tools.delete(name);
  }

  getTool(name: string): AgentToolDefinition | undefined {
    return this.tools.get(name);
  }

  getAllTools(): AgentToolDefinition[] {
    return Array.from(this.tools.values());
  }

  async execute(toolCall: ToolCall): Promise<ToolResult> {
    const tool = this.tools.get(toolCall.function.name);
    if (!tool) {
      return {
        toolCallId: toolCall.id,
        content: `Tool not found: ${toolCall.function.name}`,
        isError: true,
      };
    }

    // Check if auto-approval applies
    const isReadOnly = tool.category === 'read';
    let approved = false;

    if (isReadOnly && this.options.autoApproveReadOnly) {
      approved = true;
    } else if (this.options.onConfirmationRequired) {
      approved = await this.options.onConfirmationRequired(toolCall);
    }

    if (!approved) {
      return {
        toolCallId: toolCall.id,
        content: 'User denied this action',
        isError: true,
      };
    }

    try {
      // Parse arguments
      const args = (JSON.parse(toolCall.function.arguments) ?? {}) as Record<string, unknown>;

      // Execute the tool (implementation depends on the tool)
      const result = await this.executeTool(tool.name, args);

      return {
        toolCallId: toolCall.id,
        content: typeof result === 'string' ? result : JSON.stringify(result),
        isError: false,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        toolCallId: toolCall.id,
        content: `Error executing tool: ${message}`,
        isError: true,
      };
    }
  }

  private async executeTool(name: string, args: Record<string, unknown>): Promise<unknown> {
    // This would call the actual MCP server or built-in tool
    // For now, return a mock result
    return await Promise.resolve({ success: true, tool: name, args });
  }

  /**
   * Check if a tool requires user confirmation.
   */
  requiresConfirmation(toolCall: ToolCall): boolean {
    const tool = this.tools.get(toolCall.function.name);
    if (!tool) return true; // Unknown tools require confirmation
    return tool.category !== 'read' || !this.options.autoApproveReadOnly;
  }
}

export function createToolExecutor(options: ToolExecutorOptions): ToolExecutor {
  return new ToolExecutor(options);
}
