import { Menu, LogOut, Hammer } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';
import NotificationBell from '../ui/NotificationBell';
import GlobalSearch from '../ui/GlobalSearch';
import SetupFinder from '../ui/SetupFinder';
import PersonalizePanel from './PersonalizePanel';

export default function Header({ onMenuClick }) {
  const { employee, logout, isAdmin } = useAuthStore();
  const navigate = useNavigate();

  return (
    <header className="material h-14 shrink-0 flex items-center justify-between px-5 border-b z-10 transition-colors duration-200">
      <div className="flex items-center gap-3">
        <button
          onClick={onMenuClick}
          className="lg:hidden p-1.5 rounded-lg text-gray-400 dark:text-white/40 hover:bg-gray-100 dark:hover:bg-white/10 hover:text-gray-600 transition-colors"
          aria-label="Open navigation"
        >
          <Menu className="h-5 w-5" />
        </button>
        {/* Two finders, deliberately: GlobalSearch searches records (what the
            business does), SetupFinder searches configuration (how it is set
            up). Merging them would put "Acme Corp" and "Assignment Rules" in
            one list, where the useful ranking for one is wrong for the other.
            SetupFinder renders nothing for a viewer who can configure nothing. */}
        <GlobalSearch />
        <SetupFinder />
      </div>

      <div className="flex items-center gap-2">
        {isAdmin() && (
          <button
            onClick={() => navigate('/builder')}
            className="hidden sm:inline-flex items-center gap-1.5 h-8 px-3 rounded-lg text-xs font-semibold pressable
                       text-primary-600 dark:text-white/40 hover:text-primary-700 dark:hover:text-white/70 bg-primary-50/70 hover:bg-primary-100 dark:bg-transparent dark:hover:bg-white/10 transition-all duration-150"
          >
            <Hammer className="h-3.5 w-3.5" />
            Builder
          </button>
        )}

        <NotificationBell />

        {/* Per-user appearance: light/dark, text size, motion — within what the organisation allows */}
        <PersonalizePanel />

        <div className="h-4 w-px bg-gray-200 dark:bg-white/10 hidden sm:block" />

        <div className="flex items-center gap-2.5">
          <div className="text-right hidden sm:block">
            <p className="text-[13px] font-medium text-gray-700 dark:text-white/80 leading-tight">{employee?.employee_name}</p>
            <p className="text-[11px] text-gray-400 dark:text-white/35 leading-tight capitalize">{employee?.role?.replaceAll('_', ' ')}</p>
          </div>
          <div className="h-8 w-8 rounded-full bg-gradient-to-br from-primary-500 via-mid to-accent-500 flex items-center justify-center text-on-primary text-xs font-semibold uppercase shrink-0 ring-2 ring-white/70 dark:ring-white/10 shadow-primary transition-transform hover:scale-105">
            {employee?.employee_name?.[0] || '?'}
          </div>
        </div>

        <button
          onClick={logout}
          className="p-1.5 rounded-lg text-gray-400 dark:text-white/40 hover:text-gray-600 dark:hover:text-white/70 hover:bg-gray-100 dark:hover:bg-white/10 transition-colors"
          title="Sign out"
          aria-label="Sign out"
        >
          <LogOut className="h-4 w-4" />
        </button>
      </div>
    </header>
  );
}
