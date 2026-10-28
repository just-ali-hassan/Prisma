// MCP Registry (stub for M8)

import type { MCPServerConfig } from './mcp-types';
import { MCPClient } from './mcp-client';

class MCPRegistry {
  private clients = new Map<string, MCPClient>();

  register(config: MCPServerConfig): void {
    const client = new MCPClient(config);
    this.clients.set(config.id, client);
  }

  get(id: string): MCPClient | undefined {
    return this.clients.get(id);
  }

  getAll(): MCPClient[] {
    return Array.from(this.clients.values());
  }

  remove(id: string): void {
    this.clients.delete(id);
  }

  clear(): void {
    this.clients.clear();
  }
}

export const mcpRegistry = new MCPRegistry();
