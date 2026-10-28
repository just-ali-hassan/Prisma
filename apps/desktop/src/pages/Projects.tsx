import { Plus, Folder, FolderPlus } from 'lucide-react';
import { useState } from 'react';

export function Projects() {
  const [showCreate, setShowCreate] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');

  const projects = [
    { id: '1', name: 'Web Development', updatedAt: Date.now() - 3600000, conversationCount: 5 },
    { id: '2', name: 'Learning Rust', updatedAt: Date.now() - 86400000, conversationCount: 3 },
  ];

  const handleCreate = () => {
    if (!newProjectName.trim()) return;
    console.log('Create project:', newProjectName);
    setNewProjectName('');
    setShowCreate(false);
  };

  return (
    <div className="h-full flex flex-col">
      <div className="p-4 border-b border-border flex items-center justify-between">
        <h1 className="text-xl font-semibold text-text-primary">Projects</h1>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 px-4 py-2 bg-accent-primary text-accent-primary-text rounded-md text-sm font-medium hover:bg-accent-primary-hover transition-colors"
        >
          <FolderPlus width="18" height="18" />
          New Project
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-4">
        <div className="max-w-3xl mx-auto space-y-4">
          {projects.map((project) => (
            <div
              key={project.id}
              className="p-4 bg-surface border border-border rounded-lg hover:border-border-hover transition-colors"
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-accent-primary/10 rounded-lg">
                    <Folder className="w-5 h-5 text-accent-primary" />
                  </div>
                  <div>
                    <h3 className="font-medium text-text-primary">{project.name}</h3>
                    <p className="text-sm text-text-tertiary mt-0.5">
                      {project.conversationCount} conversations · Updated{' '}
                      {new Date(project.updatedAt).toLocaleDateString()}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    className="p-2 rounded-lg hover:bg-surface-hover text-text-secondary transition-colors"
                    aria-label="Open project"
                  >
                    <span className="sr-only">Open</span>
                    <svg
                      width="18"
                      height="18"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <path d="M9 18l6-6-6-6" />
                    </svg>
                  </button>
                  <button
                    className="p-2 rounded-lg hover:bg-surface-hover text-text-secondary transition-colors"
                    aria-label="Delete project"
                  >
                    <svg
                      width="18"
                      height="18"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <polyline points="3 6 5 6 21 6" />
                      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                    </svg>
                  </button>
                </div>
              </div>
            </div>
          ))}
          {projects.length === 0 && (
            <div className="text-center py-12 text-text-secondary">
              <Folder className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>No projects yet</p>
              <p className="text-sm mt-1">Create a project to organize related chats</p>
            </div>
          )}
        </div>
      </div>

      {/* Create project modal */}
      {showCreate && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setShowCreate(false)}
        >
          <div
            className="bg-surface rounded-lg p-6 w-full max-w-md"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-semibold text-text-primary mb-4">Create Project</h2>
            <input
              type="text"
              value={newProjectName}
              onChange={(e) => setNewProjectName(e.target.value)}
              placeholder="Project name"
              className="w-full px-4 py-2 bg-background border border-border rounded-lg text-base focus:border-accent-primary focus:ring-2 focus:ring-accent-primary/20 outline-none mb-4"
              autoFocus
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowCreate(false)}
                className="px-4 py-2 border border-border rounded-md text-sm font-medium text-text-primary hover:bg-surface-hover transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleCreate}
                disabled={!newProjectName.trim()}
                className="px-4 py-2 bg-accent-primary text-accent-primary-text rounded-md text-sm font-medium hover:bg-accent-primary-hover transition-colors disabled:opacity-50"
              >
                Create
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
