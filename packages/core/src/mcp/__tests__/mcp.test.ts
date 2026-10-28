import { describe, it, expect, beforeEach } from 'vitest';
import { MCPClient } from '../mcp-client';
import { mcpRegistry } from '../mcp-registry';
import type { MCPServerConfig } from '../mcp-types';

describe('MCP module', () => {
  const config: MCPServerConfig = {
    id: 'test-server',
    name: 'Test Server',
    transport: 'stdio',
    command: 'node',
    args: ['server.js'],
  };

  describe('MCPClient', () => {
    it('initializes and closes client', async () => {
      const client = new MCPClient(config);
      await expect(client.initialize()).rejects.toThrow('MCP client not implemented yet (M8)');
      expect(await client.listTools()).toEqual([]);
      await expect(client.callTool('echo', {})).rejects.toThrow('MCP callTool not implemented yet (M8)');
      await client.close();
    });
  });

  describe('MCPRegistry', () => {
    beforeEach(() => {
      mcpRegistry.clear();
    });

    it('registers, retrieves, lists, removes, and clears clients', () => {
      mcpRegistry.register(config);
      expect(mcpRegistry.get('test-server')).toBeDefined();
      expect(mcpRegistry.getAll()).toHaveLength(1);

      mcpRegistry.remove('test-server');
      expect(mcpRegistry.get('test-server')).toBeUndefined();
      expect(mcpRegistry.getAll()).toHaveLength(0);

      mcpRegistry.register(config);
      expect(mcpRegistry.getAll()).toHaveLength(1);
      mcpRegistry.clear();
      expect(mcpRegistry.getAll()).toHaveLength(0);
    });
  });
});
