import { NavLink, useLocation } from 'react-router-dom';
import { MessageSquare, History, Folder, Settings, Bot } from 'lucide-react';

const navigation = [
  { name: 'Chat', href: '/chat', icon: MessageSquare },
  { name: 'History', href: '/history', icon: History },
  { name: 'Projects', href: '/projects', icon: Folder },
  { name: 'Agents', href: '/agents', icon: Bot },
  { name: 'Settings', href: '/settings', icon: Settings },
];

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

export function Sidebar({ isOpen, onClose }: SidebarProps) {
  const location = useLocation();

  return (
    <>
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={onClose}
          aria-hidden="true"
        />
      )}
      <aside
        className={`fixed lg:static inset-y-0 left-0 z-50 w-64 bg-surface border-r border-border transition-transform duration-250 ease-in-out flex flex-col ${isOpen ? 'translate-x-0' : '-translate-x-full'} lg:translate-x-0`}
        aria-label="Main navigation"
      >
        <div className="flex items-center justify-between h-12 px-4 border-b border-border">
          <h1 className="text-xl font-semibold text-text-primary">Prisma</h1>
          <button
            onClick={onClose}
            className="lg:hidden p-2 rounded-md hover:bg-surface-hover text-text-secondary"
            aria-label="Close menu"
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
        <nav className="flex-1 py-4 px-2 overflow-y-auto" role="navigation" aria-label="Main">
          <ul className="space-y-1" role="list">
            {navigation.map((item) => {
              const isActive = location.pathname === item.href;
              const Icon = item.icon;
              return (
                <li key={item.name}>
                  <NavLink
                    to={item.href}
                    onClick={onClose}
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors ${
                      isActive
                        ? 'bg-accent-primary text-accent-primary-text'
                        : 'text-text-secondary hover:bg-surface-hover hover:text-text-primary'
                    }`}
                    aria-current={isActive ? 'page' : undefined}
                  >
                    <Icon width="20" height="20" aria-hidden="true" />
                    {item.name}
                  </NavLink>
                </li>
              );
            })}
          </ul>
        </nav>
        <div className="p-4 border-t border-border">
          <p className="text-xs text-text-tertiary">Version 0.0.0</p>
        </div>
      </aside>
    </>
  );
}
