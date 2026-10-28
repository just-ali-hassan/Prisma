/**
 * Projects CRUD
 *
 * Database operations for projects and project files.
 */

import type { Database } from './schema';

export interface Project {
  id: string;
  name: string;
  instructions: string | null;
  settings: string | null; // JSON
  createdAt: number;
  updatedAt: number;
}

export interface ProjectFile {
  id: string;
  projectId: string;
  filename: string;
  mimeType: string;
  path: string;
  sizeBytes: number;
  createdAt: number;
}

/**
 * Create a new project.
 */
export async function createProject(
  db: Database,
  project: Omit<Project, 'createdAt' | 'updatedAt'> & {
    createdAt?: number;
    updatedAt?: number;
  }
): Promise<void> {
  const now = Date.now();
  await db.run(
    `INSERT INTO projects (id, name, instructions, settings, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      project.id,
      project.name,
      project.instructions,
      project.settings,
      project.createdAt ?? now,
      project.updatedAt ?? now,
    ]
  );
}

/**
 * Get a project by ID.
 */
export async function getProject(db: Database, id: string): Promise<Project | undefined> {
  return db.get<Project>('SELECT * FROM projects WHERE id = ?', [id]);
}

/**
 * Get all projects.
 */
export async function getProjects(db: Database): Promise<Project[]> {
  return db.all<Project>('SELECT * FROM projects ORDER BY updated_at DESC');
}

/**
 * Update a project.
 */
export async function updateProject(
  db: Database,
  id: string,
  updates: Partial<Pick<Project, 'name' | 'instructions' | 'settings'>>
): Promise<void> {
  const fields: string[] = [];
  const params: unknown[] = [];

  if (updates.name !== undefined) {
    fields.push('name = ?');
    params.push(updates.name);
  }
  if (updates.instructions !== undefined) {
    fields.push('instructions = ?');
    params.push(updates.instructions);
  }
  if (updates.settings !== undefined) {
    fields.push('settings = ?');
    params.push(updates.settings);
  }

  if (fields.length === 0) return;

  fields.push('updated_at = ?');
  params.push(Date.now());
  params.push(id);

  await db.run(`UPDATE projects SET ${fields.join(', ')} WHERE id = ?`, params);
}

/**
 * Delete a project and all its files.
 */
export async function deleteProject(db: Database, id: string): Promise<void> {
  // Files cascade deleted via FK
  await db.run('DELETE FROM projects WHERE id = ?', [id]);
}

/**
 * Create a project file record.
 */
export async function createProjectFile(
  db: Database,
  file: Omit<ProjectFile, 'createdAt'> & { createdAt?: number }
): Promise<void> {
  await db.run(
    `INSERT INTO project_files (id, project_id, filename, mime_type, path, size_bytes, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      file.id,
      file.projectId,
      file.filename,
      file.mimeType,
      file.path,
      file.sizeBytes,
      file.createdAt ?? Date.now(),
    ]
  );
}

/**
 * Get all files for a project.
 */
export async function getProjectFiles(db: Database, projectId: string): Promise<ProjectFile[]> {
  return db.all<ProjectFile>(
    'SELECT * FROM project_files WHERE project_id = ? ORDER BY created_at DESC',
    [projectId]
  );
}

/**
 * Get a project file by ID.
 */
export async function getProjectFile(db: Database, id: string): Promise<ProjectFile | undefined> {
  return db.get<ProjectFile>('SELECT * FROM project_files WHERE id = ?', [id]);
}

/**
 * Delete a project file.
 */
export async function deleteProjectFile(db: Database, id: string): Promise<void> {
  await db.run('DELETE FROM project_files WHERE id = ?', [id]);
}

/**
 * Delete all files for a project.
 */
export async function deleteAllProjectFiles(db: Database, projectId: string): Promise<void> {
  await db.run('DELETE FROM project_files WHERE project_id = ?', [projectId]);
}

/**
 * Get a project with its files.
 */
export async function getProjectWithFiles(
  db: Database,
  projectId: string
): Promise<{ project: Project | undefined; files: ProjectFile[] }> {
  const project = await getProject(db, projectId);
  const files = await getProjectFiles(db, projectId);
  return { project, files };
}
