// MCP Client (stub for M8)

import type { MCPServerConfig, MCPTool, MCPInitializeResult } from './mcp-types';

export class MCPClient {
  private config: MCPServerConfig;
  private initialized = false;
  private tools: MCPTool[] = [];

  constructor(config: MCPServerConfig) {
    this.config = config;
  }

  async initialize(): Promise<MCPInitializeResult> {
    throw new Error('MCP client not implemented yet (M8)');
  }

  async listTools(): Promise<MCPTool[]> {
    return this.tools;
  }

  async callTool(_name: string, _args: Record<string, unknown>): Promise<unknown> {
    throw new Error('MCP callTool not implemented yet (M8)');
  }

  async close(): Promise<void> {
    this.initialized = false;
  }
}
