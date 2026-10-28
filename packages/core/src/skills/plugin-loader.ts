// Plugin Loader (stub for M8)

import type { Plugin } from './skill-types';
import { skillLoader } from './skill-loader';

export class PluginLoader {
  private plugins = new Map<string, Plugin>();

  async loadPlugin(_pluginPath: string): Promise<Plugin> {
    throw new Error('Plugin loader not implemented yet (M8)');
  }

  async installPlugin(_plugin: Plugin): Promise<void> {
    this.plugins.set(_plugin.id, _plugin);
    // Register skills
    for (const skill of _plugin.skills) {
      skillLoader.register(skill);
    }
  }

  get(id: string): Plugin | undefined {
    return this.plugins.get(id);
  }

  getAll(): Plugin[] {
    return Array.from(this.plugins.values());
  }

  uninstall(id: string): void {
    const plugin = this.plugins.get(id);
    if (plugin) {
      for (const skill of plugin.skills) {
        skillLoader.remove(skill.id);
      }
      this.plugins.delete(id);
    }
  }
}

export const pluginLoader = new PluginLoader();
