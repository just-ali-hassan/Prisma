// Skill Loader (stub for M8)

import type { Skill } from './skill-types';

export class SkillLoader {
  private skills = new Map<string, Skill>();

  async loadSkillFolder(_folderPath: string): Promise<Skill> {
    throw new Error('Skill loader not implemented yet (M8)');
  }

  async loadSkillFromFile(_filePath: string): Promise<Skill> {
    throw new Error('Skill loader not implemented yet (M8)');
  }

  register(skill: Skill): void {
    this.skills.set(skill.id, skill);
  }

  get(id: string): Skill | undefined {
    return this.skills.get(id);
  }

  getAll(): Skill[] {
    return Array.from(this.skills.values());
  }

  getByProject(projectId: string): Skill[] {
    return Array.from(this.skills.values()).filter(
      (s) => s.projectId === projectId || !s.projectId
    );
  }

  enable(id: string): void {
    const skill = this.skills.get(id);
    if (skill) {
      skill.enabled = true;
    }
  }

  disable(id: string): void {
    const skill = this.skills.get(id);
    if (skill) {
      skill.enabled = false;
    }
  }

  remove(id: string): void {
    this.skills.delete(id);
  }
}

export const skillLoader = new SkillLoader();
