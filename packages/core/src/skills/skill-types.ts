// Skill Types

export interface Skill {
  id: string;
  name: string;
  description: string;
  instructions: string;
  resources?: SkillResource[];
  enabled: boolean;
  projectId?: string;
}

export interface SkillResource {
  type: 'file' | 'url' | 'text';
  path?: string;
  url?: string;
  content?: string;
  mimeType?: string;
}

export interface Plugin {
  id: string;
  name: string;
  version: string;
  description: string;
  skills: Skill[];
  mcpConnectors?: {
    id: string;
    config: Record<string, unknown>;
  }[];
}
