import { describe, it, expect, beforeEach } from 'vitest';
import { skillLoader, SkillLoader } from '../skill-loader';
import { pluginLoader, PluginLoader } from '../plugin-loader';
import type { Skill, Plugin } from '../skill-types';

describe('Skills and Plugin module', () => {
  const sampleSkill: Skill = {
    id: 'skill-1',
    name: 'Sample Skill',
    description: 'A test skill',
    version: '1.0.0',
    enabled: false,
    projectId: 'proj-1',
    instructions: 'Do something',
  };

  const samplePlugin: Plugin = {
    id: 'plugin-1',
    name: 'Sample Plugin',
    description: 'A test plugin',
    version: '1.0.0',
    enabled: true,
    skills: [sampleSkill],
  };

  describe('SkillLoader', () => {
    let loader: SkillLoader;

    beforeEach(() => {
      loader = new SkillLoader();
    });

    it('throws on load methods', async () => {
      await expect(loader.loadSkillFolder('/tmp/skills')).rejects.toThrow('Skill loader not implemented yet (M8)');
      await expect(loader.loadSkillFromFile('/tmp/skills/skill.json')).rejects.toThrow('Skill loader not implemented yet (M8)');
    });

    it('manages skills: register, get, getAll, getByProject, enable, disable, remove', () => {
      loader.register(sampleSkill);
      expect(loader.get('skill-1')).toEqual(sampleSkill);
      expect(loader.getAll()).toHaveLength(1);

      expect(loader.getByProject('proj-1')).toHaveLength(1);
      expect(loader.getByProject('proj-2')).toHaveLength(0);

      loader.enable('skill-1');
      expect(loader.get('skill-1')?.enabled).toBe(true);

      loader.disable('skill-1');
      expect(loader.get('skill-1')?.enabled).toBe(false);

      loader.enable('non-existent');
      loader.disable('non-existent');

      loader.remove('skill-1');
      expect(loader.get('skill-1')).toBeUndefined();
    });

    it('matches skills without projectId in getByProject', () => {
      const globalSkill: Skill = { ...sampleSkill, id: 'global-1', projectId: undefined };
      loader.register(globalSkill);
      expect(loader.getByProject('any-proj')).toHaveLength(1);
    });
  });

  describe('PluginLoader', () => {
    let loader: PluginLoader;

    beforeEach(() => {
      loader = new PluginLoader();
    });

    it('throws on loadPlugin', async () => {
      await expect(loader.loadPlugin('/tmp/plugin')).rejects.toThrow('Plugin loader not implemented yet (M8)');
    });

    it('installs, gets, lists, and uninstalls plugins', async () => {
      await loader.installPlugin(samplePlugin);
      expect(loader.get('plugin-1')).toEqual(samplePlugin);
      expect(loader.getAll()).toHaveLength(1);
      expect(skillLoader.get('skill-1')).toBeDefined();

      loader.uninstall('plugin-1');
      expect(loader.get('plugin-1')).toBeUndefined();
      expect(skillLoader.get('skill-1')).toBeUndefined();

      loader.uninstall('non-existent');
    });
  });
});
