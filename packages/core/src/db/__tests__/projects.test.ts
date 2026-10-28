/**
 * Projects CRUD Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createProject,
  getProject,
  getProjects,
  updateProject,
  deleteProject,
  createProjectFile,
  getProjectFiles,
  deleteProjectFile,
  getProjectFile,
  deleteAllProjectFiles,
  getProjectWithFiles,
} from '../projects';
import type { Database, Project, ProjectFile } from '../schema';

// Mock database implementation
const createMockDb = (): Database & {
  executedSql: string[];
  runCalls: { sql: string; params: unknown[] }[];
  getCalls: { sql: string; params: unknown[] }[];
  allCalls: { sql: string; params: unknown[] }[];
} => {
  const executedSql: string[] = [];
  const runCalls: { sql: string; params: unknown[] }[] = [];
  const getCalls: { sql: string; params: unknown[] }[] = [];
  const allCalls: { sql: string; params: unknown[] }[] = [];

  return {
    executedSql,
    runCalls,
    getCalls,
    allCalls,
    async exec(sql: string) {
      executedSql.push(sql);
    },
    async run(sql: string, params: unknown[] = []) {
      runCalls.push({ sql, params });
      return { lastInsertRowid: 1, changes: 1 };
    },
    async get<T>(sql: string, params: unknown[] = []) {
      getCalls.push({ sql, params });
      return undefined as T | undefined;
    },
    async all<T>(sql: string, params: unknown[] = []) {
      allCalls.push({ sql, params });
      return [] as T[];
    },
    async close() {},
  };
};

describe('Projects CRUD', () => {
  let db: ReturnType<typeof createMockDb>;

  beforeEach(() => {
    db = createMockDb();
  });

  describe('createProject', () => {
    it('inserts a project with all fields', async () => {
      const project = {
        id: 'proj-1',
        name: 'Test Project',
        instructions: 'Be helpful',
        settings: '{"model": "gpt-4o"}',
        createdAt: 1000,
        updatedAt: 1000,
      };

      await createProject(db, project);

      expect(db.runCalls).toHaveLength(1);
      expect(db.runCalls[0].sql).toContain('INSERT INTO projects');
      expect(db.runCalls[0].params).toEqual([
        'proj-1',
        'Test Project',
        'Be helpful',
        '{"model": "gpt-4o"}',
        1000,
        1000,
      ]);
    });

    it('uses current time if timestamps not provided', async () => {
      const before = Date.now();
      const project = { id: 'proj-1', name: 'Test' };

      await createProject(db, project);

      expect(db.runCalls[0].params[4]).toBeGreaterThanOrEqual(before);
      expect(db.runCalls[0].params[5]).toBeGreaterThanOrEqual(before);
    });
  });

  describe('getProject', () => {
    it('queries project by id', async () => {
      const mockProject: Project = {
        id: 'proj-1', name: 'Test', instructions: 'Helpful', settings: '{}',
        createdAt: 1000, updatedAt: 1000,
      };

      const dbWithGet = createMockDb();
      const originalGet = dbWithGet.get;
      dbWithGet.get = async (sql: string, params: unknown[] = []) => {
        originalGet(sql, params);
        return mockProject;
      };

      const result = await getProject(dbWithGet, 'proj-1');
      expect(result).toEqual(mockProject);
      expect(dbWithGet.getCalls[0].sql).toContain('SELECT * FROM projects WHERE id = ?');
    });
  });

  describe('getProjects', () => {
    it('queries all projects ordered by updated_at desc', async () => {
      const mockProjects: Project[] = [
        { id: '1', name: 'A', instructions: null, settings: null, createdAt: 1, updatedAt: 1 },
        { id: '2', name: 'B', instructions: null, settings: null, createdAt: 2, updatedAt: 2 },
      ];

      const dbWithAll = createMockDb();
      const originalAll = dbWithAll.all;
      dbWithAll.all = async (sql: string, params: unknown[] = []) => {
        originalAll(sql, params);
        return mockProjects;
      };

      const result = await getProjects(dbWithAll);
      expect(result).toEqual(mockProjects);
      expect(dbWithAll.allCalls[0].sql).toContain('ORDER BY updated_at DESC');
    });
  });

  describe('updateProject', () => {
    it('updates provided fields', async () => {
      await updateProject(db, 'proj-1', {
        name: 'New Name',
        instructions: 'New instructions',
        settings: '{"model": "gpt-4o"}',
      });

      expect(db.runCalls).toHaveLength(1);
      expect(db.runCalls[0].sql).toContain('UPDATE projects SET');
      expect(db.runCalls[0].sql).toContain('name = ?');
      expect(db.runCalls[0].sql).toContain('instructions = ?');
      expect(db.runCalls[0].sql).toContain('settings = ?');
      expect(db.runCalls[0].sql).toContain('updated_at = ?');
      expect(db.runCalls[0].params).toEqual([
        'New Name',
        'New instructions',
        '{"model": "gpt-4o"}',
        expect.any(Number),
        'proj-1',
      ]);
    });

    it('does nothing if no fields provided', async () => {
      await updateProject(db, 'proj-1', {});
      expect(db.runCalls).toHaveLength(0);
    });
  });

  describe('deleteProject', () => {
    it('deletes project by id', async () => {
      await deleteProject(db, 'proj-1');
      expect(db.runCalls).toHaveLength(1);
      expect(db.runCalls[0].sql).toBe('DELETE FROM projects WHERE id = ?');
    });
  });

  describe('createProjectFile', () => {
    it('inserts a project file', async () => {
      const file: ProjectFile = {
        id: 'file-1',
        projectId: 'proj-1',
        filename: 'test.txt',
        mimeType: 'text/plain',
        path: '/path/to/test.txt',
        sizeBytes: 100,
        createdAt: 1000,
      };

      await createProjectFile(db, file);

      expect(db.runCalls).toHaveLength(1);
      expect(db.runCalls[0].sql).toContain('INSERT INTO project_files');
      expect(db.runCalls[0].params).toEqual([
        'file-1', 'proj-1', 'test.txt', 'text/plain', '/path/to/test.txt', 100, 1000,
      ]);
    });

    it('defaults createdAt when not provided', async () => {
      const file: ProjectFile = {
        id: 'file-2',
        projectId: 'proj-1',
        filename: 'test2.txt',
        mimeType: 'text/plain',
        path: '/path/to/test2.txt',
        sizeBytes: 100,
        createdAt: undefined as unknown as number,
      };

      await createProjectFile(db, file);
      expect(typeof db.runCalls[0].params[6]).toBe('number');
    });
  });

  describe('getProjectFiles', () => {
    it('queries files for a project', async () => {
      const mockFiles: ProjectFile[] = [
        { id: '1', projectId: 'p', filename: 'a.txt', mimeType: 'text/plain', path: '/a', sizeBytes: 10, createdAt: 1 },
      ];

      const dbWithAll = createMockDb();
      const originalAll = dbWithAll.all;
      dbWithAll.all = async (sql: string, params: unknown[] = []) => {
        originalAll(sql, params);
        return mockFiles;
      };

      const result = await getProjectFiles(dbWithAll, 'proj-1');
      expect(result).toEqual(mockFiles);
      expect(dbWithAll.allCalls[0].params).toEqual(['proj-1']);
    });
  });

  describe('deleteProjectFile', () => {
    it('deletes file by id', async () => {
      await deleteProjectFile(db, 'file-1');
      expect(db.runCalls).toHaveLength(1);
      expect(db.runCalls[0].sql).toBe('DELETE FROM project_files WHERE id = ?');
    });
  });

  describe('getProjectFile', () => {
    it('queries file by id', async () => {
      const mockFile: ProjectFile = {
        id: 'file-1',
        projectId: 'p',
        filename: 'a.txt',
        mimeType: 'text/plain',
        path: '/a',
        sizeBytes: 10,
        createdAt: 1,
      };
      const dbWithGet = createMockDb();
      dbWithGet.get = () => Promise.resolve(mockFile);
      const result = await getProjectFile(dbWithGet, 'file-1');
      expect(result).toEqual(mockFile);
    });
  });

  describe('deleteAllProjectFiles', () => {
    it('deletes all files for a project', async () => {
      await deleteAllProjectFiles(db, 'proj-1');
      expect(db.runCalls).toHaveLength(1);
      expect(db.runCalls[0].sql).toBe('DELETE FROM project_files WHERE project_id = ?');
      expect(db.runCalls[0].params).toEqual(['proj-1']);
    });
  });

  describe('getProjectWithFiles', () => {
    it('returns project with its files', async () => {
      const mockProject: Project = {
        id: 'p', name: 'Test', instructions: null, settings: null, createdAt: 1, updatedAt: 1,
      };
      const mockFiles: ProjectFile[] = [
        { id: '1', projectId: 'p', filename: 'a.txt', mimeType: 'text/plain', path: '/a', sizeBytes: 10, createdAt: 1 },
      ];

      const dbWithMethods = createMockDb();
      const originalGet = dbWithMethods.get;
      dbWithMethods.get = async (sql: string, params: unknown[] = []) => {
        originalGet(sql, params);
        return mockProject;
      };
      const originalAll = dbWithMethods.all;
      dbWithMethods.all = async (sql: string, params: unknown[] = []) => {
        originalAll(sql, params);
        return mockFiles;
      };

      const result = await getProjectWithFiles(dbWithMethods, 'proj-1');
      expect(result.project).toEqual(mockProject);
      expect(result.files).toEqual(mockFiles);
    });
  });
});